# Hardware-Aware Router — Task 1: GPU Profiler Service

Build a startup profiler that measures the GPU's actual bandwidth and kernel latency, then exposes the hardware profile via a `/hardware` endpoint. This powers all routing decisions made in Tasks 2 and 3.

## Goal

A FastAPI service that, on startup, runs the benchmarks from Project 1 and caches the result in memory. Subsequent requests to `/hardware` return the profile instantly without re-benchmarking.

---

## Implementation

Create `hw_router/profiler.py`:

```python
import time
import torch
from dataclasses import dataclass

@dataclass
class HardwareProfile:
    device_name: str
    bandwidth_gb_s: float
    kernel_latency_us: float

    def bottleneck(self, param_billions: float, layers: int, dtype_bytes: float) -> str:
        model_bytes = param_billions * 1e9 * dtype_bytes
        bw_ceiling = (self.bandwidth_gb_s * 1e9) / model_bytes
        dispatch_ceiling = 1.0 / (layers * 2 * self.kernel_latency_us * 1e-6)
        return "bandwidth" if bw_ceiling < dispatch_ceiling else "dispatch"

def profile_gpu(bandwidth_iterations=10, latency_iterations=500) -> HardwareProfile:
    if not torch.cuda.is_available():
        raise RuntimeError("No CUDA device found")

    device = torch.cuda.get_device_name(0)

    # Bandwidth
    n = int(0.5 * 1e9 / 4)
    src = torch.zeros(n, dtype=torch.float32, device="cuda")
    dst = torch.zeros_like(src)
    torch.cuda.synchronize()
    t0 = time.perf_counter()
    for _ in range(bandwidth_iterations):
        dst.copy_(src)
    torch.cuda.synchronize()
    bw = (2 * 0.5e9 * bandwidth_iterations) / (time.perf_counter() - t0) / 1e9

    # Kernel launch latency
    x = torch.tensor([1.0], device="cuda")
    for _ in range(50):
        _ = x + x
    torch.cuda.synchronize()
    t0 = time.perf_counter()
    for _ in range(latency_iterations):
        _ = x + x
    torch.cuda.synchronize()
    lat_us = (time.perf_counter() - t0) / latency_iterations * 1e6

    return HardwareProfile(device_name=device, bandwidth_gb_s=bw, kernel_latency_us=lat_us)
```

Create `hw_router/main.py`:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from profiler import profile_gpu, HardwareProfile

_profile: HardwareProfile | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _profile
    print("Profiling GPU hardware...")
    _profile = profile_gpu()
    print(f"  Device   : {_profile.device_name}")
    print(f"  Bandwidth: {_profile.bandwidth_gb_s:.1f} GB/s")
    print(f"  Latency  : {_profile.kernel_latency_us:.2f} μs")
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/hardware")
def hardware():
    return {
        "device": _profile.device_name,
        "bandwidth_gb_s": round(_profile.bandwidth_gb_s, 1),
        "kernel_latency_us": round(_profile.kernel_latency_us, 2),
    }
```

## Running It

```bash
pip install fastapi uvicorn torch
uvicorn hw_router.main:app --host 0.0.0.0 --port 8080
curl http://localhost:8080/hardware
```

## Expected Response

```json
{
  "device": "Tesla T4",
  "bandwidth_gb_s": 298.4,
  "kernel_latency_us": 4.81
}
```

## Considerations

- Profiling runs once at startup (~2 seconds) and is cached — do not re-profile per request
- If the service runs inside a Kubernetes pod, ensure the pod has GPU resource limits (`nvidia.com/gpu: 1`) so the profiler hits real hardware
- Add a `GET /hardware/refresh` endpoint (admin-only) if you want to re-profile after thermal conditions change

## References

- [FastAPI lifespan events](https://fastapi.tiangolo.com/advanced/events/)
- [NVIDIA GPU specs (T4, A10, etc.)](https://www.techpowerup.com/gpu-specs/)
