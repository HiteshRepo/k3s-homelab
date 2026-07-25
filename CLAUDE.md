# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A GitOps homelab running K3s (lightweight Kubernetes) on a single Ubuntu laptop. ArgoCD manages all deployments by watching this repository. There are no build steps — everything is declarative YAML.

## First-Time Setup

Run `./first-time-setup.sh` — it handles everything end-to-end: prompts for your GitHub username, replaces `YOUR_USERNAME` placeholders, installs K3s and ArgoCD, bootstraps the app-of-apps, and prints the `/etc/hosts` entries to add on client machines.

On a GPU node, run `./gpu-node-setup.sh` **before** `./first-time-setup.sh` — the NVIDIA driver requires a reboot, so it's cleaner to get that out of the way first. Both scripts are idempotent on k3s and kubeconfig, so either order works, but GPU-first avoids an extra reboot mid-setup. `gpu-node-setup.sh` can also be run standalone if you only want a GPU-enabled k3s without the ArgoCD GitOps stack.

## Key Commands

Run `make help` to list all available targets. Common ones:

```bash
make gpu-node-setup         # Set up GPU support (NVIDIA driver → CUDA → container toolkit → k3s → device plugin)
make lid-suspend-off        # Disable laptop suspend on lid close (run once after Ubuntu install)
make install-k3s            # Install K3s
make kubeconfig             # Copy K3s kubeconfig to ~/.kube/config
make set-github-username GITHUB_USERNAME=myuser  # Replace YOUR_USERNAME in all YAMLs
make install-argocd         # Deploy ArgoCD
make argocd-password        # Print initial ArgoCD admin password
make bootstrap              # Apply app-of-apps to start all deployments
make status                 # Print sync status of all ArgoCD applications (one-shot)
make watch                  # Watch ArgoCD sync progress (streaming)
make traefik-ip             # Print the LoadBalancer IP assigned to Traefik
make homarr-secret              # Create the Homarr DB encryption key secret (auto-generated)
make cloudflared-secret TUNNEL_TOKEN=<token>  # Create the Cloudflare Tunnel token secret
make litellm-secret OPENAI_API_KEY=sk-... ANTHROPIC_API_KEY=sk-ant-...  # Create LiteLLM API key secrets
```

For ad-hoc operations not covered by the Makefile:
```bash
# Tail logs for a component
kubectl logs -n <namespace> -l app.kubernetes.io/name=<app> --tail=100 -f

# Force sync a specific ArgoCD app
kubectl patch application <app-name> -n argocd --type merge -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{}}}'
```

## Architecture

**GitOps flow:** Push to `main` → ArgoCD detects changes → applies to cluster automatically (prune + selfHeal enabled on all apps).

**Deployment order** is controlled by ArgoCD sync waves in `gitops/apps/*.yaml`:
1. Wave 1: MetalLB, cert-manager, metrics-server, argocd-config
2. Wave 2: local-path-provisioner, cert-issuer
3. Wave 3: Traefik (depends on MetalLB for LoadBalancer IP)
4. Wave 4: Applications (Homarr, Prometheus stack, Uptime Kuma, Ollama + Open WebUI, LiteLLM, Cloudflared)
5. Wave 5: ingress-routes (Traefik IngressRoutes for all services)

**Traffic path:** DNS (`*.lab.hiteshp.in → 192.168.1.200`) → MetalLB → Traefik → services. TLS terminates at Traefik using self-signed certs from cert-manager.

## Repository Structure

```
gitops/
├── app-of-apps.yaml          # Single kubectl apply bootstraps everything
├── apps/                     # One ArgoCD Application per component
└── manifests/                # Raw Kubernetes resources (no Helm templating)
    ├── argocd-config/        # ArgoCD server ConfigMap (TLS disabled, Traefik terminates)
    ├── cert-issuer/          # ClusterIssuer for self-signed certs
    ├── ingress-routes/       # Traefik IngressRoute objects for each service
    ├── metallb-config/       # IP pool (192.168.1.200–220) + L2Advertisement
    ├── metallb-namespace/    # Namespace with privileged PSS labels required by MetalLB
    ├── monitoring-namespace/ # Namespace for Prometheus/Grafana/Uptime-Kuma
    ├── ollama/               # Ollama (GPU) + Open WebUI Deployments, Services, PVCs
    ├── litellm/              # LiteLLM proxy (OpenAI-compatible API aggregating Ollama + cloud providers)
    └── cloudflared/          # Cloudflare Tunnel Deployment (token secret created via make)
```

## Adding a New Application

