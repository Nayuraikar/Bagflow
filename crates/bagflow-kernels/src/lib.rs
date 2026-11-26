//! Phase 6: batch deadline-risk kernel in several backends. All must give identical results.
use rayon::prelude::*;

pub mod runner;
pub mod traced;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Out {
    pub counts: [u64; 3], // [on-track, at-risk, critical]
    pub slack_sum: i64,
}

impl Out {
    pub fn merge(self, o: Out) -> Out {
        Out {
            counts: [self.counts[0] + o.counts[0], self.counts[1] + o.counts[1], self.counts[2] + o.counts[2]],
            slack_sum: self.slack_sum + o.slack_sum,
        }
    }
    fn from_acc(n: usize, lt: u64, cr: u64, sm: i64) -> Out {
        Out { counts: [n as u64 - lt, lt - cr, cr], slack_sum: sm }
    }
}

pub type Kernel = fn(&[u32], &[u32], &[u8], &mut [u8]) -> Out;

#[inline(always)]
fn slack(a: u32, d: u32, f: u8) -> i32 {
    let f = f as u32;
    let est = 1200 + 600 * ((f >> 1) & 1) + 300 * (f & 1);
    d.wrapping_sub(a).wrapping_sub(est) as i32
}

fn check(arr: &[u32], dl: &[u32], fl: &[u8], out: &[u8]) -> usize {
    let n = arr.len();
    assert!(dl.len() == n && fl.len() == n && out.len() == n);
    n
}

#[allow(clippy::too_many_arguments)]
fn tail(arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8], from: usize, lt: &mut u64, cr: &mut u64, sm: &mut i64) {
    for i in from..arr.len() {
        let s = slack(arr[i], dl[i], fl[i]);
        let a = (s < 1800) as u8;
        let b = (s < 600) as u8;
        out[i] = a + b;
        *lt += a as u64;
        *cr += b as u64;
        *sm += s as i64;
    }
}

/// Baseline: one bag at a time.
pub fn scalar(arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8]) -> Out {
    let n = check(arr, dl, fl, out);
    let (mut lt, mut cr, mut sm) = (0u64, 0u64, 0i64);
    tail(arr, dl, fl, out, 0, &mut lt, &mut cr, &mut sm);
    Out::from_acc(n, lt, cr, sm)
}

/// ILP: 4 bags per iteration with independent accumulators, so the CPU can overlap the dependency chains.
pub fn ilp(arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8]) -> Out {
    let n = check(arr, dl, fl, out);
    let n4 = n / 4 * 4;
    let (mut lt, mut cr, mut sm) = ([0u64; 4], [0u64; 4], [0i64; 4]);
    let mut i = 0;
    while i < n4 {
        for k in 0..4 {
            let s = slack(arr[i + k], dl[i + k], fl[i + k]);
            let a = (s < 1800) as u8;
            let b = (s < 600) as u8;
            out[i + k] = a + b;
            lt[k] += a as u64;
            cr[k] += b as u64;
            sm[k] += s as i64;
        }
        i += 4;
    }
    let (mut l, mut c, mut s) = (lt.iter().sum::<u64>(), cr.iter().sum::<u64>(), sm.iter().sum::<i64>());
    tail(arr, dl, fl, out, n4, &mut l, &mut c, &mut s);
    Out::from_acc(n, l, c, s)
}

/// TLP: split into chunks, run `kern` on each chunk on a Rayon pool. `kern` can be ilp, neon or avx2 (TLP x SIMD).
pub fn par(pool: &rayon::ThreadPool, kern: Kernel, arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8]) -> Out {
    const CH: usize = 1 << 16;
    check(arr, dl, fl, out);
    pool.install(|| {
        out.par_chunks_mut(CH)
            .enumerate()
            .map(|(ci, o)| {
                let s = ci * CH;
                let e = s + o.len();
                kern(&arr[s..e], &dl[s..e], &fl[s..e], o)
            })
            .reduce(Out::default, Out::merge)
    })
}

// ---------------- OpenMP (C++ kernel) ----------------
extern "C" {
    fn bf_risk_omp(arr: *const u32, dl: *const u32, fl: *const u8, n: usize, out: *mut u8, counts: *mut u64, slack_sum: *mut i64);
    fn bf_omp_threads() -> i32;
}

pub fn omp_threads() -> usize {
    unsafe { bf_omp_threads() as usize }
}

