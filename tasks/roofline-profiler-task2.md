# Roofline Profiler — Task 2: Compute Roofline Bounds for a Model

Given the hardware constants from Task 1 and a model's parameter count + dtype, calculate the theoretical maximum tokens/sec under each bottleneck regime.

## Goal

For a chosen model (e.g. Qwen2.5-1.5B in fp16), compute:
- **Bandwidth ceiling:** tokens/sec if the only limit is VRAM → compute throughput
- **Dispatch ceiling:** tokens/sec if the only limit is CPU kernel-launch overhead
- **Verdict:** which ceiling is lower (that is your actual bottleneck)

---

## Implementation

Create `roofline_profiler/roofline.py`:

```python
# Hardware constants — fill in from Task 1 measurements
BANDWIDTH_GB_S = 298.4     # your measured value
KERNEL_LATENCY_US = 4.81   # your measured value

DTYPE_BYTES = {"fp32": 4, "fp16": 2, "int8": 1, "int4": 0.5}

def bandwidth_ceiling(param_billions: float, dtype: str) -> float:
    """
    Each decode step streams all model weights once.
    tokens/sec = bandwidth / bytes_per_token
    bytes_per_token = param_count * bytes_per_param
    """
    bytes_per_param = DTYPE_BYTES[dtype]
    model_bytes = param_billions * 1e9 * bytes_per_param
    return (BANDWIDTH_GB_S * 1e9) / model_bytes

def dispatch_ceiling(layers: int) -> float:
    """
    Each decode step fires ~2 kernels per layer (attn + FFN).
    tokens/sec = 1 / (kernels_per_step * latency_per_kernel)
    """
    kernels_per_step = layers * 2
    step_latency_s = kernels_per_step * KERNEL_LATENCY_US * 1e-6
    return 1.0 / step_latency_s

def analyze(name: str, param_billions: float, layers: int, dtype: str):
    bw = bandwidth_ceiling(param_billions, dtype)
    dp = dispatch_ceiling(layers)
    bottleneck = "bandwidth-bound" if bw < dp else "dispatch-bound"
    print(f"\n{name} ({dtype})")
    print(f"  Bandwidth ceiling : {bw:>8.1f} tok/s")
    print(f"  Dispatch ceiling  : {dp:>8.1f} tok/s")
    print(f"  Bottleneck        : {bottleneck}")
    print(f"  Recommended fix   : {'quantize (int4/int8)' if bottleneck == 'bandwidth-bound' else 'CUDA graph capture'}")

if __name__ == "__main__":
    # Qwen2.5-1.5B: 1.54B params, 28 layers
    analyze("Qwen2.5-1.5B", param_billions=1.54, layers=28, dtype="fp16")
    analyze("Qwen2.5-1.5B", param_billions=1.54, layers=28, dtype="int4")
    # Add your own models here
```

## Expected Output

```
Qwen2.5-1.5B (fp16)
  Bandwidth ceiling :    193.5 tok/s
  Dispatch ceiling  :    894.2 tok/s
  Bottleneck        : bandwidth-bound
  Recommended fix   : quantize (int4/int8)

Qwen2.5-1.5B (int4)
  Bandwidth ceiling :    774.0 tok/s
  Dispatch ceiling  :    894.2 tok/s
  Bottleneck        : dispatch-bound
  Recommended fix   : CUDA graph capture
```

## Model Reference

| Model | Params (B) | Layers |
|-------|-----------|--------|
| Qwen2.5-1.5B | 1.54 | 28 |
| Qwen2.5-7B | 7.6 | 32 |
| Llama-3.2-3B | 3.2 | 28 |
| Phi-3.5-mini | 3.8 | 32 |

Find layer counts via `ollama show <model> --modelinfo` or the model's `config.json` on HuggingFace.

## References

- [Roofline model — Wikipedia](https://en.wikipedia.org/wiki/Roofline_model)
- [Hardware-Aware Gateway explorer](https://rahu378.github.io/hardware-aware-gateway/)
