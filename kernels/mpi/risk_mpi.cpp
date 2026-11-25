// Phase 6d: deadline-risk kernel distributed over MPI ranks.
// File layout (BFLW0001): 16-byte header (magic, n), then columns id,pax,flight (u32 each),
// weight (u16), priority (u8), flags (u8), arrival (u32), deadline (u32).
#include <mpi.h>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

static void die(const char* m) {
    fprintf(stderr, "%s\n", m);
    MPI_Abort(MPI_COMM_WORLD, 1);
}

static void rd(FILE* f, uint64_t off, void* dst, size_t bytes) {
    if (bytes == 0) return;
    if (fseeko(f, (off_t)off, SEEK_SET) != 0) die("seek failed");
    if (fread(dst, 1, bytes, f) != bytes) die("read failed");
}

struct Acc { int64_t lt, cr, sm; };

static Acc risk(const uint32_t* a, const uint32_t* d, const uint8_t* f, size_t n) {
    int64_t lt = 0, cr = 0, sm = 0;
    for (size_t i = 0; i < n; i++) {
        uint32_t fl = f[i];
        uint32_t est = 1200u + 600u * ((fl >> 1) & 1u) + 300u * (fl & 1u);
        int32_t s = (int32_t)(d[i] - a[i] - est);
        lt += (s < 1800);
        cr += (s < 600);
        sm += s;
    }
    return {lt, cr, sm};
}

int main(int argc, char** argv) {
    MPI_Init(&argc, &argv);
    int rank, size;
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    MPI_Comm_size(MPI_COMM_WORLD, &size);
    if (argc < 2) {
        if (rank == 0) fprintf(stderr, "usage: risk_mpi <bags.bin> [mode 0=read 1=scatter]\n");
        MPI_Finalize();
        return 1;
    }
    const char* path = argv[1];
    int mode = argc > 2 ? atoi(argv[2]) : 0;
    const int reps = 10;

    uint64_t n = 0;
    if (rank == 0) {
        FILE* f = fopen(path, "rb");
        if (!f) die("cannot open file");
        char hdr[16];
        rd(f, 0, hdr, 16);
        if (memcmp(hdr, "BFLW0001", 8) != 0) die("bad magic");
        memcpy(&n, hdr + 8, 8);
        fclose(f);
    }
    MPI_Bcast(&n, 1, MPI_UINT64_T, 0, MPI_COMM_WORLD);

    std::vector<int> cnt(size), disp(size);
    for (int r = 0; r < size; r++) {
        uint64_t lo = n * r / size, hi = n * (r + 1) / size;
        disp[r] = (int)lo;
        cnt[r] = (int)(hi - lo);
    }
    size_t m = cnt[rank];
    std::vector<uint32_t> a(m), d(m);
    std::vector<uint8_t> f(m);

    // ---- load / distribute ----
    MPI_Barrier(MPI_COMM_WORLD);
    double t0 = MPI_Wtime();
    if (mode == 0) {
        FILE* fp = fopen(path, "rb");
        if (!fp) die("cannot open file");
        uint64_t lo = disp[rank];
        rd(fp, 16 + 16 * n + 4 * lo, a.data(), 4 * m);
        rd(fp, 16 + 20 * n + 4 * lo, d.data(), 4 * m);
        rd(fp, 16 + 15 * n + lo, f.data(), m);
        fclose(fp);
    } else {
        std::vector<uint32_t> A, D;
        std::vector<uint8_t> F;
        if (rank == 0) {
            A.resize(n); D.resize(n); F.resize(n);
            FILE* fp = fopen(path, "rb");
            if (!fp) die("cannot open file");
            rd(fp, 16 + 16 * n, A.data(), 4 * n);
            rd(fp, 16 + 20 * n, D.data(), 4 * n);
            rd(fp, 16 + 15 * n, F.data(), n);
            fclose(fp);
        }
        MPI_Scatterv(A.data(), cnt.data(), disp.data(), MPI_UINT32_T, a.data(), (int)m, MPI_UINT32_T, 0, MPI_COMM_WORLD);
        MPI_Scatterv(D.data(), cnt.data(), disp.data(), MPI_UINT32_T, d.data(), (int)m, MPI_UINT32_T, 0, MPI_COMM_WORLD);
        MPI_Scatterv(F.data(), cnt.data(), disp.data(), MPI_UINT8_T, f.data(), (int)m, MPI_UINT8_T, 0, MPI_COMM_WORLD);
    }
    MPI_Barrier(MPI_COMM_WORLD);
    double io = MPI_Wtime() - t0;

    // ---- compute (best of reps, slowest rank per rep) and reduce ----
    double best_comp = 1e30, best_red = 1e30;
    Acc r{0, 0, 0};
    int64_t glob[3] = {0, 0, 0};
    for (int rep = 0; rep < reps; rep++) {
        MPI_Barrier(MPI_COMM_WORLD);
        double c0 = MPI_Wtime();
        r = risk(a.data(), d.data(), f.data(), m);
        double c = MPI_Wtime() - c0, cmax = 0;
        MPI_Reduce(&c, &cmax, 1, MPI_DOUBLE, MPI_MAX, 0, MPI_COMM_WORLD);

        int64_t loc[3] = {r.lt, r.cr, r.sm};
        MPI_Barrier(MPI_COMM_WORLD);
        double r0 = MPI_Wtime();
        MPI_Reduce(loc, glob, 3, MPI_INT64_T, MPI_SUM, 0, MPI_COMM_WORLD);
        double rt = MPI_Wtime() - r0;
        if (rank == 0) {
            if (cmax < best_comp) best_comp = cmax;
            if (rt < best_red) best_red = rt;
        }
    }
    if (rank == 0) {
        printf("RESULT %s %d %llu %.3f %.3f %.4f %lld %lld %lld %lld\n",
               mode ? "scatter" : "read", size, (unsigned long long)n,
               io * 1e3, best_comp * 1e3, best_red * 1e3,
               (long long)((int64_t)n - glob[0]), (long long)(glob[0] - glob[1]), (long long)glob[1], (long long)glob[2]);
    }
    MPI_Finalize();
    return 0;
}
