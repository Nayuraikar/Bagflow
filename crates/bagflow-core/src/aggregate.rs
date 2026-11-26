//! Per-node and per-outcome aggregation of the bag histories of a finished run, as a
//! sequential fold and as a chunked parallel reduction. All sums are integers, so
//! both give identical results whatever the order of the merges.

use crate::collect::{History, NO_TIME, WAIT_BINS, WAIT_BOUNDS_MS};
use crate::soa::BagSoA;
use crate::trace::{self, Stage, Task};
use crate::types::{Node, NodeKind};
use rayon::prelude::*;
use std::ops::Range;
use std::time::Instant;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NodeAgg {
    pub visits: u64,
    pub wait_ms: u64,
    pub service_ms: u64,
    pub max_wait_ms: u64,
    pub wait_hist: [u64; WAIT_BINS],
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Aggregate {
    pub nodes: Vec<NodeAgg>,
    pub loaded_on_time: u64,
    pub delayed: u64,
    pub unfinished: u64,
    /// Arrival to end of loading, over finished bags.
    pub sojourn_ms: u64,
}

#[derive(Clone, Copy)]
pub struct Input<'a> {
    pub history: &'a History,
    pub bags: &'a BagSoA,
    pub nodes: &'a [Node],
}

impl Aggregate {
    pub fn empty(nodes: usize) -> Aggregate {
        Aggregate { nodes: vec![NodeAgg::default(); nodes], loaded_on_time: 0, delayed: 0, unfinished: 0, sojourn_ms: 0 }
    }

    fn fold(&mut self, input: Input, bags: Range<usize>) {
        for bag in bags {
            let mut finish = None;
            for (n, h) in input.history.route(bag) {
                let node = &mut self.nodes[n as usize];
                node.visits += 1;
                if h.start_ms == NO_TIME {
                    continue; // still queued when the run ended
                }
                let wait = (h.start_ms - h.arrive_ms) as u64;
                node.wait_ms += wait;
                node.service_ms += (h.end_ms - h.start_ms) as u64;
                node.max_wait_ms = node.max_wait_ms.max(wait);
                let bin = WAIT_BOUNDS_MS.iter().position(|&u| wait <= u).unwrap_or(WAIT_BINS - 1);
                node.wait_hist[bin] += 1;
                if input.nodes[n as usize].kind == NodeKind::Loading {
                    finish = Some(h.end_ms as u64);
                }
            }
            match finish {
                None => self.unfinished += 1,
                Some(f) => {
                    if f <= input.bags.deadline_s[bag] as u64 * 1000 {
                        self.loaded_on_time += 1;
                    } else {
                        self.delayed += 1;
                    }
                    self.sojourn_ms += f - input.bags.arrival_s[bag] as u64 * 1000;
                }
            }
        }
    }

    pub fn merge(mut self, other: &Aggregate) -> Aggregate {
        for (a, b) in self.nodes.iter_mut().zip(&other.nodes) {
            a.visits += b.visits;
            a.wait_ms += b.wait_ms;
            a.service_ms += b.service_ms;
            a.max_wait_ms = a.max_wait_ms.max(b.max_wait_ms);
            for (x, y) in a.wait_hist.iter_mut().zip(&b.wait_hist) {
                *x += y;
            }
        }
        self.loaded_on_time += other.loaded_on_time;
        self.delayed += other.delayed;
        self.unfinished += other.unfinished;
        self.sojourn_ms += other.sojourn_ms;
        self
    }

    /// FNV-1a over every field.
    pub fn checksum(&self) -> u64 {
        let mut h: u64 = 0xcbf29ce484222325;
        let mut mix = |v: u64| {
            for b in v.to_le_bytes() {
                h ^= b as u64;
                h = h.wrapping_mul(0x100000001b3);
            }
        };
        for n in &self.nodes {
            [n.visits, n.wait_ms, n.service_ms, n.max_wait_ms].into_iter().for_each(&mut mix);
            n.wait_hist.iter().copied().for_each(&mut mix);
        }
        [self.loaded_on_time, self.delayed, self.unfinished, self.sojourn_ms].into_iter().for_each(&mut mix);
        h
    }
}

/// The baseline: one pass over all bags.
pub fn sequential(input: Input) -> Aggregate {
    let mut out = Aggregate::empty(input.nodes.len());
    out.fold(input, 0..input.history.bags());
    out
}

fn chunk_range(i: usize, chunk: usize, n: usize) -> Range<usize> {
    i * chunk..((i + 1) * chunk).min(n)
}

/// The baseline in chunk-sized steps on the calling thread, with a record per step.
pub fn sequential_traced(input: Input, chunk: usize, t0: Instant) -> (Aggregate, Vec<Task>) {
    assert!(chunk > 0);
    let n = input.history.bags();
    let mut out = Aggregate::empty(input.nodes.len());
    let tasks = (0..n.div_ceil(chunk))
        .map(|i| {
            trace::task(t0, i, || {
                let r = chunk_range(i, chunk, n);
                let size = r.len() as u64;
                out.fold(input, r);
                (size, ())
            })
            .0
        })
        .collect();
    (out, tasks)
}

pub struct Parallel {
    pub result: Aggregate,
    pub tasks: Vec<Task>,
    /// Combining the per-chunk partial results, on one thread.
    pub merge: Stage,
}

/// Each chunk builds its own partial aggregate on `pool`; the partials are then merged.
pub fn parallel(pool: &rayon::ThreadPool, input: Input, chunk: usize, t0: Instant) -> Parallel {
    assert!(chunk > 0);
    let n = input.history.bags();
    let parts: Vec<(Task, Aggregate)> = pool.install(|| {
        (0..n.div_ceil(chunk))
            .into_par_iter()
            .with_max_len(1)
            .map(|i| {
                trace::task(t0, i, || {
                    let r = chunk_range(i, chunk, n);
                    let size = r.len() as u64;
                    let mut part = Aggregate::empty(input.nodes.len());
                    part.fold(input, r);
                    (size, part)
                })
            })
            .collect()
    });
    let mut stages = Vec::new();
    let result = trace::stage(&mut stages, t0, "merge", false, || {
        parts.iter().fold(Aggregate::empty(input.nodes.len()), |acc, p| acc.merge(&p.1))
    });
    Parallel { result, tasks: parts.into_iter().map(|p| p.0).collect(), merge: stages[0] }
}
