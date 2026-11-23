#!/bin/bash
# Run on Kaggle (turn on GPU + Internet in notebook settings)
git clone https://github.com/Nayuraikar/Bagflow.git
cd Bagflow
nvidia-smi
nvcc --version
lscpu | grep -i avx2
apt-get install -y libopenmpi-dev openmpi-bin cmake
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
