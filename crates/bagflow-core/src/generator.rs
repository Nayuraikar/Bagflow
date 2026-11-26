use crate::rng::{flight_rng, stream_rng, Stream};
use crate::soa::BagSoA;
use crate::trace::{self, Stage, Task};
use crate::types::*;
use rand::Rng;
use rand_chacha::ChaCha8Rng;
use rand_distr::{Beta, Distribution, LogNormal, Normal};
use std::time::Instant;

pub struct GenConfig {
    pub seed: u64,
    pub target_bags: usize,
}

// (seats, probability)
const SEATS: [(u16, f64); 6] = [(76, 0.15), (150, 0.25), (180, 0.30), (220, 0.15), (300, 0.10), (350, 0.05)];
// departure banks: (centre in seconds since midnight, weight). Morning and evening peaks, afternoon lull.
const BANKS: [(f64, f64); 6] = [
    (7.0 * 3600.0, 0.22),
    (9.5 * 3600.0, 0.16),
    (12.5 * 3600.0, 0.10),
    (15.0 * 3600.0, 0.08),
    (18.5 * 3600.0, 0.24),
    (21.0 * 3600.0, 0.20),
];
// bags per passenger
const BAG_COUNT: [(u8, f64); 4] = [(0, 0.22), (1, 0.55), (2, 0.20), (3, 0.03)];
const PRIO_ORIGIN: [(u8, f64); 2] = [(PRIO_STANDARD, 0.97), (PRIO_PRIORITY, 0.03)];
const PRIO_TRANSFER: [(u8, f64); 3] = [(PRIO_STANDARD, 0.80), (PRIO_TIGHT, 0.15), (PRIO_PRIORITY, 0.05)];

const TRANSFER_SHARE: f64 = 0.30;
const LATE_SHARE: f64 = 0.02;
const SPECIAL_SHARE: f64 = 0.02;

struct BagRec {
    arrival: u32,
    flight: u32,
    pax: u32,
    weight_dg: u16,
    priority: u8,
    flags: u8,
    deadline: u32,
}

fn pick_weighted<T: Copy>(rng: &mut ChaCha8Rng, items: &[(T, f64)]) -> T {
    let total: f64 = items.iter().map(|i| i.1).sum();
    let mut x = rng.gen::<f64>() * total;
    for (v, w) in items {
        if x < *w {
            return *v;
        }
        x -= *w;
    }
    items.last().unwrap().0
}

fn gen_flight(rng: &mut ChaCha8Rng, id: u32) -> Flight {
    let centre = pick_weighted(rng, &BANKS);
    let normal = Normal::new(centre, 45.0 * 60.0).unwrap();
    let dep = normal.sample(rng).clamp(4.0 * 3600.0, 86_000.0) as u32;
    let seats = pick_weighted(rng, &SEATS);
    Flight { id, departure_s: dep, seats }
}

fn gen_bags(master: u64, f: &Flight, out: &mut Vec<BagRec>) {
    let mut rng = flight_rng(master, Stream::Bags, f.id);
    let lf: f64 = Beta::new(16.0, 4.0).unwrap().sample(&mut rng); // mean 0.80
    let pax = ((f.seats as f64 * lf).round() as u32).min(f.seats as u32);
    let weight = LogNormal::new(17.0f64.ln(), 0.35).unwrap();
    let arrive_curve = Beta::new(4.0, 2.2).unwrap(); // mode about 0.71 of the window
    let dep = f.departure_s as i64;
    let open = dep - 180 * 60;
    let close = dep - 45 * 60;

    for p in 0..pax {
        let transfer = rng.gen_bool(TRANSFER_SHARE);
        let nbags = pick_weighted(&mut rng, &BAG_COUNT);
        if nbags == 0 {
            continue;
        }
        let mut base: i64 = if transfer {
            let lo = dep - 120 * 60;
            let hi = dep - 30 * 60;
            lo + (rng.gen::<f64>() * (hi - lo) as f64) as i64
        } else {
            open + (arrive_curve.sample(&mut rng) * (close - open) as f64) as i64
        };
        if !transfer && rng.gen_bool(LATE_SHARE) {
            base = close + rng.gen_range(0..900); // misses the cutoff by up to 15 min
        }
        let priority = if transfer {
            pick_weighted(&mut rng, &PRIO_TRANSFER)
        } else {
            pick_weighted(&mut rng, &PRIO_ORIGIN)
        };
        let deadline = (dep - if transfer { 15 } else { 20 } * 60).max(0) as u32;
        let pax_id = f.id * 512 + p;

        for _ in 0..nbags {
            let arrival = (base + rng.gen_range(0..=20)).max(0) as u32; // bags of one passenger cluster
            let kg: f64 = weight.sample(&mut rng).clamp(3.0, 32.0);
            let mut flags = 0u8;
            if transfer {
                flags |= FLAG_TRANSFER;
            }
            if rng.gen_bool(SPECIAL_SHARE) {
                flags |= FLAG_SPECIAL;
            }
            out.push(BagRec {
                arrival,
                flight: f.id,
                pax: pax_id,
                weight_dg: (kg * 10.0).round() as u16,
                priority,
                flags,
                deadline,
            });
        }
    }
}

