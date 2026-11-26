//! The CPU kernels run chunk by chunk with a record of every chunk: which thread ran
//! it and when. The per-bag classes and totals are the same as the untraced kernels.

use crate::{check, Kernel, Out};
use bagflow_core::trace::{self, Stage, Task};
use rayon::prelude::*;
use std::time::Instant;

pub struct Traced {
    pub result: Out,
    pub tasks: Vec<Task>,
    /// Combining the per-chunk totals on one thread. `None` when a single thread
    /// accumulates as it goes.
    pub merge: Option<Stage>,
}

fn merge(parts: impl Iterator<Item = Out>, t0: Instant) -> (Out, Stage) {
    let mut stages = Vec::new();
    let result = trace::stage(&mut stages, t0, "merge", false, || parts.fold(Out::default(), Out::merge));
    (result, stages[0])
}

/// One thread, chunk after chunk. `kern` can be scalar, ILP or the SIMD kernel.
pub fn single(kern: Kernel, arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8], chunk: usize, t0: Instant) -> Traced {
    check(arr, dl, fl, out);
    assert!(chunk > 0);
    let mut result = Out::default();
    let tasks = out
        .chunks_mut(chunk)
        .enumerate()
        .map(|(i, o)| {
            let s = i * chunk;
            let e = s + o.len();
            trace::task(t0, i, || {
                result = result.merge(kern(&arr[s..e], &dl[s..e], &fl[s..e], o));
                ((e - s) as u64, ())
            })
            .0
        })
        .collect();
    Traced { result, tasks, merge: None }
}

/// One Rayon task per chunk (work stealing), then the totals are merged.
#[allow(clippy::too_many_arguments)]
pub fn rayon(pool: &rayon::ThreadPool, kern: Kernel, arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8], chunk: usize, t0: Instant) -> Traced {
    check(arr, dl, fl, out);
    assert!(chunk > 0);
    let parts: Vec<(Task, Out)> = pool.install(|| {
        out.par_chunks_mut(chunk)
            .with_max_len(1)
            .enumerate()
            .map(|(i, o)| {
                let s = i * chunk;
                let e = s + o.len();
                trace::task(t0, i, || ((e - s) as u64, kern(&arr[s..e], &dl[s..e], &fl[s..e], o)))
            })
            .collect()
    });
    let (result, merge) = merge(parts.iter().map(|p| p.1), t0);
    Traced { result, tasks: parts.into_iter().map(|p| p.0).collect(), merge: Some(merge) }
}

extern "C" {
    #[allow(clippy::too_many_arguments)]
    fn bf_risk_omp_traced(
        arr: *const u32, dl: *const u32, fl: *const u8, n: usize, out: *mut u8, chunk: usize, threads: i32,
        lt: *mut u64, cr: *mut u64, sm: *mut i64, worker: *mut u32, start_ns: *mut u64, end_ns: *mut u64,
    );
}

/// OpenMP with `schedule(static)` over the chunks.
#[allow(clippy::too_many_arguments)]
pub fn openmp(threads: usize, arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8], chunk: usize, t0: Instant) -> Traced {
    let n = check(arr, dl, fl, out);
    assert!(chunk > 0 && threads > 0);
    let k = n.div_ceil(chunk);
    let (mut lt, mut cr, mut sm) = (vec![0u64; k], vec![0u64; k], vec![0i64; k]);
    let (mut worker, mut start, mut end) = (vec![0u32; k], vec![0u64; k], vec![0u64; k]);
    let offset = trace::since(t0);
    // SAFETY: the bag arrays have length n and the per-chunk arrays length ceil(n / chunk).
    unsafe {
        bf_risk_omp_traced(
            arr.as_ptr(), dl.as_ptr(), fl.as_ptr(), n, out.as_mut_ptr(), chunk, threads as i32,
            lt.as_mut_ptr(), cr.as_mut_ptr(), sm.as_mut_ptr(), worker.as_mut_ptr(), start.as_mut_ptr(), end.as_mut_ptr(),
        )
    };
    let size = |i: usize| (n - i * chunk).min(chunk);
    let (result, merge) = merge((0..k).map(|i| Out::from_acc(size(i), lt[i], cr[i], sm[i])), t0);
    let tasks = (0..k)
        .map(|i| Task { id: i as u32, worker: worker[i], start_ns: offset + start[i], end_ns: offset + end[i], size: size(i) as u64 })
        .collect();
    Traced { result, tasks, merge: Some(merge) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ilp, scalar, simd_kernel};
    use bagflow_core::generator::{generate, GenConfig};

    #[test]
    fn traced_kernels_match_scalar_and_cover_every_chunk() {
        let (_, b) = generate(&GenConfig { seed: 3, target_bags: 50_001 });
        let pool = rayon::ThreadPoolBuilder::new().num_threads(3).build().unwrap();
        for n in [0usize, 1, 9, 1000, b.len() - 3] {
            let (a, d, f) = (&b.arrival_s[..n], &b.deadline_s[..n], &b.flags[..n]);
            let mut ro = vec![0u8; n];
            let r = scalar(a, d, f, &mut ro);
            for chunk in [1usize.max(n / 500), 7.max(n / 100), 1 << 20] {
                let mut kernels = vec![scalar as Kernel, ilp];
                kernels.extend(simd_kernel().map(|k| k.1));
                let mut runs = Vec::new();
                for k in kernels {
                    let mut o = vec![9u8; n];
                    runs.push((single(k, a, d, f, &mut o, chunk, Instant::now()), o));
                    let mut o = vec![9u8; n];
                    runs.push((rayon(&pool, k, a, d, f, &mut o, chunk, Instant::now()), o));
                }
                let mut o = vec![9u8; n];
                runs.push((openmp(3, a, d, f, &mut o, chunk, Instant::now()), o));
                for (i, (t, o)) in runs.iter().enumerate() {
                    assert_eq!(t.result, r, "run {i}, n={n}, chunk={chunk}");
                    assert_eq!(*o, ro, "classes, run {i}, n={n}, chunk={chunk}");
                    assert_eq!(t.tasks.len(), n.div_ceil(chunk));
                    assert_eq!(t.tasks.iter().map(|t| t.size).sum::<u64>(), n as u64);
                    assert!(t.tasks.iter().all(|t| t.worker < 3 && t.start_ns <= t.end_ns));
                }
            }
        }
    }
}
