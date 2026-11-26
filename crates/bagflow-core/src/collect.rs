//! Optional observation of an `engine2` run: bag histories, node time-series,
//! waiting-time histograms and edge traffic.
//!
//! Observation only. Nothing here schedules events, draws random numbers or feeds
//! back into the simulation, so results are the same with collection on or off.

use crate::types::{Edge, Node};

/// Marks a hop slot or time that was never filled.
pub const NO_NODE: u8 = u8::MAX;
pub const NO_TIME: u32 = u32::MAX;

/// Upper bounds (ms, inclusive) of the waiting-time bins. The first bin is "did not wait".
/// A last, open-ended bin follows the final bound.
pub const WAIT_BOUNDS_MS: [u64; 10] = [0, 1_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000];
pub const WAIT_BINS: usize = WAIT_BOUNDS_MS.len() + 1;

#[derive(Clone, Copy, Debug)]
pub struct CollectOptions {
    /// Keep the hop history of every bag.
    pub history: bool,
    /// Node time-series spacing in simulation ms. `None` turns the series off.
    pub sample_interval_ms: Option<u64>,
}

/// One visit to one node. Times are simulation ms since midnight of the dataset day.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Hop {
    pub arrive_ms: u32,
    pub start_ms: u32,
    pub end_ms: u32,
}

const EMPTY_HOP: Hop = Hop { arrive_ms: NO_TIME, start_ms: NO_TIME, end_ms: NO_TIME };

/// Hop records for every bag, `stride` slots per bag (the longest path in the network).
#[derive(Debug, PartialEq, Eq)]
pub struct History {
    stride: usize,
    nodes: Vec<u8>,
    hops: Vec<Hop>,
    len: Vec<u8>,
}

impl History {
    fn new(bags: usize, stride: usize) -> Self {
        History { stride, nodes: vec![NO_NODE; bags * stride], hops: vec![EMPTY_HOP; bags * stride], len: vec![0; bags] }
    }

    pub fn bags(&self) -> usize {
        self.len.len()
    }

