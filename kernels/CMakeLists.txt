cmake_minimum_required(VERSION 3.20)
project(bagflow_kernels CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_FLAGS_RELEASE "-O3")

find_package(OpenMP)
find_package(MPI)

# SIMD: pick by CPU architecture
if(CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
  message(STATUS "NEON enabled")
elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
  message(STATUS "AVX2 enabled")
  add_compile_options(-mavx2 -mfma)
endif()

include(CheckLanguage)
check_language(CUDA)
if(CMAKE_CUDA_COMPILER)
  enable_language(CUDA)
  message(STATUS "CUDA enabled")
endif()
