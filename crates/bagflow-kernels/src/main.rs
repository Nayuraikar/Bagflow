use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_kernels::*;
use std::time::Instant;

#[allow(clippy::too_many_arguments)]
fn bench(name: &str, reps: usize, base: &mut f64, ref_res: &Out, ref_out: &[u8], out: &mut [u8], mut f: impl FnMut(&mut [u8]) -> Out) {
    let mut best = f64::MAX;
    let mut res = Out::default();
    for _ in 0..reps {
        out.fill(0);
        let t = Instant::now();
        res = f(out);
        best = best.min(t.elapsed().as_secs_f64());
    }
    if *base == 0.0 {
        *base = best;
    }
    let ok = res == *ref_res && out == ref_out;
    let n = out.len() as f64;
    println!("{:<20}{:>10.2}{:>12.0}{:>9.1}{:>9.2}x  {}", name, best * 1e3, n / best / 1e6, n * 10.0 / best / 1e9, *base / best, if ok { "identical" } else { "MISMATCH" });
}

fn main() {
    let n: usize = std::env::args().nth(1).and_then(|a| a.parse().ok()).unwrap_or(10_000_000);
    let max_t = std::thread::available_parallelism().map(|x| x.get()).unwrap_or(1);
    let (_, bags) = generate_par(&GenConfig { seed: 42, target_bags: n }, max_t);
    let n = bags.len();
    let (arr, dl, fl) = (&bags.arrival_s[..], &bags.deadline_s[..], &bags.flags[..]);

    let mut ref_out = vec![0u8; n];
    let ref_res = scalar(arr, dl, fl, &mut ref_out);
    let mut out = vec![0u8; n];
    let reps = 10;

    println!("deadline-risk kernel: {n} bags, {max_t} logical cores, best of {reps}");
    println!("classes on-track / at-risk / critical: {:?}, slack sum {}\n", ref_res.counts, ref_res.slack_sum);
    println!("{:<20}{:>10}{:>12}{:>9}{:>10}  {}", "backend", "time ms", "M bags/s", "GB/s", "speedup", "output");

    let mut base = 0.0;
    bench("scalar", reps, &mut base, &ref_res, &ref_out, &mut out, |o| scalar(arr, dl, fl, o));
    bench("ilp (x4)", reps, &mut base, &ref_res, &ref_out, &mut out, |o| ilp(arr, dl, fl, o));
    let simd = simd_kernel();
    if let Some((name, k)) = simd {
        bench(name, reps, &mut base, &ref_res, &ref_out, &mut out, |o| k(arr, dl, fl, o));
    }
    bench(&format!("openmp-{}", omp_threads()), reps, &mut base, &ref_res, &ref_out, &mut out, |o| openmp(arr, dl, fl, o));

    let mut counts = vec![1usize];
    let mut t = 2;
    while t < max_t {
        counts.push(t);
        t *= 2;
    }
    if max_t > 1 {
        counts.push(max_t);
    }
    for t in counts {
        let pool = rayon::ThreadPoolBuilder::new().num_threads(t).build().unwrap();
        bench(&format!("rayon-{t}+ilp"), reps, &mut base, &ref_res, &ref_out, &mut out, |o| par(&pool, ilp, arr, dl, fl, o));
        if let Some((name, k)) = simd {
            bench(&format!("rayon-{t}+{name}"), reps, &mut base, &ref_res, &ref_out, &mut out, |o| par(&pool, k, arr, dl, fl, o));
        }
    }
}
