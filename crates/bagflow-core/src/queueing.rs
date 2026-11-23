//! Validation of the DES engine against M/M/c theory.
use crate::engine::{simulate_cfg, SimConfig};
use crate::rng::{stream_rng, Stream};
use crate::soa::BagSoA;
use crate::types::*;
use rand_distr::{Distribution, Exp};

pub const MEAN_SERVICE_MS: u32 = 100_000; // 100 s, so second-resolution arrivals are accurate enough

/// Erlang C: probability an arriving customer must wait. `a` = lambda/mu, needs a < c.
pub fn erlang_c(c: u32, a: f64) -> f64 {
    let mut term = 1.0; // a^k / k!
    let mut sum = 1.0;
    for k in 1..c {
        term *= a / k as f64;
        sum += term;
    }
    let top = term * a / c as f64 / (1.0 - a / c as f64);
    top / (sum + top)
}

/// Theoretical mean wait in queue (seconds) for M/M/c.
pub fn mmc_wq(c: u32, lambda: f64, mu: f64) -> f64 {
    erlang_c(c, lambda / mu) / (c as f64 * mu - lambda)
}

/// Poisson arrivals at `lambda_per_s`, stored at 1 s resolution.
pub fn poisson_bags(seed: u64, n: usize, lambda_per_s: f64) -> BagSoA {
    let mut rng = stream_rng(seed, Stream::Bags);
    let exp = Exp::new(lambda_per_s).unwrap();
    let mut t = 0.0f64;
    let mut s = BagSoA::default();
    for i in 0..n {
        t += exp.sample(&mut rng);
        let a = t as u32;
        s.push(i as u32, 0, 170, PRIO_STANDARD, 0, a, a + 86_400);
    }
    s
}

pub struct Row {
    pub c: u32,
    pub rho: f64,
    pub wq_theory: f64,
    pub wq_sim: f64,
    pub err: f64,      // relative error of Wq
    pub util_sim: f64,
    pub completed: u64,
    pub n: usize,
}

pub fn run_case(seed: u64, c: u32, rho: f64, n: usize) -> Row {
    let mu = 1000.0 / MEAN_SERVICE_MS as f64; // per second, per server
    let lambda = rho * c as f64 * mu;
    let bags = poisson_bags(seed + c as u64, n, lambda);
    let node = Node {
        id: 0,
        kind: NodeKind::CheckIn,
        servers: c as u16,
        mean_service_ms: MEAN_SERVICE_MS,
        queue_capacity: u32::MAX,
        x: 0.0,
        y: 0.0,
        online: true,
    };
    let cfg = SimConfig { exponential: true, hold_prob: 0.0 };
    let r = simulate_cfg(&bags, &[node], &[], seed, &cfg);
    let st = &r.stats[0];
    let wq_sim = st.total_wait_ms as f64 / st.arrivals as f64 / 1000.0;
    let span = r.end_ms as f64 - bags.arrival_s[0] as f64 * 1000.0;
    let util_sim = st.busy_ms as f64 / (c as f64 * span);
    let wq_theory = mmc_wq(c, lambda, mu);
    Row { c, rho, wq_theory, wq_sim, err: (wq_sim - wq_theory) / wq_theory, util_sim, completed: st.completed, n }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn erlang_c_known_values() {
        assert!((erlang_c(1, 0.5) - 0.5).abs() < 1e-12); // M/M/1: P(wait) = rho
        assert!((erlang_c(2, 1.0) - 1.0 / 3.0).abs() < 1e-12);
    }

    #[test]
    fn mm1_formula() {
        // M/M/1: Wq = rho / (mu - lambda). mu = 0.01/s, lambda = 0.008/s -> 400 s
        assert!((mmc_wq(1, 0.008, 0.01) - 400.0).abs() < 1e-9);
    }

    #[test]
    fn engine_matches_mmc_theory() {
        let cases = [(1, 0.5), (1, 0.8), (2, 0.7), (4, 0.8), (8, 0.8)];
        for (c, rho) in cases {
            let r = run_case(42, c, rho, 400_000);
            assert_eq!(r.completed as usize, r.n, "conservation, c={c}");
            assert!(r.err.abs() < 0.08, "c={c} rho={rho}: Wq sim {:.1} vs theory {:.1}", r.wq_sim, r.wq_theory);
            assert!((r.util_sim - rho).abs() < 0.02, "c={c} rho={rho}: util {:.3}", r.util_sim);
        }
    }
}
