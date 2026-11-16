## Context

The homelab runs K3s on a single Legion laptop with ArgoCD managing all deployments via GitOps. External devices (Macs, iOS) are on the same LAN. iOS devices cannot be polled (no server reachable from outside), so they must push. The cluster already exposes Traefik at `192.168.1.200`; Cloudflare Tunnel is intermittently broken. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**

- Deploy `status-api` as a K8s Deployment in the cluster with RBAC to read node/pod/application resources
- Compile `homelab-agent` as a static Go binary installable on macOS and Linux with a single shell command
- Serve the unified `/status` JSON in ≤ 3 s on a home LAN
- Keep the widget working on local WiFi (no Cloudflare Tunnel dependency)
- Support GitOps device registration: edit YAML, push, ArgoCD restarts pod, done

**Non-Goals:**

- Remote access beyond the home network at this stage (Tailscale, Cloudflare are future work)
- Push notifications / alerting (Uptime Kuma handles this)
- Multi-node cluster support (Mac Mini Phase 1; status-api will extend naturally)
- Persistent metrics history (Prometheus/Grafana already covers this)

## Decisions

### D1 — Go for both status-api and homelab-agent

**Decision**: Both services are written in Go, targeting `awesome-tools` repo under `cmd/status-api/` and `cmd/homelab-agent/`.

**Rationale**: Single language across both binaries. Go compiles to a static binary with no runtime dependencies — critical for homelab-agent which must install cleanly on arbitrary Macs and Linux boxes. `gopsutil` provides cross-platform CPU/MEM/disk/battery metrics. The homelab owner is comfortable with Go.

**Alternatives considered**: Python (heavier runtime, harder to distribute a single binary), Node.js (same issue), shell script (too fragile for a long-running service).

### D2 — In-memory state for iOS push data (no database)

**Decision**: `status-api` stores the most-recent push payload per iOS device id in a Go `sync.Map`. State is lost on pod restart; `last_seen` will be absent until the next push (expected within 1 hour).

**Rationale**: iOS devices push hourly. Pod restarts are infrequent and triggered by config changes. Adding a database (even SQLite via a PVC) is disproportionate for a single timestamp and 5 metric fields per iOS device.

**Trade-off**: After a pod restart, iOS devices appear `stale` until the next scheduled push (up to 1 hour). Acceptable for a personal widget.

### D3 — RBAC: dedicated ServiceAccount with minimal permissions

**Decision**: `status-api` runs under a dedicated `ServiceAccount` with a `ClusterRole` granting `get`/`list` on `nodes`, `pods`, and ArgoCD `Application` CRDs. It does NOT get `secrets` or `configmaps` access.

**Rationale**: Least-privilege. The service only needs to read resource state, not modify it.

### D4 — Poll interval: 60 s for agents and cluster APIs; widget refresh: 5 min

**Decision**: status-api polls homelab-agents and cluster APIs every 60 seconds. The Scriptable widget refreshes at Scriptable's minimum interval (≈ 5 minutes).

**Rationale**: 60 s polling keeps metrics reasonably fresh while avoiding unnecessary load on the LAN and cluster APIs. Widget refresh is dictated by Scriptable's background execution model.

### D5 — Traefik IngressRoute for status-api in `traefik-system` namespace

**Decision**: Follow the existing pattern — IngressRoute lives in `traefik-system`, service is in its own namespace (`status-api`). `tls: {}` for now (self-signed cert, same as all other services).

**Rationale**: Consistent with the repo's established pattern. The widget can run on local WiFi (HTTP via IP or self-signed HTTPS); Cloudflare Tunnel is not required.

### D6 — homelab-agent install: single curl-pipe-sh one-liner

**Decision**: `make device-add` prints a curl one-liner that downloads a pre-built binary from GitHub Releases (or the cluster's own HTTP endpoint) and installs the systemd/launchd service.

**Rationale**: Zero dependencies on the target machine. The agent binary is cross-compiled by CI.

**Alternative considered**: Docker container on the Mac — rejected because it requires Docker Desktop (licence cost), is heavier than a 10 MB static binary, and doesn't integrate cleanly with launchd battery APIs.

### D7 — devices.yaml mounted as a ConfigMap volume

**Decision**: `config/devices.yaml` is committed to the repo and mounted into the `status-api` pod as a Kubernetes ConfigMap volume. ArgoCD syncs ConfigMap changes and restarts the Deployment.

**Rationale**: Pure GitOps — no separate config management system. The file is small and infrequently changed.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Pod restart after device-add leaves iOS devices stale for up to 1 hour | Acceptable; iOS Shortcut can be manually triggered to push immediately |
| homelab-agent port (9100) conflicts with Prometheus node_exporter | Use a different default port (e.g. 9101) or make it configurable via flag |
| Self-signed TLS cert rejected by Scriptable's HTTP client | Configure widget to use `http://192.168.1.200` (plain HTTP via Traefik) initially; or add `allow-insecure-requests` Scriptable setting |
| nvidia-smi and kubectl must be available inside the status-api container | Use the official `bitnami/kubectl` base image or a distroless image with kubectl + nvidia-smi binaries; alternatively call the K8s metrics API directly (avoids nvidia-smi in-container) |
| homelab-agent SSH for offboard requires SSH key auth to target | Document prerequisite; `make device-offboard` checks SSH connectivity before proceeding |

## Migration Plan

1. Build and push `status-api` and `homelab-agent` Docker images to GHCR (GitHub Container Registry)
2. Add `gitops/manifests/status-api/` (Namespace, RBAC, ConfigMap, Deployment, Service)
3. Add `gitops/apps/status-api.yaml` (ArgoCD Application, wave 4)
4. Add IngressRoute to `gitops/manifests/ingress-routes/` (wave 5)
5. Push `config/devices.yaml` with initial device list
6. Push to `main` → ArgoCD deploys automatically
7. Install homelab-agent on each Mac/Linux via `make device-add` one-liner
8. Set up iOS Shortcut on iPad and iPhone using the printed push URL
9. Install `widget.js` in Scriptable, set widget parameter to Traefik IP

**Rollback**: Delete the ArgoCD Application (`kubectl delete application status-api -n argocd`). Homelab-agent can be uninstalled per-machine via `make device-offboard`.

## Open Questions

- Should `homelab-agent` binaries be served from the cluster itself (via an Nginx pod) or from GitHub Releases? GitHub Releases is simpler but requires internet access during agent install.
- Should the widget use HTTP (plain) or HTTPS (self-signed) for local access? Answer determines whether a workaround for self-signed TLS in Scriptable is needed.