1. Create `gitops/apps/myapp.yaml` — an ArgoCD `Application` resource pointing to a Helm chart or Git path
2. Add a `syncWave` annotation (wave 4 for apps, wave 5 for ingress routes)
3. If the app needs an ingress, add a `Traefik IngressRoute` to `gitops/manifests/ingress-routes/`
   - Place the `IngressRoute` in the **`traefik-system` namespace** (not the app's namespace) — cross-namespace routing is enabled via `allowCrossNamespace: true` in the Traefik Helm values
   - Use `tls: {}` to get Traefik's default self-signed certificate (same pattern as existing routes)
4. Push to GitHub — ArgoCD deploys automatically

## Network Configuration

- MetalLB IP pool: `192.168.1.200–192.168.1.220` — defined in `gitops/manifests/metallb-config/ippool.yaml`
- Traefik LoadBalancer IP: `192.168.1.200` — hardcoded in `gitops/apps/traefik.yaml`
- Domain: `*.lab.hiteshp.in` resolved via `/etc/hosts` on client machines
- If your LAN uses this range, update both files above before bootstrapping

Service URLs (add all to `/etc/hosts` pointing at `192.168.1.200`):

| Service | URL | Default Credentials |
|---------|-----|---------------------|
| ArgoCD | `https://argocd.lab.hiteshp.in` | admin / `make argocd-password` |
| Grafana | `https://grafana.lab.hiteshp.in` | admin / admin |
| Homarr | `https://homarr.lab.hiteshp.in` | — |
| Uptime Kuma | `https://status.lab.hiteshp.in` | — |
| Traefik dashboard | `https://traefik.lab.hiteshp.in` | — |
| Open WebUI | `https://chat.lab.hiteshp.in` | first user registered becomes admin |
| LiteLLM | `https://litellm.lab.hiteshp.in` | master key from `make litellm-secret` |

**Secrets that must be created manually** before ArgoCD deploys the respective app (cannot be stored in Git):

```bash
make homarr-secret                            # Homarr DB encryption key (auto-generated)
make cloudflared-secret TUNNEL_TOKEN=<token>  # Cloudflare Tunnel token
make litellm-secret OPENAI_API_KEY=sk-... ANTHROPIC_API_KEY=sk-ant-...  # LiteLLM API keys (master key auto-generated)
```

Get the cloudflared token from Cloudflare Zero Trust → Networks → Tunnels → Create tunnel → Cloudflared. Set the public hostname service to `http://open-webui.ollama.svc.cluster.local:8080`.

## Gotchas

Non-obvious issues discovered in production — check here before debugging from scratch.

**ArgoCD pinned to v2.13.3**
v3.x introduced a Redis multi-arch issue on x86_64 with k3s: `exec format error` on the Redis container. Pinned to v2.13.3 until fixed upstream. Do not upgrade without testing.

**LiteLLM OOMKills on startup**
`main-latest` is a nightly dev build and spikes past 1Gi during startup due to Prisma schema migration. Fixes applied:
- Use `main-stable` image tag
- `DISABLE_SCHEMA_UPDATE=true` — skips Prisma migration
- `STORE_MODEL_IN_DB=false` — no database needed
- `DISABLE_ADMIN_UI=true` — drops the UI bundle overhead
- Memory limit set to 2Gi

**Open WebUI does not auto-connect to LiteLLM via env vars**
`OPENAI_API_BASE_URL` and `OPENAI_API_KEY` are set on the Open WebUI Deployment but Open WebUI's database takes precedence. The connection must be added manually: Admin Panel → Settings → Connections → add OpenAI entry with URL `http://litellm.litellm.svc.cluster.local:4000/v1` and the master key from `kubectl get secret litellm-keys -n litellm -o jsonpath='{.data.master-key}' | base64 -d`.

**Ollama ImagePullBackOff on restart**
`latest` image tag defaults to `imagePullPolicy: Always` in Kubernetes, causing a Docker Hub pull on every pod restart. For a ~4GB image this fails whenever Docker Hub has connectivity issues. Fixed with `imagePullPolicy: IfNotPresent` — uses the cached image and skips the pull.

**GPU held by Unknown-state pods**
When an Ollama pod gets stuck in `Unknown` state it retains the `nvidia.com/gpu: 1` resource, blocking new pods from scheduling (`Insufficient nvidia.com/gpu`). Fix: `kubectl delete pod <pod-name> -n ollama --force --grace-period=0`.

**Traefik IngressRoute namespace**
IngressRoutes must be created in the `traefik-system` namespace, not the app's namespace. Cross-namespace routing works via `allowCrossNamespace: true` in the Traefik Helm values. Putting an IngressRoute in the wrong namespace means Traefik silently ignores it.

**Kubernetes secrets are namespace-scoped**
A secret in the `litellm` namespace cannot be referenced by a pod in the `ollama` namespace. The LiteLLM master key is duplicated into both namespaces by `make litellm-secret` for this reason.

## Helm Chart Sources

| Component | Source | Version |
|-----------|--------|---------|
| ArgoCD | github.com/argoproj/argo-cd | v2.13.3 (pinned — v3.x has a Redis/ECR multi-arch issue on x86_64 with k3s) |
| MetalLB | metallb/metallb | 0.15.3 |
| cert-manager | jetstack/cert-manager | 1.19.1 |
| Traefik | traefik/traefik | 37.4.0 |
| local-path-provisioner | rancher/local-path-provisioner | 0.0.34 |
| metrics-server | kubernetes-sigs/metrics-server | 3.13.0 |
| kube-prometheus-stack | prometheus-community | 80.0.0 |
| Homarr | homarr-labs/homarr | 8.4.3 |
| Uptime Kuma | helm.irsigler.cloud/uptime-kuma | 2.24.0 |