/// What a traced generator run did. Task sizes are bags produced.
#[derive(Debug, Default)]
pub struct GenTrace {
    pub tasks: Vec<Task>,
    pub stages: Vec<Stage>,
    /// Flights whose bags were generated; the last few can be surplus to the target.
    pub flights_computed: usize,
}

/// Generate flights until at least `target_bags` bags exist. Output is sorted by arrival time.
pub fn generate(cfg: &GenConfig) -> (Vec<Flight>, BagSoA) {
    let (flights, bags, _) = generate_traced(cfg, usize::MAX, Instant::now());
    (flights, bags)
}

/// The sequential generator, with a task record for every `chunk_flights` flights.
pub fn generate_traced(cfg: &GenConfig, chunk_flights: usize, t0: Instant) -> (Vec<Flight>, BagSoA, GenTrace) {
    assert!(chunk_flights > 0);
    let mut out = GenTrace::default();
    let mut frng = stream_rng(cfg.seed, Stream::Flights);
    let mut flights = Vec::new();
    let mut recs: Vec<BagRec> = Vec::with_capacity(cfg.target_bags + 1000);
    let mut id = 0u32;
    while recs.len() < cfg.target_bags {
        let (t, ()) = trace::task(t0, out.tasks.len(), || {
            let before = recs.len();
            let mut left = chunk_flights;
            while left > 0 && recs.len() < cfg.target_bags {
                let f = gen_flight(&mut frng, id);
                gen_bags(cfg.seed, &f, &mut recs);
                flights.push(f);
                id += 1;
                left -= 1;
            }
            ((recs.len() - before) as u64, ())
        });
        out.tasks.push(t);
    }
    out.flights_computed = flights.len();
    // stable sort, so deterministic
    trace::stage(&mut out.stages, t0, "sort", false, || recs.sort_by_key(|r| (r.arrival, r.flight, r.pax)));
    let soa = trace::stage(&mut out.stages, t0, "build_columns", false, || {
        let mut soa = BagSoA::default();
        for r in &recs {
            soa.push(r.pax, r.flight, r.weight_dg, r.priority, r.flags, r.arrival, r.deadline);
        }
        soa
    });
    (flights, soa, out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_is_identical() {
        let a = generate(&GenConfig { seed: 7, target_bags: 5_000 }).1;
        let b = generate(&GenConfig { seed: 7, target_bags: 5_000 }).1;
        assert_eq!(a.checksum(), b.checksum());
        assert_eq!(a, b);
    }

    #[test]
    fn different_seed_differs() {
        let a = generate(&GenConfig { seed: 7, target_bags: 5_000 }).1;
        let b = generate(&GenConfig { seed: 8, target_bags: 5_000 }).1;
        assert_ne!(a.checksum(), b.checksum());
    }

    #[test]
    fn reaches_target_and_columns_agree() {
        let (_, s) = generate(&GenConfig { seed: 1, target_bags: 20_000 });
        assert!(s.len() >= 20_000);
        assert_eq!(s.pax.len(), s.len());
        assert_eq!(s.deadline_s.len(), s.len());
    }

    #[test]
    fn bags_arrive_before_their_deadline_and_in_order() {
        let (_, s) = generate(&GenConfig { seed: 3, target_bags: 20_000 });
        for i in 0..s.len() {
            assert!(s.arrival_s[i] < s.deadline_s[i]);
            if i > 0 {
                assert!(s.arrival_s[i - 1] <= s.arrival_s[i]);
            }
            assert!((30..=320).contains(&s.weight_dg[i]));
        }
    }
}

// ---------------------------------------------------------------------------
// Parallel generator (Rayon). Must give the exact same output as `generate`.
// ---------------------------------------------------------------------------
use rayon::prelude::*;

/// Most flights drawn before their bags are generated.
const FLIGHT_BATCH: usize = 2048;
/// Starting guess for bags per flight, used only to size the first batch.
const BAGS_PER_FLIGHT_GUESS: usize = 150;
/// Flights per Rayon task in `generate_par`.
const CHUNK_FLIGHTS: usize = 16;

pub fn generate_par(cfg: &GenConfig, threads: usize) -> (Vec<Flight>, BagSoA) {
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(threads)
        .build()
        .unwrap();
    let (flights, bags, _) = generate_on(&pool, cfg, CHUNK_FLIGHTS, Instant::now());
    (flights, bags)
}

/// The parallel generator on an existing pool, with a task record per chunk of flights.
pub fn generate_on(pool: &rayon::ThreadPool, cfg: &GenConfig, chunk_flights: usize, t0: Instant) -> (Vec<Flight>, BagSoA, GenTrace) {
    assert!(chunk_flights > 0);
    pool.install(|| {
        let mut out = GenTrace::default();
        let mut frng = stream_rng(cfg.seed, Stream::Flights);
        let mut flights: Vec<Flight> = Vec::new();
        let mut recs: Vec<BagRec> = Vec::with_capacity(cfg.target_bags + 1000);
        let mut id = 0u32;

        while recs.len() < cfg.target_bags {
            // size the batch to what is still missing, so little work is thrown away.
            // The output does not depend on the batch size: flights come from one
            // stream in order, and surplus ones are dropped.
            let per_flight_bags = if flights.is_empty() { BAGS_PER_FLIGHT_GUESS } else { (recs.len() / flights.len()).max(1) };
            let batch_len = ((cfg.target_bags - recs.len()).div_ceil(per_flight_bags) + 1).min(FLIGHT_BATCH);

            // 1. flights are drawn sequentially (cheap, one shared stream)
            let batch: Vec<Flight> = trace::stage(&mut out.stages, t0, "draw_flights", false, || {
                (0..batch_len)
                    .map(|_| {
                        let f = gen_flight(&mut frng, id);
                        id += 1;
                        f
                    })
                    .collect()
            });

            // 2. bags per flight in parallel (each flight has its own RNG stream);
            //    collect() keeps flight order
            let first_id = out.tasks.len();
            let chunks: Vec<(Task, Vec<Vec<BagRec>>)> = trace::stage(&mut out.stages, t0, "generate_bags", true, || {
                batch
                    .par_chunks(chunk_flights)
                    .with_max_len(1)
                    .enumerate()
                    .map(|(i, part)| {
                        trace::task(t0, first_id + i, || {
                            let per_flight: Vec<Vec<BagRec>> = part
                                .iter()
                                .map(|f| {
                                    let mut v = Vec::new();
                                    gen_bags(cfg.seed, f, &mut v);
                                    v
                                })
                                .collect();
                            (per_flight.iter().map(|v| v.len() as u64).sum(), per_flight)
                        })
                    })
                    .collect()
            });
            out.flights_computed += batch.len();

            // 3. append in flight order, stopping exactly where the sequential version stops
            trace::stage(&mut out.stages, t0, "append", false, || {
                let per_flight = chunks.into_iter().flat_map(|(t, v)| {
                    out.tasks.push(t);
                    v
                });
                for (f, v) in batch.into_iter().zip(per_flight) {
                    if recs.len() >= cfg.target_bags {
                        continue; // still drain, so every task record is kept
                    }
                    recs.extend(v);
                    flights.push(f);
                }
            });
        }

        // stable parallel sort, same key as the sequential version
        trace::stage(&mut out.stages, t0, "sort", true, || recs.par_sort_by_key(|r| (r.arrival, r.flight, r.pax)));

        // build every column in parallel
        let soa = trace::stage(&mut out.stages, t0, "build_columns", true, || BagSoA {
            id: (0..recs.len() as u32).into_par_iter().collect(),
            pax: recs.par_iter().map(|r| r.pax).collect(),
            flight: recs.par_iter().map(|r| r.flight).collect(),
            weight_dg: recs.par_iter().map(|r| r.weight_dg).collect(),
            priority: recs.par_iter().map(|r| r.priority).collect(),
            flags: recs.par_iter().map(|r| r.flags).collect(),
            arrival_s: recs.par_iter().map(|r| r.arrival).collect(),
            deadline_s: recs.par_iter().map(|r| r.deadline).collect(),
        });
        (flights, soa, out)
    })
}

#[cfg(test)]
mod par_tests {
    use super::*;

    #[test]
    fn parallel_matches_sequential() {
        let cfg = GenConfig { seed: 11, target_bags: 30_000 };
        let (sf, ss) = generate(&cfg);
        for threads in [1, 2, 4] {
            let (pf, ps) = generate_par(&cfg, threads);
            assert_eq!(sf.len(), pf.len());
            assert_eq!(ss.checksum(), ps.checksum(), "threads = {threads}");
        }
    }

    #[test]
    fn traced_runs_match_and_cover_every_bag() {
        for target in [1, 150, 5_000, 330_000] {
            let cfg = GenConfig { seed: 11, target_bags: target };
            let (_, plain) = generate(&cfg);
            let (_, seq, st) = generate_traced(&cfg, 7, Instant::now());
            assert_eq!(plain.checksum(), seq.checksum(), "sequential, target {target}");
            assert_eq!(st.tasks.iter().map(|t| t.size).sum::<u64>(), seq.len() as u64);
            let pool = rayon::ThreadPoolBuilder::new().num_threads(3).build().unwrap();
            for chunk in [1, 13, 100_000] {
                let (flights, par, pt) = generate_on(&pool, &cfg, chunk, Instant::now());
                assert_eq!(plain.checksum(), par.checksum(), "target {target}, chunk {chunk}");
                // tasks include the surplus flights that were computed and dropped
                assert!(pt.tasks.iter().map(|t| t.size).sum::<u64>() >= par.len() as u64);
                assert!(pt.flights_computed >= flights.len());
                assert!(pt.tasks.iter().enumerate().all(|(i, t)| t.id as usize == i && t.worker < 3 && t.start_ns <= t.end_ns));
            }
        }
    }
}