pub fn openmp(arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8]) -> Out {
    let n = check(arr, dl, fl, out);
    let mut counts = [0u64; 3];
    let mut sm = 0i64;
    unsafe { bf_risk_omp(arr.as_ptr(), dl.as_ptr(), fl.as_ptr(), n, out.as_mut_ptr(), counts.as_mut_ptr(), &mut sm) };
    Out { counts, slack_sum: sm }
}

// ---------------- NEON (Apple Silicon / aarch64) ----------------
#[cfg(target_arch = "aarch64")]
mod neon_impl {
    use super::*;
    use std::arch::aarch64::*;

    #[inline(always)]
    unsafe fn blk(a: uint32x4_t, d: uint32x4_t, f: uint32x4_t, lt: &mut uint32x4_t, cr: &mut uint32x4_t, sm: &mut int64x2_t) -> uint32x4_t {
        let one = vdupq_n_u32(1);
        let est = vaddq_u32(
            vaddq_u32(vdupq_n_u32(1200), vmulq_n_u32(vandq_u32(vshrq_n_u32::<1>(f), one), 600)),
            vmulq_n_u32(vandq_u32(f, one), 300),
        );
        let s = vreinterpretq_s32_u32(vsubq_u32(vsubq_u32(d, a), est));
        let m1 = vcltq_s32(s, vdupq_n_s32(1800)); // all ones where slack < 1800
        let m2 = vcltq_s32(s, vdupq_n_s32(600));
        *lt = vsubq_u32(*lt, m1); // subtracting -1 adds 1
        *cr = vsubq_u32(*cr, m2);
        *sm = vpadalq_s32(*sm, s);
        vaddq_u32(vandq_u32(m1, one), vandq_u32(m2, one))
    }

    pub fn neon(arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8]) -> Out {
        let n = check(arr, dl, fl, out);
        let n8 = n / 8 * 8;
        let (mut lt, mut cr, mut sm) = (0u64, 0u64, 0i64);
        unsafe {
            let mut lt_v = vdupq_n_u32(0);
            let mut cr_v = vdupq_n_u32(0);
            let mut sm_v = vdupq_n_s64(0);
            let mut i = 0;
            while i < n8 {
                let f16 = vmovl_u8(vld1_u8(fl.as_ptr().add(i)));
                let f_lo = vmovl_u16(vget_low_u16(f16));
                let f_hi = vmovl_u16(vget_high_u16(f16));
                let c_lo = blk(vld1q_u32(arr.as_ptr().add(i)), vld1q_u32(dl.as_ptr().add(i)), f_lo, &mut lt_v, &mut cr_v, &mut sm_v);
                let c_hi = blk(vld1q_u32(arr.as_ptr().add(i + 4)), vld1q_u32(dl.as_ptr().add(i + 4)), f_hi, &mut lt_v, &mut cr_v, &mut sm_v);
                let c16 = vcombine_u16(vmovn_u32(c_lo), vmovn_u32(c_hi));
                vst1_u8(out.as_mut_ptr().add(i), vmovn_u16(c16));
                i += 8;
            }
            lt += vaddvq_u32(lt_v) as u64;
            cr += vaddvq_u32(cr_v) as u64;
            sm += vaddvq_s64(sm_v);
        }
        tail(arr, dl, fl, out, n8, &mut lt, &mut cr, &mut sm);
        Out::from_acc(n, lt, cr, sm)
    }
}
#[cfg(target_arch = "aarch64")]
pub use neon_impl::neon;

// ---------------- AVX2 (x86_64; written on the Mac, run on Kaggle) ----------------
#[cfg(target_arch = "x86_64")]
mod avx2_impl {
    use super::*;
    use std::arch::x86_64::*;

