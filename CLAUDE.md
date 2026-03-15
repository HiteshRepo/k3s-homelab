# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A GitOps homelab running K3s (lightweight Kubernetes) on a single Ubuntu laptop. ArgoCD manages all deployments by watching this repository. There are no build steps — everything is declarative YAML.

## Key Commands

Run `make help` to list all available targets. Common ones:

```bash
make lid-suspend-off        # Disable laptop suspend on lid close (run once after Ubuntu install)
make install-k3s            # Install K3s
make kubeconfig             # Copy K3s kubeconfig to ~/.kube/config
make set-github-username GITHUB_USERNAME=myuser  # Replace YOUR_USERNAME in all YAMLs
make install-argocd         # Deploy ArgoCD
make argocd-password        # Print initial ArgoCD admin password
make bootstrap              # Apply app-of-apps to start all deployments
make watch                  # Watch ArgoCD sync progress
make traefik-ip             # Print the LoadBalancer IP assigned to Traefik
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
4. Wave 4: Applications (Homarr, Prometheus stack, Uptime Kuma)
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
    └── monitoring-namespace/ # Namespace for Prometheus/Grafana/Uptime-Kuma
```

## Adding a New Application

1. Create `gitops/apps/myapp.yaml` — an ArgoCD `Application` resource pointing to a Helm chart or Git path
2. Add a `syncWave` annotation (wave 4 for apps, wave 5 for ingress routes)
3. If the app needs an ingress, add a `Traefik IngressRoute` to `gitops/manifests/ingress-routes/`
4. Push to GitHub — ArgoCD deploys automatically

## Network Configuration

- MetalLB IP pool: `192.168.1.200–192.168.1.220` — defined in `gitops/manifests/metallb-config/ippool.yaml`
- Traefik LoadBalancer IP: `192.168.1.200` — hardcoded in `gitops/apps/traefik.yaml`
- Domain: `*.lab.hiteshp.in` resolved via `/etc/hosts` on client machines
- If your LAN uses this range, update both files above before bootstrapping

## Helm Chart Sources

| Component | Helm Repo | Chart Version |
|-----------|-----------|---------------|
| MetalLB | metallb/metallb | 0.15.3 |
| cert-manager | jetstack/cert-manager | 1.19.1 |
| Traefik | traefik/traefik | 37.4.0 |
| local-path-provisioner | rancher/local-path-provisioner | 0.0.34 |
| metrics-server | kubernetes-sigs/metrics-server | 3.13.0 |
| kube-prometheus-stack | prometheus-community | 80.0.0 |
| Homarr | homarr-labs/homarr | 8.4.3 |
| Uptime Kuma | helm.irsigler.cloud/uptime-kuma | 2.24.0 |
