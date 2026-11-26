//! Records of work as it actually ran. Times are nanoseconds since the job's start instant.

use std::time::Instant;

/// One chunk of a workload, run by one worker.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Task {
    /// Chunk number in workload order.
    pub id: u32,
    /// Index of the thread in its pool. Always 0 for single-threaded runs.
    pub worker: u32,
    pub start_ns: u64,
    pub end_ns: u64,
    /// Bags covered.
    pub size: u64,
}

/// A named step of a job. `parallel` says whether the step uses more than one worker.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Stage {
    pub name: &'static str,
    pub parallel: bool,
    pub start_ns: u64,
    pub end_ns: u64,
}

pub fn since(t0: Instant) -> u64 {
    t0.elapsed().as_nanos() as u64
}

/// Run `f` as task `id`. `f` returns the number of bags it covered and its output.
pub fn task<R>(t0: Instant, id: usize, f: impl FnOnce() -> (u64, R)) -> (Task, R) {
    let worker = rayon::current_thread_index().unwrap_or(0) as u32;
    let start_ns = since(t0);
    let (size, out) = f();
    (Task { id: id as u32, worker, start_ns, end_ns: since(t0), size }, out)
}

/// Run `f` as a stage and append its record.
pub fn stage<R>(stages: &mut Vec<Stage>, t0: Instant, name: &'static str, parallel: bool, f: impl FnOnce() -> R) -> R {
    let start_ns = since(t0);
    let out = f();
    stages.push(Stage { name, parallel, start_ns, end_ns: since(t0) });
    out
}
