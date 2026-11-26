use bagflow_core::collect::{CollectOptions, Collected, NO_TIME};
use bagflow_core::engine2::{inspection_ms, run_collected, run_with, Policy, RunStats, Strategy};
use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_core::network::airport_network;
use bagflow_core::scenarios::{build, Setup};
use bagflow_core::soa::BagSoA;
use bagflow_core::types::{NodeKind, Scenario};

const SEED: u64 = 42;
const ALL_ON: CollectOptions = CollectOptions { history: true, sample_interval_ms: Some(60_000) };
const ALL_OFF: CollectOptions = CollectOptions { history: false, sample_interval_ms: None };

fn dataset(n: usize) -> BagSoA {
    generate_par(&GenConfig { seed: SEED, target_bags: n }, 4).1
}

/// Same capacity scaling as the API.
fn setup(sc: Scenario, base: &BagSoA, pct: u32) -> Setup {
    let (mut nodes, edges) = airport_network(1);
    for nd in nodes.iter_mut() {
        nd.servers = ((nd.servers as u32 * pct / 100).max(1)) as u16;
    }
    build(sc, base, &nodes, &edges, SEED)
}

fn plain(s: &Setup, st: Strategy) -> RunStats {
    run_with(&s.bags, &s.nodes, &s.edges, st, Policy::Fcfs, SEED, &s.outages)
}

fn collected(s: &Setup, st: Strategy, opts: CollectOptions) -> (RunStats, Collected) {
    run_collected(&s.bags, &s.nodes, &s.edges, st, Policy::Fcfs, SEED, &s.outages, opts, None)
}

fn assert_same_stats(a: &RunStats, b: &RunStats) {
    assert_eq!(
        (a.n, a.loaded, a.delayed, a.unfinished, a.tight_total, a.tight_delayed, a.checksum),
        (b.n, b.loaded, b.delayed, b.unfinished, b.tight_total, b.tight_delayed, b.checksum)
    );
    assert_eq!((a.mean_sojourn_s, a.p95_sojourn_s), (b.mean_sojourn_s, b.p95_sojourn_s));
    assert_eq!((&a.arrivals, &a.max_queue), (&b.arrivals, &b.max_queue));
    assert_eq!((&a.avg_wait_s, &a.util), (&b.avg_wait_s, &b.util));
}

/// The regression baseline (docs/AUDIT.md 5.5), with collection off and on.
#[test]
fn baseline_checksums_unchanged_with_collection_off_and_on() {
    let base = dataset(250_000);
    assert_eq!((base.len(), base.checksum()), (250_086, 0x168e0a37b06224f9));
    let cases = [
        (Scenario::Normal, Strategy::Dijkstra, 100, 9_245, "3.697", 0x61aa19cce7723683u64),
        (Scenario::SorterOverload, Strategy::Ecmp, 100, 28_606, "11.438", 0x144494908f029748),
        (Scenario::Normal, Strategy::Congestion, 70, 134_427, "53.752", 0x29e8786b1e8e3fae),
    ];
    for (sc, st, pct, delayed, rate, checksum) in cases {
        let s = setup(sc, &base, pct);
        let off = plain(&s, st);
        let (none, _) = collected(&s, st, ALL_OFF);
        let (on, _) = collected(&s, st, ALL_ON);
        for r in [&off, &none, &on] {
            assert_eq!(r.checksum, checksum, "{sc:?}/{st:?}/{pct}%: {:016x}", r.checksum);
            assert_eq!(r.delayed, delayed);
            assert_eq!(format!("{:.3}", 100.0 * r.delayed as f64 / r.n as f64), rate);
        }
        assert_same_stats(&off, &none);
        assert_same_stats(&off, &on);
        println!("{sc:?}/{st:?}/{pct}%: delayed {rate}% off={:016x} on={:016x}", off.checksum, on.checksum);
    }
}

