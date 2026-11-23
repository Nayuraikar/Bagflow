#!/bin/bash
echo "arch: $(uname -m)"
rustc --version && cargo --version
node --version && npm --version
python3 --version
cmake --version | head -1
mpirun --version | head -1
ls /opt/homebrew/opt/libomp >/dev/null 2>&1 && echo "libomp: ok" || echo "libomp: missing"
xcrun -find metal >/dev/null 2>&1 && echo "metal compiler: ok" || echo "metal compiler: missing (install Xcode)"
