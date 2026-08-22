# Hardware-Aware Router — Task 3: Deploy to K3s and Wire into LiteLLM

Package the router as a K3s Deployment and configure LiteLLM to use it as a custom provider, so all Open WebUI traffic benefits from hardware-aware routing automatically.

## Goal

- Docker image of the FastAPI router running on the GPU node
- ArgoCD-managed K3s Deployment + Service
- LiteLLM `config.yaml` entry pointing to the router
- Traefik IngressRoute so you can call it from outside the cluster

---

## Step 1: Dockerfile

Create `hw_router/Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

Create `hw_router/requirements.txt`:

```
fastapi==0.115.0
uvicorn==0.30.0
httpx==0.27.0
torch==2.4.0+cu121 --extra-index-url https://download.pytorch.org/whl/cu121
pydantic==2.8.0
```

Build and push (from the GPU node or any machine with Docker + NVIDIA support):

```bash
docker build -t ghcr.io/<your-github-username>/hw-router:latest hw_router/
docker push ghcr.io/<your-github-username>/hw-router:latest
```

---

## Step 2: K3s Manifests

Create `gitops/manifests/hw-router/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hw-router
  namespace: ollama
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hw-router
  template:
    metadata:
      labels:
        app: hw-router
    spec:
      containers:
        - name: hw-router
          image: ghcr.io/<your-github-username>/hw-router:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          resources:
            limits:
              nvidia.com/gpu: "1"
            requests:
              nvidia.com/gpu: "1"
          env:
            - name: OLLAMA_URL
              value: http://ollama.ollama.svc.cluster.local:11434
---
apiVersion: v1
kind: Service
metadata:
  name: hw-router
  namespace: ollama
spec:
  selector:
    app: hw-router
  ports:
    - port: 8080
      targetPort: 8080
```

> **Note:** The router shares `nvidia.com/gpu: 1` with Ollama — they cannot both run simultaneously unless your node has multiple GPUs or you remove the GPU limit from the router (the profiler benchmarks still run, but less accurately without exclusive GPU access).

---

## Step 3: ArgoCD Application

Create `gitops/apps/hw-router.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: hw-router
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "4"
spec:
  project: default
  source:
    repoURL: https://github.com/<your-github-username>/k3s-homelab
    targetRevision: main
    path: gitops/manifests/hw-router
  destination:
    server: https://kubernetes.default.svc
    namespace: ollama
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

---

## Step 4: Traefik IngressRoute

Add to `gitops/manifests/ingress-routes/hw-router.yaml`:

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: hw-router
  namespace: traefik-system
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`router.lab.hiteshp.in`)
      kind: Rule
      services:
        - name: hw-router
          namespace: ollama
          port: 8080
  tls: {}
```

Add `192.168.1.200 router.lab.hiteshp.in` to `/etc/hosts` on client machines.

---

## Step 5: Wire into LiteLLM

Add the router as a custom OpenAI-compatible provider in your LiteLLM ConfigMap:

```yaml
model_list:
  - model_name: hw-router/qwen2.5:1.5b
    litellm_params:
      model: openai/qwen2.5:1.5b          # passed as-is in the request body
      api_base: http://hw-router.ollama.svc.cluster.local:8080
      api_key: "none"
```

The router's `/generate` endpoint is not OpenAI-compatible yet — extend it to accept the OpenAI `/v1/chat/completions` format if you want LiteLLM to work out of the box.

---

## Verification

```bash
# Direct
curl https://router.lab.hiteshp.in/hardware

# Via LiteLLM (after OpenAI-compat extension)
curl https://litellm.lab.hiteshp.in/v1/chat/completions \
  -H "Authorization: Bearer $MASTER_KEY" \
  -d '{"model": "hw-router/qwen2.5:1.5b", "messages": [{"role":"user","content":"Hello"}]}'
```

## References

- [ArgoCD Application spec](https://argo-cd.readthedocs.io/en/stable/operator-manual/application.yaml/)
- [Traefik IngressRoute cross-namespace](https://doc.traefik.io/traefik/routing/providers/kubernetes-crd/)
- [LiteLLM custom providers](https://docs.litellm.ai/docs/providers/custom_openai_proxy)
