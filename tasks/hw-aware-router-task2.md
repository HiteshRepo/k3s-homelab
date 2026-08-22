# Hardware-Aware Router — Task 2: Routing Logic and Ollama Proxy

Add a `/generate` endpoint that uses the hardware profile from Task 1 to pick the right Ollama model variant (fp16 vs quantized) automatically, then proxies the request to Ollama.

## Goal

A single POST to `/generate` with a model name and prompt should:
1. Compute the roofline verdict for that model on the current GPU
2. Select the optimal quantization variant
3. Forward the request to Ollama using the chosen variant
4. Return the response plus the routing decision

---

## Model Registry

Create `hw_router/models.py`:

```python
from dataclasses import dataclass

@dataclass
class ModelSpec:
    param_billions: float
    layers: int
    # Ollama tag per quantization level
    variants: dict[str, str]   # dtype → ollama_tag

# Add models you have pulled in Ollama
REGISTRY: dict[str, ModelSpec] = {
    "qwen2.5:1.5b": ModelSpec(
        param_billions=1.54,
        layers=28,
        variants={
            "fp16":  "qwen2.5:1.5b-instruct-fp16",
            "int8":  "qwen2.5:1.5b-instruct-q8_0",
            "int4":  "qwen2.5:1.5b-instruct-q4_K_M",
        },
    ),
    "qwen2.5:7b": ModelSpec(
        param_billions=7.6,
        layers=32,
        variants={
            "fp16":  "qwen2.5:7b-instruct-fp16",
            "int8":  "qwen2.5:7b-instruct-q8_0",
            "int4":  "qwen2.5:7b-instruct-q4_K_M",
        },
    ),
}

DTYPE_BYTES = {"fp16": 2.0, "int8": 1.0, "int4": 0.5}
```

## Routing Logic

Create `hw_router/router.py`:

```python
from models import REGISTRY, DTYPE_BYTES, ModelSpec
from profiler import HardwareProfile

def pick_variant(profile: HardwareProfile, model_key: str) -> tuple[str, str, str]:
    """
    Returns (dtype, ollama_tag, reason).
    Strategy:
      - Compute roofline for fp16; if bandwidth-bound, drop to int4 to shift the bottleneck.
      - If still bandwidth-bound in int4, use int4 (best we can do).
      - If dispatch-bound in fp16, stay fp16 (quantization won't help).
    """
    spec = REGISTRY[model_key]

    def bottleneck(dtype: str) -> str:
        return profile.bottleneck(spec.param_billions, spec.layers, DTYPE_BYTES[dtype])

    if bottleneck("fp16") == "bandwidth":
        if bottleneck("int4") == "dispatch":
            dtype = "int4"
            reason = "fp16 bandwidth-bound → int4 shifts to dispatch regime"
        else:
            dtype = "int4"
            reason = "fp16 bandwidth-bound → int4 reduces memory pressure"
    else:
        dtype = "fp16"
        reason = "dispatch-bound → quantization won't help, use full precision"

    tag = spec.variants[dtype]
    return dtype, tag, reason
```

## `/generate` Endpoint

Add to `hw_router/main.py`:

```python
import httpx
from pydantic import BaseModel
from router import pick_variant

OLLAMA_URL = "http://ollama.ollama.svc.cluster.local:11434"  # in-cluster

class GenerateRequest(BaseModel):
    model: str          # e.g. "qwen2.5:1.5b"
    prompt: str
    num_predict: int = 200

@app.post("/generate")
async def generate(req: GenerateRequest):
    dtype, ollama_tag, reason = pick_variant(_profile, req.model)

    payload = {
        "model": ollama_tag,
        "prompt": req.prompt,
        "options": {"num_predict": req.num_predict},
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
    data = resp.json()

    return {
        "response": data["response"],
        "routing": {
            "requested_model": req.model,
            "selected_variant": ollama_tag,
            "dtype": dtype,
            "reason": reason,
        },
        "stats": {
            "eval_count": data.get("eval_count"),
            "eval_duration_ms": round(data.get("eval_duration", 0) / 1e6, 1),
            "tok_s": round(
                data.get("eval_count", 0) / (data.get("eval_duration", 1) / 1e9), 1
            ),
        },
    }
```

## Testing

```bash
curl -X POST http://localhost:8080/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen2.5:1.5b", "prompt": "Explain CUDA graphs in one paragraph."}'
```

## Expected Response

```json
{
  "response": "...",
  "routing": {
    "requested_model": "qwen2.5:1.5b",
    "selected_variant": "qwen2.5:1.5b-instruct-fp16",
    "dtype": "fp16",
    "reason": "dispatch-bound → quantization won't help, use full precision"
  },
  "stats": { "eval_count": 82, "eval_duration_ms": 2140, "tok_s": 38.3 }
}
```

## References

- [Ollama generate API](https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-completion)
- [httpx async client](https://www.python-httpx.org/async/)
- [FastAPI Pydantic models](https://fastapi.tiangolo.com/tutorial/body/)
