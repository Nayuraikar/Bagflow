// Phase 6b: deadline-risk kernel on the Apple GPU (Metal). Objective-C++ host + MSL shader compiled at runtime.
#import <Metal/Metal.h>
#import <Foundation/Foundation.h>
#include <chrono>
#include <cstdint>
#include <cstring>

static const char* kSrc = R"MSL(
#include <metal_stdlib>
using namespace metal;

kernel void risk(device const uint*  arr  [[buffer(0)]],
                 device const uint*  dl   [[buffer(1)]],
                 device const uchar* fl   [[buffer(2)]],
                 device uchar*       out  [[buffer(3)]],
                 device uint*        part [[buffer(4)]],
                 constant uint&      n    [[buffer(5)]],
                 uint gid  [[thread_position_in_grid]],
                 uint tid  [[thread_index_in_threadgroup]],
                 uint tgid [[threadgroup_position_in_grid]],
                 uint sg   [[simdgroup_index_in_threadgroup]],
                 uint lane [[thread_index_in_simdgroup]],
                 uint nsg  [[simdgroups_per_threadgroup]])
{
    uint lt = 0, cr = 0;
    int sm = 0;
    if (gid < n) {
        uint f = fl[gid];
        uint est = 1200u + 600u * ((f >> 1) & 1u) + 300u * (f & 1u);
        int s = (int)(dl[gid] - arr[gid] - est);
        uint a = (s < 1800) ? 1u : 0u;
        uint b = (s < 600) ? 1u : 0u;
        out[gid] = (uchar)(a + b);
        lt = a; cr = b; sm = s;
    }
    lt = simd_sum(lt);
    cr = simd_sum(cr);
    sm = simd_sum(sm);

    threadgroup uint sh[96];
    if (lane == 0) {
        sh[sg * 3 + 0] = lt;
        sh[sg * 3 + 1] = cr;
        sh[sg * 3 + 2] = (uint)sm;
    }
    threadgroup_barrier(mem_flags::mem_threadgroup);
    if (tid == 0) {
        uint L = 0, C = 0;
        int S = 0;
        for (uint i = 0; i < nsg; i++) {
            L += sh[i * 3 + 0];
            C += sh[i * 3 + 1];
            S += (int)sh[i * 3 + 2];
        }
        part[tgid * 3 + 0] = L;
        part[tgid * 3 + 1] = C;
        part[tgid * 3 + 2] = (uint)S;
    }
}
)MSL";

struct Ctx {
    id<MTLDevice> dev;
    id<MTLCommandQueue> q;
    id<MTLComputePipelineState> pso;
    id<MTLBuffer> arr, dl, fl, out, part;
    size_t cap;
    NSUInteger tg;
};

static double now_s() {
    return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

extern "C" {

void* bf_metal_create(size_t cap, char* name, size_t name_len) {
    @autoreleasepool {
        if (cap == 0) cap = 1;
        id<MTLDevice> dev = MTLCreateSystemDefaultDevice();
        if (!dev) return nullptr;
        NSError* err = nil;
        id<MTLLibrary> lib = [dev newLibraryWithSource:[NSString stringWithUTF8String:kSrc] options:nil error:&err];
        if (!lib) { NSLog(@"Metal shader compile failed: %@", err); return nullptr; }
        id<MTLFunction> fn = [lib newFunctionWithName:@"risk"];
        id<MTLComputePipelineState> pso = [dev newComputePipelineStateWithFunction:fn error:&err];
        if (!pso) { NSLog(@"Metal pipeline failed: %@", err); return nullptr; }

        Ctx* c = new Ctx();
        c->dev = dev;
        c->q = [dev newCommandQueue];
        c->pso = pso;
        c->cap = cap;
        NSUInteger tg = pso.maxTotalThreadsPerThreadgroup;
        if (tg > 256) tg = 256;
        tg = tg / 32 * 32;
        if (tg == 0) tg = 32;
        c->tg = tg;
        size_t groups = (cap + tg - 1) / tg;
        MTLResourceOptions o = MTLResourceStorageModeShared;
        c->arr  = [dev newBufferWithLength:cap * 4 options:o];
        c->dl   = [dev newBufferWithLength:cap * 4 options:o];
        c->fl   = [dev newBufferWithLength:cap options:o];
        c->out  = [dev newBufferWithLength:cap options:o];
        c->part = [dev newBufferWithLength:groups * 12 options:o];
        if (!c->arr || !c->dl || !c->fl || !c->out || !c->part || !c->q) { delete c; return nullptr; }
        if (name && name_len > 0) {
            strncpy(name, [[dev name] UTF8String], name_len - 1);
            name[name_len - 1] = 0;
        }
        return c;
    }
}

void bf_metal_destroy(void* p) { delete (Ctx*)p; }

// Host -> GPU-visible buffers. Returns seconds.
double bf_metal_upload(void* p, const uint32_t* arr, const uint32_t* dl, const uint8_t* fl, size_t n) {
    Ctx* c = (Ctx*)p;
    double t0 = now_s();
    memcpy([c->arr contents], arr, n * 4);
    memcpy([c->dl contents], dl, n * 4);
    memcpy([c->fl contents], fl, n);
    return now_s() - t0;
}

// Returns GPU execution time (GPU timestamps); wall_s gets CPU-side time including launch and wait.
double bf_metal_dispatch(void* p, size_t n, double* wall_s) {
    Ctx* c = (Ctx*)p;
    if (n == 0) { *wall_s = 0; return 0; }
    @autoreleasepool {
        double t0 = now_s();
        id<MTLCommandBuffer> cb = [c->q commandBuffer];
        id<MTLComputeCommandEncoder> e = [cb computeCommandEncoder];
        [e setComputePipelineState:c->pso];
        [e setBuffer:c->arr offset:0 atIndex:0];
        [e setBuffer:c->dl offset:0 atIndex:1];
        [e setBuffer:c->fl offset:0 atIndex:2];
        [e setBuffer:c->out offset:0 atIndex:3];
        [e setBuffer:c->part offset:0 atIndex:4];
        uint32_t nn = (uint32_t)n;
        [e setBytes:&nn length:4 atIndex:5];
        NSUInteger groups = (n + c->tg - 1) / c->tg;
        [e dispatchThreadgroups:MTLSizeMake(groups, 1, 1) threadsPerThreadgroup:MTLSizeMake(c->tg, 1, 1)];
        [e endEncoding];
        [cb commit];
        [cb waitUntilCompleted];
        *wall_s = now_s() - t0;
        return cb.GPUEndTime - cb.GPUStartTime;
    }
}

// GPU buffers -> host, plus the final sum of the per-group partials. Returns seconds.
double bf_metal_download(void* p, size_t n, uint8_t* out, uint64_t* counts, int64_t* slack_sum) {
    Ctx* c = (Ctx*)p;
    double t0 = now_s();
    memcpy(out, [c->out contents], n);
    size_t groups = (n + c->tg - 1) / c->tg;
    const uint32_t* part = (const uint32_t*)[c->part contents];
    uint64_t L = 0, C = 0;
    int64_t S = 0;
    for (size_t g = 0; g < groups; g++) {
        L += part[3 * g];
        C += part[3 * g + 1];
        S += (int32_t)part[3 * g + 2];
    }
    counts[0] = n - L;
    counts[1] = L - C;
    counts[2] = C;
    *slack_sum = S;
    return now_s() - t0;
}

}