    /// The bag's visits in order, as (node id, hop).
    pub fn route(&self, bag: usize) -> impl Iterator<Item = (u8, Hop)> + '_ {
        let a = bag * self.stride;
        let b = a + self.len[bag] as usize;
        self.nodes[a..b].iter().copied().zip(self.hops[a..b].iter().copied())
    }

    /// Heap bytes held by the records (computed from buffer sizes, not measured).
    pub fn bytes(&self) -> usize {
        self.nodes.len() + self.hops.len() * std::mem::size_of::<Hop>() + self.len.len()
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct NodeSample {
    pub queue: u32,
    /// Can exceed `capacity` just after an outage starts: bags in service finish.
    pub busy: u16,
    pub capacity: u16,
    /// Cumulative since the start of the run.
    pub arrivals: u32,
    /// Cumulative since the start of the run.
    pub completions: u32,
}

/// State of every node at each sample time. A sample at time T includes all events at T.
#[derive(Debug, Default)]
pub struct Series {
    pub interval_ms: u64,
    pub times_ms: Vec<u64>,
    node_count: usize,
    samples: Vec<NodeSample>,
}

impl Series {
    /// The samples at index `i`, one per node, indexed by node id.
    pub fn at(&self, i: usize) -> &[NodeSample] {
        &self.samples[i * self.node_count..(i + 1) * self.node_count]
    }
    pub fn len(&self) -> usize {
        self.times_ms.len()
    }
    pub fn is_empty(&self) -> bool {
        self.times_ms.is_empty()
    }
}

#[derive(Debug)]
pub struct Collected {
    pub history: Option<History>,
    pub series: Option<Series>,
    /// Per node, count of service starts in each waiting-time bin.
    pub wait_hist: Vec<[u64; WAIT_BINS]>,
    /// Bags sent along each edge, indexed like the `edges` slice.
    pub edge_traffic: Vec<u64>,
}

/// Longest path, in nodes, through the (acyclic) network.
fn longest_path(nodes: &[Node], edges: &[Edge]) -> usize {
    let mut depth = vec![1usize; nodes.len()];
    for _ in 0..nodes.len() {
        let mut changed = false;
        for e in edges.iter().filter(|e| e.online) {
            let d = depth[e.from as usize] + 1;
            if d > depth[e.to as usize] {
                depth[e.to as usize] = d;
                changed = true;
            }
        }
        if !changed {
            return depth.into_iter().max().unwrap_or(0);
        }
    }
    panic!("collection needs an acyclic network");
}

fn ms32(t: u64) -> u32 {
    assert!(t < NO_TIME as u64, "simulation time {t} ms does not fit a history record");
    t as u32
}

/// Live collector owned by the engine while it runs.
pub(crate) struct Collector {
    out: Collected,
    completions: Vec<u32>,
    next_sample_ms: Option<u64>,
}

impl Collector {
    pub(crate) fn new(opts: CollectOptions, bags: usize, first_ms: u64, nodes: &[Node], edges: &[Edge]) -> Self {
        let history = opts.history.then(|| {
            assert!(nodes.len() < NO_NODE as usize, "history stores node ids in one byte");
            let stride = longest_path(nodes, edges);
            History::new(bags, stride)
        });
        let series = opts.sample_interval_ms.map(|iv| {
            assert!(iv > 0, "sample interval must be positive");
            Series { interval_ms: iv, node_count: nodes.len(), ..Default::default() }
        });
        Collector {
            next_sample_ms: opts.sample_interval_ms.map(|iv| first_ms / iv * iv),
            completions: vec![0; nodes.len()],
            out: Collected {
                history,
                series,
                wait_hist: vec![[0; WAIT_BINS]; nodes.len()],
                edge_traffic: vec![0; edges.len()],
            },
        }
    }

    pub(crate) fn arrive(&mut self, t: u64, bag: u32, node: usize) {
        if let Some(h) = &mut self.out.history {
            let b = bag as usize;
            let k = h.len[b] as usize;
            assert!(k < h.stride, "bag {bag} visited more nodes than the longest path");
            let i = b * h.stride + k;
            h.nodes[i] = node as u8;
            h.hops[i].arrive_ms = ms32(t);
            h.len[b] += 1;
        }
    }

    pub(crate) fn start(&mut self, t: u64, bag: u32, node: usize, dur: u32, waited_ms: u64) {
        let bin = WAIT_BOUNDS_MS.iter().position(|&u| waited_ms <= u).unwrap_or(WAIT_BINS - 1);
        self.out.wait_hist[node][bin] += 1;
        if let Some(h) = &mut self.out.history {
            let b = bag as usize;
            let hop = &mut h.hops[b * h.stride + h.len[b] as usize - 1];
            hop.start_ms = ms32(t);
            hop.end_ms = ms32(t + dur as u64);
        }
    }

    pub(crate) fn complete(&mut self, node: usize) {
        self.completions[node] += 1;
    }

    pub(crate) fn edge(&mut self, edge: usize) {
        self.out.edge_traffic[edge] += 1;
    }

    /// The next sample time strictly before `t`, if one is due.
    pub(crate) fn due_before(&self, t: u64) -> Option<u64> {
        self.next_sample_ms.filter(|&s| s < t)
    }

    /// Append one sample. `state(n)` returns (queue, busy, capacity, arrivals) for node n.
    pub(crate) fn sample(&mut self, at_ms: u64, state: impl Fn(usize) -> (u32, u16, u16, u64)) {
        let Some(s) = &mut self.out.series else { return };
        s.times_ms.push(at_ms);
        for (n, &completions) in self.completions.iter().enumerate() {
            let (queue, busy, capacity, arrivals) = state(n);
            s.samples.push(NodeSample { queue, busy, capacity, arrivals: arrivals as u32, completions });
        }
        self.next_sample_ms = Some(at_ms + s.interval_ms);
    }

    pub(crate) fn finish(self) -> Collected {
        self.out
    }
}
