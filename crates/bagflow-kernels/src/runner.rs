//! Library benchmark runner: backend detection, warm-up, per-repetition times and an
//! output check against scalar. Every number it returns is measured on this machine.

use crate::*;
use std::time::Instant;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Backend {
    Scalar,
    Ilp,
    Neon,
    Avx2,
    OpenMp,
    RayonIlp,
    RayonNeon,
    RayonAvx2,
    Metal,
    CudaNaive,
    CudaWarp,
    CudaPtx,
    Mpi,
}

impl Backend {
    pub const ALL: [Backend; 13] = [
        Backend::Scalar,
        Backend::Ilp,
        Backend::Neon,
        Backend::Avx2,
        Backend::OpenMp,
        Backend::RayonIlp,
        Backend::RayonNeon,
        Backend::RayonAvx2,
        Backend::Metal,
        Backend::CudaNaive,
        Backend::CudaWarp,
        Backend::CudaPtx,
        Backend::Mpi,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Backend::Scalar => "scalar",
            Backend::Ilp => "ilp",
            Backend::Neon => "neon",
            Backend::Avx2 => "avx2",
            Backend::OpenMp => "openmp",
            Backend::RayonIlp => "rayon-ilp",
            Backend::RayonNeon => "rayon-neon",
            Backend::RayonAvx2 => "rayon-avx2",
            Backend::Metal => "metal",
            Backend::CudaNaive => "cuda-naive",
            Backend::CudaWarp => "cuda-warp",
            Backend::CudaPtx => "cuda-ptx",
            Backend::Mpi => "mpi",
        }
    }

    pub fn parse(s: &str) -> Option<Backend> {
        Backend::ALL.into_iter().find(|b| b.id() == s)
    }

    /// Whether the caller chooses the thread count.
    pub fn takes_threads(self) -> bool {
        matches!(self, Backend::RayonIlp | Backend::RayonNeon | Backend::RayonAvx2)
    }

    pub fn is_gpu(self) -> bool {
        matches!(self, Backend::Metal | Backend::CudaNaive | Backend::CudaWarp | Backend::CudaPtx)
    }

    /// The one-thread run of the same kernel, used for parallel efficiency.
    /// `None` for backends that have no thread count.
    pub fn efficiency_baseline(self) -> Option<Backend> {
        match self {
            // the OpenMP kernel is the same plain loop as scalar
            Backend::OpenMp => Some(Backend::Scalar),
            Backend::RayonIlp => Some(Backend::Ilp),
            Backend::RayonNeon => Some(Backend::Neon),
            Backend::RayonAvx2 => Some(Backend::Avx2),
            _ => None,
        }
    }

    /// `Ok` with a short detail (device or thread count), or `Err` with the reason it cannot run here.
    pub fn availability(self) -> Result<String, String> {
        let neon = || if cfg!(target_arch = "aarch64") { Ok(String::new()) } else { Err("NEON needs an aarch64 CPU".to_string()) };
        let avx2 = || match simd_kernel() {
            Some(("avx2", _)) => Ok(String::new()),
            _ => Err("AVX2 needs an x86_64 CPU with AVX2".to_string()),
        };
        match self {
            Backend::Scalar | Backend::Ilp | Backend::RayonIlp => Ok(String::new()),
            Backend::Neon | Backend::RayonNeon => neon(),
            Backend::Avx2 | Backend::RayonAvx2 => avx2(),
            Backend::OpenMp => match omp_threads() {
                1 => Ok("1 thread (built without OpenMP, or limited to one thread)".to_string()),
                t => Ok(format!("{t} threads")),
            },
            Backend::Metal => metal_device(),
            Backend::CudaNaive | Backend::CudaWarp | Backend::CudaPtx => cuda_device(),
            Backend::Mpi => Err("live MPI runs are not wired into the runner; see the static results".to_string()),
        }
    }
}

fn metal_device() -> Result<String, String> {
    #[cfg(has_metal)]
    {
        metal::Metal::new(1).map(|m| m.name.clone()).ok_or_else(|| "no Metal device found".to_string())
    }
    #[cfg(not(has_metal))]
    Err("Metal is only built on macOS".to_string())
}

fn cuda_device() -> Result<String, String> {
    #[cfg(has_cuda)]
    {
        cuda::Cuda::new(1).map(|c| c.name.clone()).ok_or_else(|| "no CUDA device found".to_string())
    }
    #[cfg(not(has_cuda))]
    Err("CUDA was not built (needs Linux with nvcc)".to_string())
}

