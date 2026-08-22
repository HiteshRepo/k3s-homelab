# CUDA Graph Demo — Task 3: Quantization × Graph Matrix

Combine quantization (int8/int4) with CUDA graph replay to measure the compound effect. Map all combinations on the roofline to confirm which optimizations help in which regime.

## Goal

Produce a 2×2 results table:

|              | Eager | CUDA Graph |
|--------------|-------|-----------|
| **fp16**     | ?     | ?         |
| **int4**     | ?     | ?         |

And overlay all four points on the roofline chart from Project 1.

---

## Implementation

Create `cuda_graph_demo/matrix_bench.py`:

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from eager_baseline import decode_eager
from graph_decode import decode_graph

MODEL_ID = "Qwen/Qwen2.5-1.5B"
DEVICE = "cuda"
NUM_TOKENS = 100
PROMPT = "The roofline model explains GPU performance because"

def load_fp16():
    tok = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, torch_dtype=torch.float16, device_map=DEVICE
    )
    return model.eval(), tok

def load_int4():
    tok = AutoTokenizer.from_pretrained(MODEL_ID)
    bnb_cfg = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16,
    )
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, quantization_config=bnb_cfg, device_map=DEVICE
    )
    return model.eval(), tok

def run_matrix():
    results = {}

    print("Loading fp16 model...")
    model, tok = load_fp16()
    ids = tok(PROMPT, return_tensors="pt").input_ids.to(DEVICE)
    results[("fp16", "eager")] = decode_eager(model, ids, NUM_TOKENS)
    results[("fp16", "graph")] = decode_graph(model, ids, NUM_TOKENS)
    del model

    print("Loading int4 model...")
    model, tok = load_int4()
    ids = tok(PROMPT, return_tensors="pt").input_ids.to(DEVICE)
    results[("int4", "eager")] = decode_eager(model, ids, NUM_TOKENS)
    # Note: CUDA graphs + bitsandbytes int4 may require extra warm-up steps
    results[("int4", "graph")] = decode_graph(model, ids, NUM_TOKENS)
    del model

    return results

def print_table(results):
    print(f"\n{'':12} {'Eager':>10} {'CUDA Graph':>12} {'Graph Speedup':>14}")
    print("-" * 52)
    for dtype in ["fp16", "int4"]:
        eager = results[(dtype, "eager")]
        graph = results[(dtype, "graph")]
        print(f"{dtype:12} {eager:>10.1f} {graph:>12.1f} {graph/eager:>13.2f}x")

if __name__ == "__main__":
    results = run_matrix()
    print_table(results)
```

## Expected Interpretation

```
             Eager   CUDA Graph  Graph Speedup
----------------------------------------------------
fp16          38.4        65.9          1.72x   ← dispatch-bound in fp16 → graph helps a lot
int4         142.0       158.3          1.12x   ← bandwidth-bound in int4 → graph helps less
```

- **fp16 + graph**: biggest win — removes dispatch overhead that dominated
- **int4 + eager**: big win from quantization alone — shifts from dispatch-bound to bandwidth-bound
- **int4 + graph**: marginal further gain — now truly bandwidth-bound, graph has little overhead to remove

## Overlay on Roofline Chart

Extend `roofline_profiler/plot.py` to accept multiple measured points:

```python
plot_roofline_multi(
    model_name="Qwen2.5-1.5B",
    bw_ceiling=193.5,      # from Project 1 Task 2
    dispatch_ceiling=894.2,
    measurements={
        "fp16 eager": 38.4,
        "fp16 graph": 65.9,
        "int4 eager": 142.0,
        "int4 graph": 158.3,
    }
)
```

## Dependencies

```bash
pip install bitsandbytes  # for int4 quantization
# bitsandbytes requires CUDA >= 11.0
```

## References

- [bitsandbytes quantization docs](https://huggingface.co/docs/transformers/quantization/bitsandbytes)
- [PyTorch CUDA graphs](https://pytorch.org/docs/stable/notes/cuda.html#cuda-graphs)
- [Hardware-Aware Gateway explorer](https://rahu378.github.io/hardware-aware-gateway/)
