# CUDA Graph Demo — Task 1: Eager Decode Baseline

Load a small transformer model in PyTorch and benchmark token generation in eager execution mode. This is the baseline you will compare against CUDA graph replay in Task 2.

## Goal

Measure tokens/sec for autoregressive decode in **eager mode** — where the CPU re-dispatches every kernel for every token — so you can see the dispatch overhead directly.

---

## Implementation

Create `cuda_graph_demo/eager_baseline.py`:

```python
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_ID = "Qwen/Qwen2.5-1.5B"   # ~3GB in fp16, fits a T4
DEVICE = "cuda"
NUM_TOKENS = 100

def load_model():
    tok = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, torch_dtype=torch.float16, device_map=DEVICE
    )
    model.eval()
    return model, tok

def decode_eager(model, input_ids: torch.Tensor, num_tokens: int) -> float:
    """
    Generate `num_tokens` tokens one at a time in eager mode.
    Returns tokens/sec for the decode phase only (excludes prefill).
    """
    generated = input_ids.clone()

    # Prefill (not measured)
    with torch.no_grad():
        out = model(generated, use_cache=True)
    past = out.past_key_values

    # Decode — measured
    torch.cuda.synchronize()
    start = time.perf_counter()
    with torch.no_grad():
        for _ in range(num_tokens):
            last_token = generated[:, -1:]
            out = model(last_token, past_key_values=past, use_cache=True)
            past = out.past_key_values
            next_tok = out.logits[:, -1, :].argmax(dim=-1, keepdim=True)
            generated = torch.cat([generated, next_tok], dim=-1)
    torch.cuda.synchronize()
    elapsed = time.perf_counter() - start

    return num_tokens / elapsed

if __name__ == "__main__":
    model, tok = load_model()
    prompt = "The roofline model explains GPU performance because"
    input_ids = tok(prompt, return_tensors="pt").input_ids.to(DEVICE)

    # Warm-up run (fills CUDA caches)
    decode_eager(model, input_ids, num_tokens=10)

    # Measured run
    toks_per_sec = decode_eager(model, input_ids, num_tokens=NUM_TOKENS)
    print(f"Eager decode: {toks_per_sec:.1f} tok/s")
```

## Expected Output

```
Eager decode: 38.4 tok/s   # rough T4 baseline — your number will differ
```

## Considerations

- Use `torch_dtype=torch.float16` — fp32 doubles model size and halves bandwidth-bound performance
- `use_cache=True` is critical — without KV cache, prefill re-runs on every step and you're measuring the wrong thing
- The warm-up run matters: first-pass CUDA kernel compilation inflates latency; always discard it

## Dependencies

```bash
pip install torch transformers accelerate
# Model downloads ~3GB on first run
```

## References

- [Transformers past_key_values docs](https://huggingface.co/docs/transformers/main_classes/output#transformers.modeling_outputs.CausalLMOutputWithPast)
- [Qwen2.5 model card](https://huggingface.co/Qwen/Qwen2.5-1.5B)
