#include <cstdint>
#include <cstddef>
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

}
