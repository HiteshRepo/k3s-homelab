# llmfit Integration

Run [llmfit](https://www.llmfit.org/) in the k3s cluster to analyze node hardware and recommend optimal LLMs.

## Goals

1. Run llmfit as a one-shot pod in the cluster (detects real node hardware)
2. Maintain a `custom_models.json` for models not yet in the built-in catalog

---

## Task 1: Run llmfit as a Pod

Run llmfit as an ephemeral pod so it detects the actual hardware of the k3s node.

```bash
kubectl run llmfit --rm -it --restart=Never \
  --image=ghcr.io/alexsjones/llmfit \
  -- recommend --use-case coding --json
```

### Considerations

- If the cluster has multiple nodes, add a `nodeSelector` or `nodeName` to target the GPU node
- The pod runs and exits — no persistent deployment needed
- Output can be piped to `jq` for filtering:
  ```bash
  kubectl run llmfit --rm -it --restart=Never \
    --image=ghcr.io/alexsjones/llmfit \
    -- recommend --use-case coding --json | jq '.models[].name'
  ```

### Optional: Add custom_models.json via ConfigMap

Mount a ConfigMap containing `custom_models.json` and set `LLMFIT_CUSTOM_MODELS` env var so the pod picks up models not in the built-in catalog (see Task 2).

---

## Task 2: Add Latest Models via custom_models.json

Maintain a local model override file for models newer than the llmfit release.

### File location (on the k3s node)

```
~/.local/share/llmfit/custom_models.json
```

Or set the env var to any path:

```bash
export LLMFIT_CUSTOM_MODELS=/path/to/custom_models.json
```

### Schema

```json
[
  {
    "name": "model-name:tag",
    "provider": "ollama",
    "parameter_count": 72,
    "min_ram_gb": 40,
    "recommended_ram_gb": 48,
    "min_vram_gb": 40,
    "quantization": "Q4_K_M",
    "context_length": 128000,
    "use_case": "coding"
  }
]
```

- `name` matches the Ollama pull tag (e.g. `qwen2.5:72b`)
- Entries with the same name as a built-in model **override** it
- New names are **added** alongside the built-in catalog
- Reference schema: `llmfit-core/data/schema.json` for optional fields (`is_moe`, `num_hidden_layers`)

### When to update

Add an entry here whenever a new model is released on `ollama.com/library` that llmfit does not yet include in its built-in catalog.

---

## References

- llmfit website: https://www.llmfit.org/
- llmfit GitHub: https://github.com/AlexsJones/llmfit
- Custom models docs: https://github.com/AlexsJones/llmfit/blob/main/docs/custom-models.md
- Ollama library: https://ollama.com/library
