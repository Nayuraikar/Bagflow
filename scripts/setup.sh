#!/bin/sh
# Check the prerequisites, install the web packages and build the API.
set -eu
cd "$(dirname "$0")/.."

fail() { echo "setup: $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

echo "Checking prerequisites"
have cargo || fail "cargo not found. Install Rust with rustup: https://rustup.rs"
# run in the repo, so rustup picks (and if needed installs) the version in rust-toolchain.toml
cargo --version || fail "cargo does not run"

have node || fail "node not found. Install Node 24 (see web/.nvmrc): https://nodejs.org"
have npm || fail "npm not found. It comes with Node"
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a >= 24 || (a === 22 && b >= 22) ? 0 : 1)' ||
    fail "Node $(node --version) is too old. Use Node 24 (see web/.nvmrc), or 22.22 or later"
echo "node $(node --version)"

have curl || fail "curl not found (scripts/start.sh uses it)"
have "${CXX:-c++}" || fail "no C++ compiler. macOS: xcode-select --install. Debian or Ubuntu: sudo apt install build-essential"

# libomp is optional: without it only the OpenMP kernel is unavailable
if [ "$(uname -s)" = Darwin ]; then
    prefix=
    for p in ${LIBOMP_PREFIX:-/opt/homebrew/opt/libomp /usr/local/opt/libomp}; do
        if [ -f "$p/include/omp.h" ]; then prefix=$p; break; fi
    done
    if [ -n "$prefix" ]; then
        echo "libomp: $prefix"
    else
        echo "libomp: not found. Optional; without it the OpenMP backend is Unavailable (brew install libomp)"
    fi
else
    if printf '#include <omp.h>\nint main() { return omp_get_max_threads() > 0 ? 0 : 1; }\n' |
        "${CXX:-c++}" -fopenmp -x c++ - -o /dev/null >/dev/null 2>&1; then
        echo "OpenMP: the C++ compiler supports it"
    else
        echo "OpenMP: not supported by the C++ compiler. Optional; the OpenMP backend will be Unavailable (install libgomp, or libomp for clang)"
    fi
fi

echo "Installing web packages"
(cd web && npm ci)

echo "Building the API (release)"
# have the build look for the optional backends again, in case one was installed since the last build
touch crates/bagflow-kernels/build.rs
cargo build --release -p bagflow-api

echo "Setup done. Next: scripts/start.sh"
