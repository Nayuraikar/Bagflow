#include <cstdint>
#include <cstddef>
#include <chrono>
#ifdef _OPENMP
#include <omp.h>
#endif

extern "C" {

int bf_omp_threads() {
#ifdef _OPENMP
    return omp_get_max_threads();
#else
    return 1;
#endif
}

void bf_risk_omp(const uint32_t* arr, const uint32_t* dl, const uint8_t* fl, size_t n,
                 uint8_t* out, uint64_t* counts, int64_t* slack_sum) {
    uint64_t lt = 0, cr = 0;
    int64_t sm = 0;
    #pragma omp parallel for reduction(+:lt,cr,sm) schedule(static)
    for (long long i = 0; i < (long long)n; i++) {
        uint32_t f = fl[i];
        uint32_t est = 1200u + 600u * ((f >> 1) & 1u) + 300u * (f & 1u);
        int32_t s = (int32_t)(dl[i] - arr[i] - est);
        uint8_t a = (s < 1800), b = (s < 600);
        out[i] = a + b;
        lt += a; cr += b; sm += s;
    }
    counts[0] = n - lt;
    counts[1] = lt - cr;
    counts[2] = cr;
    *slack_sum = sm;
}

// The same loop split into chunks, for telemetry. schedule(static) over the chunk index
// gives each thread a contiguous block, like the plain kernel above. For chunk c the
// partial sums go to lt/cr/sm[c] and the thread and times (ns since entry) to
// worker/start_ns/end_ns[c]. The caller merges the partials.
void bf_risk_omp_traced(const uint32_t* arr, const uint32_t* dl, const uint8_t* fl, size_t n,
                        uint8_t* out, size_t chunk, int threads,
                        uint64_t* lt, uint64_t* cr, int64_t* sm,
                        uint32_t* worker, uint64_t* start_ns, uint64_t* end_ns) {
    const auto t0 = std::chrono::steady_clock::now();
    auto now = [t0]() -> uint64_t {
        return (uint64_t)std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now() - t0).count();
    };
    const long long chunks = (long long)((n + chunk - 1) / chunk);
    (void)threads;
    #pragma omp parallel for schedule(static) num_threads(threads)
    for (long long c = 0; c < chunks; c++) {
#ifdef _OPENMP
        worker[c] = (uint32_t)omp_get_thread_num();
#else
        worker[c] = 0;
#endif
        start_ns[c] = now();
        const size_t from = (size_t)c * chunk;
        const size_t to = from + chunk < n ? from + chunk : n;
        uint64_t l = 0, r = 0;
        int64_t m = 0;
        for (size_t i = from; i < to; i++) {
            uint32_t f = fl[i];
            uint32_t est = 1200u + 600u * ((f >> 1) & 1u) + 300u * (f & 1u);
            int32_t s = (int32_t)(dl[i] - arr[i] - est);
            uint8_t a = (s < 1800), b = (s < 600);
            out[i] = a + b;
            l += a; r += b; m += s;
        }
        lt[c] = l;
        cr[c] = r;
        sm[c] = m;
        end_ns[c] = now();
    }
}

}