/// Wall time of one repetition, in seconds, split into phases for GPU backends.
#[derive(Clone, Copy, Debug, Default)]
pub struct GpuPhases {
    pub copy_in: f64,
    /// Kernel execution from device timestamps.
    pub kernel: f64,
    /// CPU-side encode, launch and wait. Includes `kernel`.
    pub wall: f64,
    pub copy_out: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct Sample {
    /// End-to-end time of the repetition (for GPUs this includes both copies).
    pub total: f64,
    pub gpu: Option<GpuPhases>,
}

#[derive(Debug)]
pub struct Measurement {
    pub samples: Vec<Sample>,
    /// Every repetition, warm-up included, matched the scalar reference.
    pub identical: bool,
}

/// The bag columns the kernel reads.
#[derive(Clone, Copy)]
pub struct Input<'a> {
    pub arrival: &'a [u32],
    pub deadline: &'a [u32],
    pub flags: &'a [u8],
}

fn repeat(
    reference: (&Out, &[u8]),
    warmup: usize,
    reps: usize,
    tick: &mut dyn FnMut(),
    mut f: impl FnMut(&mut [u8]) -> (Out, Option<GpuPhases>),
) -> Measurement {
    let mut out = vec![0u8; reference.1.len()];
    let mut samples = Vec::with_capacity(reps);
    let mut identical = true;
    for i in 0..warmup + reps {
        out.fill(0);
        let t = Instant::now();
        let (r, gpu) = f(&mut out);
        let total = t.elapsed().as_secs_f64();
        identical &= r == *reference.0 && out == reference.1;
        if i >= warmup {
            samples.push(Sample { total, gpu });
        }
        tick();
    }
    Measurement { samples, identical }
}

/// Run one backend `warmup + reps` times. `threads` is used only when `takes_threads()`.
/// Pools and GPU buffers are created before timing starts. `tick` is called once per repetition.
#[allow(clippy::too_many_arguments)]
pub fn measure(
    backend: Backend,
    threads: usize,
    input: Input,
    reference: (&Out, &[u8]),
    warmup: usize,
    reps: usize,
    tick: &mut dyn FnMut(),
) -> Result<Measurement, String> {
    backend.availability()?;
    let (a, d, f) = (input.arrival, input.deadline, input.flags);
    let cpu = |k: Kernel, tick: &mut dyn FnMut()| repeat(reference, warmup, reps, tick, |o| (k(a, d, f, o), None));
    let simd = || simd_kernel().map(|(_, k)| k).ok_or_else(|| "no SIMD kernel".to_string());

    Ok(match backend {
        Backend::Scalar => cpu(scalar, tick),
        Backend::Ilp => cpu(ilp, tick),
        Backend::Neon | Backend::Avx2 => cpu(simd()?, tick),
        Backend::OpenMp => cpu(openmp, tick),
        Backend::RayonIlp | Backend::RayonNeon | Backend::RayonAvx2 => {
            let kern = if backend == Backend::RayonIlp { ilp as Kernel } else { simd()? };
            let pool = rayon::ThreadPoolBuilder::new().num_threads(threads).build().map_err(|e| e.to_string())?;
            repeat(reference, warmup, reps, tick, |o| (par(&pool, kern, a, d, f, o), None))
        }
        Backend::Metal => {
            #[cfg(has_metal)]
            {
                let m = metal::Metal::new(a.len()).ok_or("could not create Metal buffers")?;
                repeat(reference, warmup, reps, tick, |o| {
                    let (r, t) = m.run(a, d, f, o);
                    (r, Some(GpuPhases { copy_in: t.upload, kernel: t.gpu, wall: t.wall, copy_out: t.download }))
                })
            }
            #[cfg(not(has_metal))]
            return Err("Metal is only built on macOS".to_string());
        }
        Backend::CudaNaive | Backend::CudaWarp | Backend::CudaPtx => {
            #[cfg(has_cuda)]
            {
                let variant = match backend {
                    Backend::CudaNaive => 0,
                    Backend::CudaWarp => 1,
                    _ => 2,
                };
                let g = cuda::Cuda::new(a.len()).ok_or("could not create CUDA buffers")?;
                repeat(reference, warmup, reps, tick, |o| {
                    let (r, t) = g.run(variant, a, d, f, o);
                    (r, Some(GpuPhases { copy_in: t.upload, kernel: t.gpu, wall: t.wall, copy_out: t.download }))
                })
            }
            #[cfg(not(has_cuda))]
            return Err("CUDA was not built".to_string());
        }
        Backend::Mpi => return Err("live MPI is not supported".to_string()),
    })
}