    pub fn avx2(arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8]) -> Out {
        assert!(is_x86_feature_detected!("avx2"), "AVX2 not available on this CPU");
        unsafe { imp(arr, dl, fl, out) }
    }

    #[target_feature(enable = "avx2")]
    unsafe fn imp(arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8]) -> Out {
        let n = check(arr, dl, fl, out);
        let n8 = n / 8 * 8;
        let one = _mm256_set1_epi32(1);
        let c600 = _mm256_set1_epi32(600);
        let c1800 = _mm256_set1_epi32(1800);
        let pick = _mm256_setr_epi8(
            0, 4, 8, 12, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
            0, 4, 8, 12, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        );
        let mut lt_v = _mm256_setzero_si256();
        let mut cr_v = _mm256_setzero_si256();
        let mut sm_lo = _mm256_setzero_si256();
        let mut sm_hi = _mm256_setzero_si256();
        let mut i = 0;
        while i < n8 {
            let a = _mm256_loadu_si256(arr.as_ptr().add(i) as *const __m256i);
            let d = _mm256_loadu_si256(dl.as_ptr().add(i) as *const __m256i);
            let f = _mm256_cvtepu8_epi32(_mm_loadl_epi64(fl.as_ptr().add(i) as *const __m128i));
            let est = _mm256_add_epi32(
                _mm256_add_epi32(_mm256_set1_epi32(1200), _mm256_mullo_epi32(_mm256_and_si256(_mm256_srli_epi32::<1>(f), one), _mm256_set1_epi32(600))),
                _mm256_mullo_epi32(_mm256_and_si256(f, one), _mm256_set1_epi32(300)),
            );
            let s = _mm256_sub_epi32(_mm256_sub_epi32(d, a), est);
            let m1 = _mm256_cmpgt_epi32(c1800, s);
            let m2 = _mm256_cmpgt_epi32(c600, s);
            lt_v = _mm256_sub_epi32(lt_v, m1);
            cr_v = _mm256_sub_epi32(cr_v, m2);
            sm_lo = _mm256_add_epi64(sm_lo, _mm256_cvtepi32_epi64(_mm256_castsi256_si128(s)));
            sm_hi = _mm256_add_epi64(sm_hi, _mm256_cvtepi32_epi64(_mm256_extracti128_si256::<1>(s)));
            let c = _mm256_add_epi32(_mm256_and_si256(m1, one), _mm256_and_si256(m2, one));
            let p = _mm256_shuffle_epi8(c, pick);
            std::ptr::write_unaligned(out.as_mut_ptr().add(i) as *mut u32, _mm256_extract_epi32::<0>(p) as u32);
            std::ptr::write_unaligned(out.as_mut_ptr().add(i + 4) as *mut u32, _mm256_extract_epi32::<4>(p) as u32);
            i += 8;
        }
        let (mut t32, mut u32a) = ([0u32; 8], [0u32; 8]);
        _mm256_storeu_si256(t32.as_mut_ptr() as *mut __m256i, lt_v);
        _mm256_storeu_si256(u32a.as_mut_ptr() as *mut __m256i, cr_v);
        let (mut s_lo, mut s_hi) = ([0i64; 4], [0i64; 4]);
        _mm256_storeu_si256(s_lo.as_mut_ptr() as *mut __m256i, sm_lo);
        _mm256_storeu_si256(s_hi.as_mut_ptr() as *mut __m256i, sm_hi);
        let mut lt: u64 = t32.iter().map(|x| *x as u64).sum();
        let mut cr: u64 = u32a.iter().map(|x| *x as u64).sum();
        let mut sm: i64 = s_lo.iter().sum::<i64>() + s_hi.iter().sum::<i64>();
        tail(arr, dl, fl, out, n8, &mut lt, &mut cr, &mut sm);
        Out::from_acc(n, lt, cr, sm)
    }
}
#[cfg(target_arch = "x86_64")]
pub use avx2_impl::avx2;