/// Collection must not change results under outages or any routing and policy.
#[test]
fn collection_changes_nothing_in_any_scenario() {
    let base = dataset(20_000);
    for sc in bagflow_core::scenarios::ALL {
        let s = setup(sc, &base, 20);
        for st in Strategy::ALL {
            for p in Policy::ALL {
                let a = run_with(&s.bags, &s.nodes, &s.edges, st, p, SEED, &s.outages);
                let (b, _) = run_collected(&s.bags, &s.nodes, &s.edges, st, p, SEED, &s.outages, ALL_ON, None);
                assert_same_stats(&a, &b);
            }
        }
    }
}

#[test]
fn histories_reproduce_the_run() {
    let base = dataset(20_000);
    let s = setup(Scenario::ConveyorFailure, &base, 30);
    let (r, c) = collected(&s, Strategy::Congestion, ALL_ON);
    let h = c.history.unwrap();
    assert_eq!(h.bags(), s.bags.len());

    let mut finish_hash: u64 = 0xcbf29ce484222325;
    let mut delayed = 0u64;
    let mut visits = vec![0u64; s.nodes.len()];
    let mut traffic = vec![0u64; s.edges.len()];
    for bag in 0..h.bags() {
        let route: Vec<_> = h.route(bag).collect();
        assert_eq!(route.len(), 5);
        assert_eq!(route[0].0, 0);
        assert_eq!(route[0].1.arrive_ms as u64, s.bags.arrival_s[bag] as u64 * 1000);
        assert_eq!(route[4].0 as u32, 7 + s.bags.flight[bag] % 3);
        for (node, hop) in &route {
            visits[*node as usize] += 1;
            assert!(hop.end_ms != NO_TIME && hop.arrive_ms <= hop.start_ms && hop.start_ms < hop.end_ms);
        }
        for w in route.windows(2) {
            let e = s.edges.iter().position(|e| (e.from, e.to) == (w[0].0 as u16, w[1].0 as u16)).unwrap();
            assert_eq!(w[1].1.arrive_ms, w[0].1.end_ms + s.edges[e].travel_ms);
            traffic[e] += 1;
        }
        let f = route[4].1.end_ms as u64;
        delayed += (f > s.bags.deadline_s[bag] as u64 * 1000) as u64;
        for b in f.to_le_bytes() {
            finish_hash = (finish_hash ^ b as u64).wrapping_mul(0x100000001b3);
        }
    }
    assert_eq!(finish_hash, r.checksum);
    assert_eq!(delayed, r.delayed);
    assert_eq!(visits, r.arrivals);
    assert_eq!(traffic, c.edge_traffic);
    for (n, hist) in c.wait_hist.iter().enumerate() {
        assert_eq!(hist.iter().sum::<u64>(), r.arrivals[n]);
    }
    assert_eq!(h.bytes(), s.bags.len() * 66); // 5 node bytes + 5 x 12-byte hops + 1 length byte
}

#[test]
fn series_matches_the_histories() {
    let base = dataset(20_000);
    let s = setup(Scenario::Normal, &base, 20);
    let (r, c) = collected(&s, Strategy::Dijkstra, ALL_ON);
    let (h, series) = (c.history.unwrap(), c.series.unwrap());
    assert!(series.len() > 100);
    assert!(series.times_ms.windows(2).all(|w| w[0] < w[1]));
    let regular = &series.times_ms[..series.len() - 1];
    assert!(regular.windows(2).all(|w| w[1] - w[0] == 60_000));

    let hops: Vec<_> = (0..h.bags()).flat_map(|b| h.route(b).collect::<Vec<_>>()).collect();
    let mut queued_somewhere = false;
    // every 37th sample, recounted from scratch
    for i in (0..series.len()).step_by(37) {
        let t = series.times_ms[i];
        for (n, got) in series.at(i).iter().enumerate() {
            let at_node = || hops.iter().filter(move |(x, _)| *x as usize == n).map(|(_, hop)| *hop);
            let arrivals = at_node().filter(|x| x.arrive_ms as u64 <= t).count() as u32;
            let started = at_node().filter(|x| x.start_ms as u64 <= t).count() as u32;
            let completions = at_node().filter(|x| x.end_ms as u64 <= t).count() as u32;
            assert_eq!((got.arrivals, got.completions), (arrivals, completions), "sample {i} node {n}");
            assert_eq!(got.queue, arrivals - started, "sample {i} node {n}");
            assert_eq!(got.busy as u32, started - completions, "sample {i} node {n}");
            assert_eq!(got.capacity, s.nodes[n].servers);
            queued_somewhere |= got.queue > 0;
        }
    }
    assert!(queued_somewhere);
    for (n, last) in series.at(series.len() - 1).iter().enumerate() {
        assert_eq!((last.queue, last.busy), (0, 0));
        assert_eq!((last.arrivals as u64, last.completions as u64), (r.arrivals[n], r.arrivals[n]));
    }
}

