# Roofline Profiler — Task 3: Measure Actual Inference and Plot the Roofline

Run real inference via the Ollama API, measure achieved tokens/sec, then plot where you land relative to the theoretical ceilings computed in Task 2.

## Goal

Produce a roofline chart with:
- Horizontal lines for bandwidth ceiling and dispatch ceiling
- A marker for your measured inference speed
- Visual gap showing how far from the ceiling you are

---

## Implementation

Create `roofline_profiler/measure_inference.py`:

```python
import time
import requests

OLLAMA_URL = "http://localhost:11434"  # or kubectl port-forward

def measure_ollama_toks(model: str, prompt: str, num_tokens: int = 200) -> float:
    """Returns achieved tokens/sec for the decode phase."""
    payload = {
        "model": model,
        "prompt": prompt,
        "options": {"num_predict": num_tokens},
        "stream": False,
    }
    start = time.perf_counter()
    resp = requests.post(f"{OLLAMA_URL}/api/generate", json=payload)
    elapsed = time.perf_counter() - start
    data = resp.json()
    # Ollama reports eval_count (tokens generated) and eval_duration (ns)
    toks = data["eval_count"]
    dur_s = data["eval_duration"] / 1e9
    return toks / dur_s
```

Create `roofline_profiler/plot.py`:

```python
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

def plot_roofline(model_name, bw_ceiling, dispatch_ceiling, measured):
    fig, ax = plt.subplots(figsize=(8, 5))

    # Ceilings
    ax.axhline(bw_ceiling, color="steelblue", linestyle="--", label=f"Bandwidth ceiling ({bw_ceiling:.0f} tok/s)")
    ax.axhline(dispatch_ceiling, color="darkorange", linestyle="--", label=f"Dispatch ceiling ({dispatch_ceiling:.0f} tok/s)")

    # Measured
    ax.bar(["Measured"], [measured], color="seagreen", width=0.3, label=f"Measured ({measured:.0f} tok/s)")

    # Gap annotation
    ceiling = min(bw_ceiling, dispatch_ceiling)
    gap_pct = (ceiling - measured) / ceiling * 100
    ax.annotate(f"{gap_pct:.0f}% gap\nto roofline",
                xy=(0, measured), xytext=(0.3, (measured + ceiling) / 2),
                arrowprops=dict(arrowstyle="->"), fontsize=10)

    ax.set_ylim(0, max(bw_ceiling, dispatch_ceiling) * 1.2)
    ax.set_ylabel("Tokens / second")
    ax.set_title(f"Roofline: {model_name}")
    ax.legend()
    plt.tight_layout()
    plt.savefig(f"roofline_{model_name.replace('/', '_')}.png", dpi=150)
    print(f"Saved roofline_{model_name.replace('/', '_')}.png")

if __name__ == "__main__":
    from roofline import analyze, bandwidth_ceiling, dispatch_ceiling
    from measure_inference import measure_ollama_toks

    model = "qwen2.5:1.5b"
    bw = bandwidth_ceiling(1.54, "fp16")
    dp = dispatch_ceiling(28)
    measured = measure_ollama_toks(model, "Explain the roofline model in detail.", num_tokens=150)

    print(f"Measured: {measured:.1f} tok/s")
    plot_roofline(model, bw, dp, measured)
```

## Running It

```bash
# On your laptop, port-forward Ollama from the homelab
kubectl port-forward -n ollama svc/ollama 11434:11434

# Install deps
pip install requests matplotlib

# Run
python roofline_profiler/measure_inference.py
python roofline_profiler/plot.py
```

## What to Look For

- If measured is close to the **bandwidth ceiling** → quantization will help most
- If measured is close to the **dispatch ceiling** → you're already near optimal for this regime; try CUDA graphs (Project 2)
- If measured is far below **both ceilings** → other overhead (Python, HTTP, batching) is the culprit

## Deliverable

A saved PNG per model showing the roofline chart. Compare across `fp16`, `int8`, `int4` quantizations of the same model to see the ceiling shift.

## References

- [Ollama API docs](https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-completion)
- [matplotlib bar + axhline docs](https://matplotlib.org/stable/api/_as_gen/matplotlib.axes.Axes.axhline.html)
- [Hardware-Aware Gateway explorer](https://rahu378.github.io/hardware-aware-gateway/)