/// The SIMD kernel for this machine, if any (NEON on Apple Silicon, AVX2 on x86 when available).
pub fn simd_kernel() -> Option<(&'static str, Kernel)> {
    #[cfg(target_arch = "aarch64")]
    {
        return Some(("neon", neon as Kernel));
    }
    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            return Some(("avx2", avx2 as Kernel));
        }
    }
    #[allow(unreachable_code)]
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use bagflow_core::generator::{generate, GenConfig};

    #[test]
    fn every_backend_matches_scalar_on_awkward_lengths() {
        let (_, b) = generate(&GenConfig { seed: 3, target_bags: 50_001 });
        let pool = rayon::ThreadPoolBuilder::new().num_threads(3).build().unwrap();
        for n in [0usize, 1, 3, 7, 8, 9, 17, 1000, b.len() - 3] {
            let (a, d, f) = (&b.arrival_s[..n], &b.deadline_s[..n], &b.flags[..n]);
            let mut ro = vec![0u8; n];
            let r = scalar(a, d, f, &mut ro);
            assert_eq!(r.counts.iter().sum::<u64>(), n as u64);

            let mut o = vec![9u8; n];
            assert_eq!(ilp(a, d, f, &mut o), r, "ilp n={n}");
            assert_eq!(o, ro);
            let mut o = vec![9u8; n];
            assert_eq!(openmp(a, d, f, &mut o), r, "openmp n={n}");
            assert_eq!(o, ro);
            let mut o = vec![9u8; n];
            assert_eq!(par(&pool, ilp, a, d, f, &mut o), r, "rayon n={n}");
            assert_eq!(o, ro);
            if let Some((name, k)) = simd_kernel() {
                let mut o = vec![9u8; n];
                assert_eq!(k(a, d, f, &mut o), r, "{name} n={n}");
                assert_eq!(o, ro);
                let mut o = vec![9u8; n];
                assert_eq!(par(&pool, k, a, d, f, &mut o), r, "rayon+{name} n={n}");
                assert_eq!(o, ro);
            }
        }
    }

    #[test]
    fn classes_are_not_degenerate() {
        let (_, b) = generate(&GenConfig { seed: 3, target_bags: 50_000 });
        let mut o = vec![0u8; b.len()];
        let r = scalar(&b.arrival_s, &b.deadline_s, &b.flags, &mut o);
        assert!(r.counts[0] > 0 && r.counts[1] > 0, "{:?}", r.counts);
    }
}

// ---------------- Metal (Apple GPU; macOS only) ----------------
#[cfg(has_metal)]
pub mod metal {
    use super::Out;
    use std::ffi::c_void;

    extern "C" {
        fn bf_metal_create(cap: usize, name: *mut u8, name_len: usize) -> *mut c_void;
        fn bf_metal_destroy(p: *mut c_void);
        fn bf_metal_upload(p: *mut c_void, arr: *const u32, dl: *const u32, fl: *const u8, n: usize) -> f64;
        fn bf_metal_dispatch(p: *mut c_void, n: usize, wall_s: *mut f64) -> f64;
        fn bf_metal_download(p: *mut c_void, n: usize, out: *mut u8, counts: *mut u64, slack_sum: *mut i64) -> f64;
    }

    /// Seconds spent in each stage of one run.
    #[derive(Debug, Default, Clone, Copy)]
    pub struct Timing {
        pub upload: f64,   // host -> GPU-visible buffers
        pub gpu: f64,      // kernel execution (GPU timestamps)
        pub wall: f64,     // CPU-side: encode + launch + wait
        pub download: f64, // buffers -> host, plus summing the per-group partials
    }

    pub struct Metal {
        p: *mut c_void,
        cap: usize,
        pub name: String,
    }

    impl Metal {
        pub fn new(cap: usize) -> Option<Metal> {
            let mut buf = [0u8; 128];
            let p = unsafe { bf_metal_create(cap, buf.as_mut_ptr(), buf.len()) };
            if p.is_null() {
                return None;
            }
            let end = buf.iter().position(|b| *b == 0).unwrap_or(buf.len());
            Some(Metal { p, cap, name: String::from_utf8_lossy(&buf[..end]).into_owned() })
        }

        pub fn run(&self, arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8]) -> (Out, Timing) {
            let n = arr.len();
            assert!(n <= self.cap && dl.len() == n && fl.len() == n && out.len() == n);
            let mut t = Timing::default();
            let mut counts = [0u64; 3];
            let mut sm = 0i64;
            unsafe {
                t.upload = bf_metal_upload(self.p, arr.as_ptr(), dl.as_ptr(), fl.as_ptr(), n);
                t.gpu = bf_metal_dispatch(self.p, n, &mut t.wall);
                t.download = bf_metal_download(self.p, n, out.as_mut_ptr(), counts.as_mut_ptr(), &mut sm);
            }
            (Out { counts, slack_sum: sm }, t)
        }
    }

    impl Drop for Metal {
        fn drop(&mut self) {
            unsafe { bf_metal_destroy(self.p) }
        }
    }
}

#[cfg(all(test, has_metal))]
mod metal_tests {
    use super::*;
    use bagflow_core::generator::{generate, GenConfig};

