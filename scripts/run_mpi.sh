#!/bin/bash
# usage: scripts/run_mpi.sh [bags.bin] [max ranks]
# On Kaggle: MPI_EXTRA="--allow-run-as-root --oversubscribe" scripts/run_mpi.sh results/bags_seed42.bin 4
set -e
cd "$(dirname "$0")/.."
FILE=${1:-results/bags_seed42.bin}
MAXP=${2:-8}
for tool in mpicxx mpirun; do
  command -v $tool >/dev/null 2>&1 || { echo "MPI is not available: $tool not found (macOS: brew install open-mpi; Ubuntu: apt install openmpi-bin libopenmpi-dev)" >&2; exit 1; }
done
[ -f "$FILE" ] || { echo "no bag file at $FILE; create it with: cargo run --release -p bagflow-sim -- gen --bags 50000000" >&2; exit 1; }
mkdir -p bin
mpicxx -O3 -std=c++17 kernels/mpi/risk_mpi.cpp -o bin/risk_mpi
{
for mode in 0 1; do
  p=1
  while [ $p -le $MAXP ]; do
    mpirun $MPI_EXTRA -np $p bin/risk_mpi "$FILE" $mode | grep '^RESULT'
    p=$((p*2))
  done
done
} | awk 'BEGIN{printf "%-8s %5s %10s %11s %10s %9s %12s  %s\n","mode","ranks","load ms","compute ms","reduce ms","compute","end-to-end","result"}
{ m=$2; tot=$5+$6+$7; res=$8" "$9" "$10" "$11;
  if(!(m in bc)){bc[m]=$6; bt[m]=tot}
  if(ref==""){ref=res}
  printf "%-8s %5d %10.1f %11.2f %10.3f %8.2fx %11.2fx  %s\n",m,$3,$5,$6,$7,bc[m]/$6,bt[m]/tot,(res==ref?"identical":"MISMATCH")}
END{print "\nbags: on-track / at-risk / critical / slack sum = " ref}'
