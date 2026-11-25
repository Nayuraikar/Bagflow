// Phase 6c: deadline-risk kernel on an NVIDIA GPU. Three variants: naive atomics, warp shuffle, inline PTX.
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <chrono>
#include <cuda_runtime.h>

#define CK(x) do { cudaError_t e_ = (x); if (e_ != cudaSuccess) { \
    fprintf(stderr, "CUDA error: %s at %s:%d\n", cudaGetErrorString(e_), __FILE__, __LINE__); exit(1); } } while (0)

typedef unsigned long long ull;

__device__ __forceinline__ int slack_of(uint32_t a, uint32_t d, uint32_t f) {
    uint32_t est = 1200u + 600u * ((f >> 1) & 1u) + 300u * (f & 1u);
    return (int)(d - a - est);
}

// ---- variant 0: every thread does three global atomics ----
__global__ void k_naive(const uint32_t* arr, const uint32_t* dl, const uint8_t* fl,
                        uint8_t* out, ull* acc, uint32_t n) {
    uint32_t i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= n) return;
    int s = slack_of(arr[i], dl[i], fl[i]);
    uint32_t a = (s < 1800), b = (s < 600);
    out[i] = (uint8_t)(a + b);
    atomicAdd(&acc[0], (ull)a);
    atomicAdd(&acc[1], (ull)b);
    atomicAdd(&acc[2], (ull)(long long)s);
}

// ---- variant 1: warp-shuffle reduction, one atomic per warp ----
__global__ void k_warp(const uint32_t* arr, const uint32_t* dl, const uint8_t* fl,
                       uint8_t* out, ull* acc, uint32_t n) {
    uint32_t i = blockIdx.x * blockDim.x + threadIdx.x;
    uint32_t a = 0, b = 0;
    long long s64 = 0;
    if (i < n) {
        int s = slack_of(arr[i], dl[i], fl[i]);
        a = (s < 1800);
        b = (s < 600);
        out[i] = (uint8_t)(a + b);
        s64 = s;
    }
    // every thread of the warp takes part, including the ones past n (they hold zeros)
    #pragma unroll
    for (int o = 16; o > 0; o >>= 1) {
        a   += __shfl_down_sync(0xffffffffu, a, o);
        b   += __shfl_down_sync(0xffffffffu, b, o);
        s64 += __shfl_down_sync(0xffffffffu, s64, o);
    }
    if ((threadIdx.x & 31) == 0) {
        atomicAdd(&acc[0], (ull)a);
        atomicAdd(&acc[1], (ull)b);
        atomicAdd(&acc[2], (ull)s64);
    }
}

// ---- variant 2: the same idea in inline PTX ----
__device__ __forceinline__ uint32_t ptx_ballot(int pred) {
    uint32_t r;
    asm volatile("{ .reg .pred p; setp.ne.s32 p, %1, 0; vote.sync.ballot.b32 %0, p, 0xffffffff; }"
                 : "=r"(r) : "r"(pred));
    return r;
}
__device__ __forceinline__ uint32_t ptx_popc(uint32_t x) {
    uint32_t r;
    asm("popc.b32 %0, %1;" : "=r"(r) : "r"(x));
    return r;
}
__device__ __forceinline__ int ptx_shfl_down(int v, int o) {
    int r;
    asm volatile("shfl.sync.down.b32 %0, %1, %2, 0x1f, 0xffffffff;" : "=r"(r) : "r"(v), "r"(o));
    return r;
}

__global__ void k_ptx(const uint32_t* arr, const uint32_t* dl, const uint8_t* fl,
                      uint8_t* out, ull* acc, uint32_t n) {
    uint32_t i = blockIdx.x * blockDim.x + threadIdx.x;
    int a = 0, b = 0, s = 0;
    if (i < n) {
        s = slack_of(arr[i], dl[i], fl[i]);
        a = (s < 1800);
        b = (s < 600);
        out[i] = (uint8_t)(a + b);
    }
    uint32_t ma = ptx_ballot(a);          // one bit per lane
    uint32_t mb = ptx_ballot(b);
    #pragma unroll
    for (int o = 16; o > 0; o >>= 1) s += ptx_shfl_down(s, o);   // slack fits in int32 per warp
    if ((threadIdx.x & 31) == 0) {
        atomicAdd(&acc[0], (ull)ptx_popc(ma));
        atomicAdd(&acc[1], (ull)ptx_popc(mb));
        atomicAdd(&acc[2], (ull)(long long)s);
    }
}

