# Soup LLM Fine-Tuning

Run [Soup](https://trysoup.dev) in the k3s cluster to fine-tune LLMs locally and export the results for Ollama to serve.

## Goals

1. Run Soup as a Kubernetes `Job` on the GPU node to fine-tune a base model
2. Export the trained adapter/model as GGUF so Ollama can load it
3. Optionally run `soup serve` as a deployment for an OpenAI-compatible API endpoint

---

## Task 1: Run soup doctor as a one-shot pod

Verify GPU visibility and dependencies before committing to a full training run.

```bash
kubectl run soup-doctor --rm -it --restart=Never \
  --image=ghcr.io/makazhanalpamys/soup:latest \
  --limits='nvidia.com/gpu=1' \
  -- soup doctor
```

Add `--overrides` with a `nodeSelector` if the cluster has multiple nodes:

```bash
kubectl run soup-doctor --rm -it --restart=Never \
  --image=ghcr.io/makazhanalpamys/soup:latest \
  --overrides='{"spec":{"nodeSelector":{"kubernetes.io/hostname":"<gpu-node-name>"}}}' \
  --limits='nvidia.com/gpu=1' \
  -- soup doctor
```

---

## Task 2: Fine-tune a model with a Kubernetes Job

Create a `Job` that mounts a training dataset from a PVC, runs `soup train`, and writes the output adapter back to the PVC.

### Minimal training config (ConfigMap)

```yaml
# gitops/manifests/soup/train-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: soup-train-config
  namespace: ollama
data:
  config.yaml: |
    base: meta-llama/Llama-3.1-8B-Instruct
    task: sft

    data:
      train: /data/train.jsonl
      format: alpaca
      val_split: 0.1

    training:
      epochs: 3
      lr: 2e-5
      batch_size: auto
      lora:
        r: 64
        alpha: 16
      quantization: 4bit
      stream_layers: true   # enables 8B on ~4 GB VRAM

    output: /output
```

### Job manifest

```yaml
# gitops/manifests/soup/train-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: soup-train
  namespace: ollama
spec:
  ttlSecondsAfterFinished: 3600
  template:
    spec:
      restartPolicy: Never
      nodeSelector:
        nvidia.com/gpu.present: "true"
      containers:
        - name: soup
          image: ghcr.io/makazhanalpamys/soup:latest
          command: ["soup", "train", "--config", "/config/config.yaml"]
          resources:
            limits:
              nvidia.com/gpu: "1"
          volumeMounts:
            - name: config
              mountPath: /config
            - name: data
              mountPath: /data
            - name: output
              mountPath: /output
      volumes:
        - name: config
          configMap:
            name: soup-train-config
        - name: data
          persistentVolumeClaim:
            claimName: soup-data-pvc
        - name: output
          persistentVolumeClaim:
            claimName: soup-output-pvc
```

### Considerations

- Training data (`train.jsonl`) must be placed on `soup-data-pvc` before running the Job
- Output LoRA adapter lands on `soup-output-pvc` under `/output`
- `stream_layers: true` enables 8B model training on ~4 GB VRAM via QLoRA layer streaming
- Python 3.10–3.12 is required — the official image satisfies this

---

## Task 3: Export adapter as GGUF and load into Ollama

After the training Job completes, run a one-shot export Job to convert the LoRA output to GGUF format.

```bash
kubectl run soup-export --rm -it --restart=Never \
  --image=ghcr.io/makazhanalpamys/soup:latest \
  -- soup export --format gguf --input /output --output /models
```

Mount the same `soup-output-pvc` as `/output` and the Ollama models PVC as `/models`. Then use the Ollama API to register the new model:

```bash
curl http://ollama.ollama.svc.cluster.local:11434/api/create \
  -d '{"name":"my-finetuned-model","modelfile":"FROM /models/my-model.gguf"}'
```

---

## Task 4: (Optional) Run soup serve as a deployment

Expose the fine-tuned model via Soup's built-in OpenAI-compatible server as an alternative to Ollama.

```bash
soup serve --model /output --port 8000
```

Wire this into LiteLLM as an additional provider by adding an entry to the LiteLLM config:

```yaml
model_list:
  - model_name: my-finetuned-model
    litellm_params:
      model: openai/my-finetuned-model
      api_base: http://soup-serve.ollama.svc.cluster.local:8000/v1
      api_key: none
```

---

## VRAM Requirements

| VRAM    | Max model size |
|---------|---------------|
| 4 GB    | ~7B (with `stream_layers: true`) |
| 8 GB    | ~7B (standard) |
| 16 GB   | ~14B |
| 24 GB   | ~34B |
| 48 GB   | ~70B |

---

## References

- Soup website: https://trysoup.dev
- Soup GitHub: https://github.com/MakazhanAlpamys/Soup
- Docs: https://github.com/MakazhanAlpamys/Soup/tree/main/docs
- Docker image: `ghcr.io/makazhanalpamys/soup:latest`
- Ollama library: https://ollama.com/library