    #[test]
    fn metal_matches_scalar_on_awkward_lengths() {
        let (_, b) = generate(&GenConfig { seed: 3, target_bags: 50_001 });
        let m = match metal::Metal::new(b.len()) {
            Some(m) => m,
            None => {
                eprintln!("no Metal device, skipping");
                return;
            }
        };
        for n in [0usize, 1, 7, 255, 256, 257, 1000, b.len()] {
            let (a, d, f) = (&b.arrival_s[..n], &b.deadline_s[..n], &b.flags[..n]);
            let mut ro = vec![0u8; n];
            let r = scalar(a, d, f, &mut ro);
            let mut o = vec![9u8; n];
            let (g, _) = m.run(a, d, f, &mut o);
            assert_eq!(g, r, "metal n={n}");
            assert_eq!(o, ro, "metal classes n={n}");
        }
    }
}

// ---------------- CUDA (NVIDIA GPU; Linux with nvcc only) ----------------
#[cfg(has_cuda)]
pub mod cuda {
    use super::Out;
    use std::ffi::c_void;

    extern "C" {
        fn bf_cuda_create(cap: usize, name: *mut u8, name_len: usize) -> *mut c_void;
        fn bf_cuda_destroy(p: *mut c_void);
        fn bf_cuda_upload(p: *mut c_void, arr: *const u32, dl: *const u32, fl: *const u8, n: usize) -> f64;
        fn bf_cuda_run(p: *mut c_void, variant: i32, n: usize, wall_s: *mut f64) -> f64;
        fn bf_cuda_download(p: *mut c_void, n: usize, out: *mut u8, counts: *mut u64, slack_sum: *mut i64) -> f64;
    }

    pub const VARIANTS: [&str; 3] = ["naive atomics", "warp shuffle", "warp ptx"];

    #[derive(Debug, Default, Clone, Copy)]
    pub struct Timing {
        pub upload: f64,   // PCIe host -> device
        pub gpu: f64,      // kernel, CUDA events
        pub wall: f64,     // CPU-side launch + wait
        pub download: f64, // PCIe device -> host
    }

    pub struct Cuda {
        p: *mut c_void,
        cap: usize,
        pub name: String,
    }

    impl Cuda {
        pub fn new(cap: usize) -> Option<Cuda> {
            let mut buf = [0u8; 128];
            let p = unsafe { bf_cuda_create(cap, buf.as_mut_ptr(), buf.len()) };
            if p.is_null() {
                return None;
            }
            let end = buf.iter().position(|b| *b == 0).unwrap_or(buf.len());
            Some(Cuda { p, cap, name: String::from_utf8_lossy(&buf[..end]).into_owned() })
        }

        pub fn run(&self, variant: i32, arr: &[u32], dl: &[u32], fl: &[u8], out: &mut [u8]) -> (Out, Timing) {
            let n = arr.len();
            assert!(n <= self.cap && dl.len() == n && fl.len() == n && out.len() == n);
            let mut t = Timing::default();
            let mut counts = [0u64; 3];
            let mut sm = 0i64;
            unsafe {
                t.upload = bf_cuda_upload(self.p, arr.as_ptr(), dl.as_ptr(), fl.as_ptr(), n);
                t.gpu = bf_cuda_run(self.p, variant, n, &mut t.wall);
                t.download = bf_cuda_download(self.p, n, out.as_mut_ptr(), counts.as_mut_ptr(), &mut sm);
            }
            (Out { counts, slack_sum: sm }, t)
        }
    }

    impl Drop for Cuda {
        fn drop(&mut self) {
            unsafe { bf_cuda_destroy(self.p) }
        }
    }
}

#[cfg(all(test, has_cuda))]
mod cuda_tests {
    use super::*;
    use bagflow_core::generator::{generate, GenConfig};

    #[test]
    fn cuda_variants_match_scalar_on_awkward_lengths() {
        let (_, b) = generate(&GenConfig { seed: 3, target_bags: 50_001 });
        let g = match cuda::Cuda::new(b.len()) {
            Some(g) => g,
            None => {
                eprintln!("no CUDA device, skipping");
                return;
            }
        };
        for n in [0usize, 1, 31, 32, 33, 255, 256, 257, 1000, b.len()] {
            let (a, d, f) = (&b.arrival_s[..n], &b.deadline_s[..n], &b.flags[..n]);
            let mut ro = vec![0u8; n];
            let r = scalar(a, d, f, &mut ro);
            for v in 0..3 {
                let mut o = vec![9u8; n];
                let (got, _) = g.run(v, a, d, f, &mut o);
                assert_eq!(got, r, "{} n={n}", cuda::VARIANTS[v as usize]);
                assert_eq!(o, ro, "{} classes n={n}", cuda::VARIANTS[v as usize]);
            }
        }
    }
}