struct Ctx {
    uint32_t *arr, *dl;
    uint8_t *fl, *out;
    ull* acc;
    size_t cap;
    cudaEvent_t e0, e1;
};

static double now_s() {
    return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

extern "C" {

void* bf_cuda_create(size_t cap, char* name, size_t name_len) {
    int cnt = 0;
    if (cudaGetDeviceCount(&cnt) != cudaSuccess || cnt == 0) return nullptr;
    if (cap == 0) cap = 1;
    Ctx* c = new Ctx();
    c->cap = cap;
    CK(cudaMalloc(&c->arr, cap * 4));
    CK(cudaMalloc(&c->dl, cap * 4));
    CK(cudaMalloc(&c->fl, cap));
    CK(cudaMalloc(&c->out, cap));
    CK(cudaMalloc(&c->acc, 3 * sizeof(ull)));
    CK(cudaEventCreate(&c->e0));
    CK(cudaEventCreate(&c->e1));
    if (name && name_len > 0) {
        cudaDeviceProp p;
        CK(cudaGetDeviceProperties(&p, 0));
        strncpy(name, p.name, name_len - 1);
        name[name_len - 1] = 0;
    }
    return c;
}

void bf_cuda_destroy(void* p) {
    Ctx* c = (Ctx*)p;
    cudaFree(c->arr); cudaFree(c->dl); cudaFree(c->fl); cudaFree(c->out); cudaFree(c->acc);
    cudaEventDestroy(c->e0); cudaEventDestroy(c->e1);
    delete c;
}

// host -> device (pageable memory, so this is a real PCIe copy). Returns seconds.
double bf_cuda_upload(void* p, const uint32_t* arr, const uint32_t* dl, const uint8_t* fl, size_t n) {
    Ctx* c = (Ctx*)p;
    double t0 = now_s();
    CK(cudaMemcpy(c->arr, arr, n * 4, cudaMemcpyHostToDevice));
    CK(cudaMemcpy(c->dl, dl, n * 4, cudaMemcpyHostToDevice));
    CK(cudaMemcpy(c->fl, fl, n, cudaMemcpyHostToDevice));
    CK(cudaDeviceSynchronize());
    return now_s() - t0;
}

// variant: 0 naive, 1 warp, 2 ptx. Returns kernel seconds (CUDA events); wall_s = CPU-side launch + wait.
double bf_cuda_run(void* p, int variant, size_t n, double* wall_s) {
    Ctx* c = (Ctx*)p;
    CK(cudaMemset(c->acc, 0, 3 * sizeof(ull)));
    CK(cudaDeviceSynchronize());
    if (n == 0) { *wall_s = 0; return 0; }
    uint32_t nn = (uint32_t)n;
    unsigned blocks = (unsigned)((n + 255) / 256);
    double t0 = now_s();
    CK(cudaEventRecord(c->e0));
    if (variant == 0)      k_naive<<<blocks, 256>>>(c->arr, c->dl, c->fl, c->out, c->acc, nn);
    else if (variant == 1) k_warp <<<blocks, 256>>>(c->arr, c->dl, c->fl, c->out, c->acc, nn);
    else                   k_ptx  <<<blocks, 256>>>(c->arr, c->dl, c->fl, c->out, c->acc, nn);
    CK(cudaGetLastError());
    CK(cudaEventRecord(c->e1));
    CK(cudaEventSynchronize(c->e1));
    *wall_s = now_s() - t0;
    float ms = 0;
    CK(cudaEventElapsedTime(&ms, c->e0, c->e1));
    return ms * 1e-3;
}

// device -> host. Returns seconds.
double bf_cuda_download(void* p, size_t n, uint8_t* out, uint64_t* counts, int64_t* slack_sum) {
    Ctx* c = (Ctx*)p;
    double t0 = now_s();
    if (n > 0) CK(cudaMemcpy(out, c->out, n, cudaMemcpyDeviceToHost));
    ull h[3];
    CK(cudaMemcpy(h, c->acc, sizeof(h), cudaMemcpyDeviceToHost));
    counts[0] = n - h[0];
    counts[1] = h[0] - h[1];
    counts[2] = h[1];
    *slack_sum = (int64_t)h[2];
    return now_s() - t0;
}

}
