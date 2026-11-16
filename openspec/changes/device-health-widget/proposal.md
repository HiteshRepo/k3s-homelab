## Why

There is no unified view of fleet health across the homelab's cluster, Macs, and iOS devices — checking device status requires opening multiple apps and dashboards. A single Scriptable widget on iPhone/iPad that surfaces all device health at a glance, with one-tap drill-down, closes that gap in under 5 minutes per new device added.

## What Changes

- **New**: `status-api` Go service deployed in the Legion K3s cluster — aggregates metrics from cluster internals, `homelab-agent` (pull), and iOS Shortcuts (push); exposes `GET /status` and `POST /push`
- **New**: `homelab-agent` lightweight Go binary — runs on each Mac/Linux, exposes `GET /metrics` (CPU, MEM, Disk, Battery, Uptime); installed via a single one-liner
- **New**: `widget.js` Scriptable widget — small/medium/large variants, detail drill-down screen, "Open Grafana" link
- **New**: `config/devices.yaml` device registry — source of truth for which devices to track; adding a device is a YAML edit + git push
- **New**: `make device-add` / `make device-offboard` Makefile targets — guided onboarding and clean offboarding (stops agent, removes entry)
- **New**: K8s manifests for `status-api` (Deployment, Service, RBAC, IngressRoute) and ArgoCD Application

## Capabilities

### New Capabilities

- `status-api`: Central HTTP aggregator that pulls cluster metrics (kubectl, nvidia-smi, ArgoCD, Ollama, Kopia, Uptime Kuma), polls homelab-agents over LAN, and receives iOS push data; serves `/status` and `/push` endpoints
- `homelab-agent`: Lightweight Go HTTP daemon that exposes device metrics (CPU, MEM, Disk, Battery, Uptime) on `GET /metrics`; runs as a systemd/launchd service on Mac/Linux
- `device-registry`: YAML-driven device registry (`config/devices.yaml`) that defines device IDs, kinds, hosts, ports, and ownership metadata consumed by status-api
- `status-widget`: Scriptable iOS widget (`tools/status-widget/widget.js`) with small/medium/large layouts and a full-page detail screen

### Modified Capabilities

<!-- No existing spec-level capabilities are changing -->

## Impact

- **New repo path** (`awesome-tools`): `cmd/status-api/`, `cmd/homelab-agent/` — Go source for both binaries
- **New repo path** (`k3s-homelab`): `gitops/manifests/status-api/`, `gitops/apps/status-api.yaml`, `config/devices.yaml`, `tools/status-widget/widget.js`
- **Makefile**: new targets `device-add`, `device-offboard`
- **ArgoCD**: new Application in wave 4; new IngressRoute in wave 5 (URL: `status-api.lab.hiteshp.in`)
- **Network**: status-api polls homelab-agents on LAN; iOS devices POST to Traefik local IP; Cloudflare Tunnel not required for initial rollout
- **RBAC**: status-api needs `get`/`list` on pods, nodes, and namespaces (metrics-server), plus read access to ArgoCD Application CRs
