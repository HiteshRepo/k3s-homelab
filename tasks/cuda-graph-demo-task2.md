# CUDA Graph Demo — Task 2: CUDA Graph Capture and Replay

Capture the decode step as a CUDA graph so the CPU submits the entire token-generation kernel sequence in one shot, eliminating per-token dispatch overhead.

## Goal

Replace the per-token eager kernel dispatch with a single CUDA graph replay and measure the speedup vs the Task 1 baseline.

---

## Background

In eager mode, for every generated token the CPU:
1. Prepares inputs
2. Launches kernel 1 (attention)
3. Launches kernel 2 (FFN)
4. ... (dozens of kernels per layer)

With a CUDA graph, the CPU does steps 2–N **once** during capture, then replays the recorded sequence with a single `graph.replay()` call per token. The GPU work is identical; only the CPU overhead disappears.

---

## Implementation

Create `cuda_graph_demo/graph_decode.py`:

```python
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_ID = "Qwen/Qwen2.5-1.5B"
DEVICE = "cuda"
NUM_TOKENS = 100

def load_model():
    tok = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, torch_dtype=torch.float16, device_map=DEVICE
    )
    model.eval()
    return model, tok

def capture_graph(model, static_input_ids, static_past):
    """
    Capture one decode step into a CUDA graph.
    Returns (graph, static_logits) — static_logits is the output buffer
    that gets updated on each replay.
    """
    # Allocate static output buffer
    static_logits = None

    # Warm-up: run the step a few times so all kernels are compiled
    for _ in range(3):
        with torch.no_grad():
            out = model(static_input_ids, past_key_values=static_past, use_cache=True)
        static_past = out.past_key_values

    # Capture
    graph = torch.cuda.CUDAGraph()
    with torch.cuda.graph(graph):
        with torch.no_grad():
            out = model(static_input_ids, past_key_values=static_past, use_cache=True)
        static_logits = out.logits

    return graph, static_logits, static_past

def decode_graph(model, input_ids, num_tokens: int) -> float:
    """Generate tokens using CUDA graph replay. Returns tokens/sec."""
    # Prefill (not measured, not captured)
    with torch.no_grad():
        out = model(input_ids, use_cache=True)
    past = out.past_key_values

    # Static buffers — these must not be reallocated after capture
    static_ids = input_ids[:, -1:].clone()

    graph, static_logits, past = capture_graph(model, static_ids, past)

    generated = input_ids.clone()

    torch.cuda.synchronize()
    start = time.perf_counter()
    for _ in range(num_tokens):
        graph.replay()                                         # single CPU call
        next_tok = static_logits[:, -1, :].argmax(dim=-1, keepdim=True)
        static_ids.copy_(next_tok)                            # update in-place
        generated = torch.cat([generated, next_tok], dim=-1)
    torch.cuda.synchronize()
    elapsed = time.perf_counter() - start

    return num_tokens / elapsed

if __name__ == "__main__":
    from eager_baseline import decode_eager, load_model

    model, tok = load_model()
    prompt = "The roofline model explains GPU performance because"
    input_ids = tok(prompt, return_tensors="pt").input_ids.to(DEVICE)

    eager = decode_eager(model, input_ids, num_tokens=100)
    graph = decode_graph(model, input_ids, num_tokens=100)

    print(f"Eager  : {eager:.1f} tok/s")
    print(f"Graph  : {graph:.1f} tok/s")
    print(f"Speedup: {graph / eager:.2f}x")
```

## Expected Output

```
Eager  :  38.4 tok/s
Graph  :  65.9 tok/s
Speedup: 1.72x            # matches the paper's finding
```

## Key Constraints

- **Static shapes required:** CUDA graphs cannot handle dynamic tensor shapes. `static_ids` must always be the same shape — 1×1 for greedy decode.
- **In-place updates only:** after capture, copy new data into the static buffer with `.copy_()` rather than creating new tensors.
- **KV cache grows each step:** the captured graph uses the KV cache from the capture moment. For a production system you'd re-capture periodically or use a fixed-length sliding window.

## References

- [PyTorch CUDA graphs tutorial](https://pytorch.org/docs/stable/notes/cuda.html#cuda-graphs)
- [Hardware-Aware Gateway — 1.72× speedup result](https://rahu378.github.io/hardware-aware-gateway/)