#[test]
fn series_shows_the_capacity_outage() {
    let base = dataset(20_000);
    let s = setup(Scenario::ScreeningDelay, &base, 100);
    let (_, c) = collected(&s, Strategy::Congestion, ALL_ON);
    let series = c.series.unwrap();
    let o = s.outages[0];
    let (mut reduced, mut normal) = (0, 0);
    for i in 0..series.len() {
        let t = series.times_ms[i];
        // a sample at T includes the events at T
        let inside = t >= o.start_s as u64 * 1000 && t < o.end_s as u64 * 1000;
        let cap = series.at(i)[2].capacity;
        assert_eq!(cap, if inside { 4 } else { 10 }, "t={t}");
        if inside { reduced += 1 } else { normal += 1 }
    }
    assert!(reduced > 0 && normal > 0);
}

#[test]
fn inspection_time_is_recoverable() {
    let base = dataset(20_000);
    let s = setup(Scenario::Normal, &base, 100);
    let (_, c) = collected(&s, Strategy::Dijkstra, ALL_ON);
    let h = c.history.unwrap();
    let (mut held, mut screened) = (0usize, 0usize);
    for bag in 0..h.bags() {
        for (node, hop) in h.route(bag) {
            let kind = s.nodes[node as usize].kind;
            let hold = inspection_ms(SEED, bag as u32, kind);
            if kind != NodeKind::Screening {
                assert!(hold.is_none());
                continue;
            }
            screened += 1;
            if let Some(ms) = hold {
                held += 1;
                // the service time includes the inspection time
                assert!((hop.end_ms - hop.start_ms) as f64 >= ms.floor());
            }
        }
    }
    let share = held as f64 / screened as f64;
    assert!((0.04..0.06).contains(&share), "held share {share}");
}

#[test]
fn options_off_collects_no_history_or_series() {
    let base = dataset(5_000);
    let s = setup(Scenario::Normal, &base, 100);
    let (_, c) = collected(&s, Strategy::Ecmp, ALL_OFF);
    assert!(c.history.is_none() && c.series.is_none());
}

#[test]
fn progress_rises_to_the_total_and_changes_nothing() {
    let base = dataset(50_000);
    let s = setup(Scenario::Normal, &base, 100);
    let mut seen: Vec<(u64, u64)> = Vec::new();
    let mut record = |done: u64, total: u64| seen.push((done, total));
    let (r, _) = run_collected(&s.bags, &s.nodes, &s.edges, Strategy::Ecmp, Policy::Fcfs, SEED, &s.outages, ALL_OFF, Some(&mut record));
    assert_same_stats(&r, &plain(&s, Strategy::Ecmp));
    assert!(seen.len() > 2);
    assert!(seen.windows(2).all(|w| w[0].0 <= w[1].0));
    assert_eq!(*seen.last().unwrap(), (s.bags.len() as u64, s.bags.len() as u64));
}
