# Roofline Profiler — Task 1: Measure GPU Hardware Limits

Benchmark your GPU's actual memory bandwidth and kernel launch latency so you have ground-truth numbers to anchor the roofline model.

## Goal

Produce two measured constants for your GPU:
- **Bandwidth (GB/s):** how fast data can be streamed from VRAM to compute units
- **Kernel launch latency (μs):** CPU overhead to dispatch a single CUDA kernel

These are the x- and y-axis anchors of the roofline chart.

---

## Implementation

Create `roofline_profiler/measure_hardware.py`:

```python
import torch
import time

def measure_bandwidth(size_gb=1.0, iterations=20):
    """Stream a large tensor to saturate memory bus, report GB/s."""
    n = int(size_gb * 1e9 / 4)  # float32 elements
    src = torch.zeros(n, dtype=torch.float32, device="cuda")
    dst = torch.zeros_like(src)

    torch.cuda.synchronize()
    start = time.perf_counter()
    for _ in range(iterations):
        dst.copy_(src)
    torch.cuda.synchronize()
    elapsed = time.perf_counter() - start

    bytes_moved = 2 * size_gb * 1e9 * iterations  # read + write
    return bytes_moved / elapsed / 1e9  # GB/s

def measure_kernel_latency(iterations=1000):
    """Time the smallest possible CUDA op to isolate dispatch overhead."""
    x = torch.tensor([1.0], device="cuda")

    # warm-up
    for _ in range(50):
        _ = x + x
    torch.cuda.synchronize()

    start = time.perf_counter()
    for _ in range(iterations):
        _ = x + x
    torch.cuda.synchronize()
    elapsed = time.perf_counter() - start

    return (elapsed / iterations) * 1e6  # μs per kernel

if __name__ == "__main__":
    bw = measure_bandwidth()
    lat = measure_kernel_latency()
    print(f"Memory bandwidth : {bw:.1f} GB/s")
    print(f"Kernel launch lat: {lat:.2f} μs")
```

## Expected Output

```
Memory bandwidth : 298.4 GB/s   # T4 theoretical peak ~320 GB/s
Kernel launch lat: 4.81 μs
```

## Considerations

- Run on the actual GPU node, not inside a container — `kubectl exec` into the Ollama pod or SSH to the node
- Repeat 3× and take the median; thermal throttling can skew a single run
- Record results in a comment at the top of the file — you'll hard-code them as constants in Task 2

## References

- [CUDA best practices — memory bandwidth](https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html#memory-bandwidth)
- [Hardware-Aware Gateway explorer](https://rahu378.github.io/hardware-aware-gateway/)
