# Device Health Widget — Requirements

> Track health of all personal devices from an iOS home screen widget.
> Tap the widget → see per-device details.

---

## Goal

A single Scriptable widget on iPhone/iPad that shows the health of every device
in the fleet — cluster, computers, and iOS devices — with one-tap drill-down.
Adding a new device must take less than 5 minutes.

---

## Components

### 1. `status-api` (runs in Legion cluster)

Central aggregator. All data flows through it.

- Pulls metrics from Legion internals (cluster APIs, nvidia-smi)
- Pulls metrics from `homelab-agent` running on each Mac/Linux over the network
- Receives push data from iOS devices (iPad, iPhone cannot be polled)
- Serves `GET /status` → JSON consumed by the widget
- Serves `POST /push` → receives data pushed by iOS Shortcuts
- Reads `config/devices.yaml` to know which devices to track

### 2. `homelab-agent` (runs on each Mac/Linux device)

Lightweight Go binary. Install once, runs as a background service.

- Exposes `GET /metrics` → JSON with CPU, MEM, Disk, Battery, Uptime
- status-api polls it on a schedule
- One install command per machine

### 3. `widget.js` (Scriptable, runs on iPhone/iPad)

- Polls `GET /status` every 5 minutes
- Renders small / medium / large widget variants
- Tap → opens detail screen (Scriptable full-page)
- Detail screen → "Open Grafana" button for full dashboards

---

## Device Profiles

Each device has a **kind**. The kind defines what gets tracked and how.

### `k8s-node`

| Metric | Source |
|--------|--------|
| CPU % | metrics-server |
| Memory % | metrics-server |
| Disk % | metrics-server |
| GPU util % | nvidia-smi |
| GPU VRAM used / free | nvidia-smi |
| GPU temp | nvidia-smi |
| Running pods / total | kubectl |
| Error pod count | kubectl |
| ArgoCD sync status | ArgoCD API |
| Active Ollama model | Ollama API |
| Ollama VRAM consumed | Ollama API |
| Kopia last backup time | Kopia API |
| Uptime Kuma results | Uptime Kuma API |

Collection: **pull · cluster-internal** (status-api queries directly, no network hop)

### `mac`

| Metric | Source |
|--------|--------|
| CPU % | homelab-agent (gopsutil) |
| Memory % | homelab-agent |
| Disk % | homelab-agent |
| Battery % | homelab-agent |
| Charging? | homelab-agent |
| Uptime | homelab-agent |

Collection: **pull · homelab-agent HTTP** (status-api polls `http://<host>:<port>/metrics`)

### `ios`

| Metric | Source |
|--------|--------|
| Battery % | Scriptable `Device.batteryLevel()` |
| Charging? | Scriptable `Device.isCharging()` |
| Storage free | Scriptable `Device.availableDiskSpace()` |
| Storage total | Scriptable `Device.diskCapacity()` |
| WiFi connected | Scriptable `Device.isConnectedToWifi()` |
| Last seen | timestamp of last push |

Collection: **push · iOS Shortcuts automation** (device POSTs to `/push` every hour)
Stale threshold: 2 hours without a push → device shown as "stale"

### `linux`

| Metric | Source |
|--------|--------|
| CPU % | homelab-agent |
| Memory % | homelab-agent |
| Disk % | homelab-agent |
| CPU temp | homelab-agent |
| Uptime | homelab-agent |

Collection: **pull · homelab-agent HTTP**

---

## Data Flow

```
                    ┌─────────────────────────┐
                    │   status-api (Legion)   │
                    └────────────┬────────────┘
                                 │
          ┌──────────────────────┼───────────────────────┐
          │                      │                       │
          ▼                      ▼                       ▼
   PULL (internal)        PULL (network)          RECEIVE PUSH
   ───────────────        ──────────────          ────────────
   Legion cluster         homelab-agent           iOS Shortcuts
   kubectl, nvidia-smi    on MacBook / linux      on iPad, iPhone
   ArgoCD, Kopia,         exposes /metrics        POST /push hourly
   Ollama, Uptime Kuma    status-api polls it
```

---

## Device Registry

`k3s-homelab/config/devices.yaml` is the source of truth.
Adding or removing a device = edit this file + push to main → ArgoCD reloads config.

```yaml
devices:
  - id: legion
    name: Legion Y540
    kind: k8s-node
    ownership: personal

  - id: macbook-work
    name: MacBook Pro
    kind: mac
    host: 192.168.29.xxx
    port: 9100
    ownership: company
    cleanup_on_offboard: true
    notes: "Company MacBook — remove agent and entry when leaving"

  - id: ipad-pro
    name: iPad Pro
    kind: ios
    ownership: personal

  - id: iphone-15
    name: iPhone 15
    kind: ios
    ownership: personal
```

---

## Widget Designs

### Small (2×2) — glanceable
- Overall health score: `4/5 devices healthy`
- Warning count pill
- Last updated time

### Medium (4×2) — primary (recommended)
- One row per device: dot · name · kind · key metrics · ownership badge
- Legion: CPU / MEM / GPU temp / pod count
- Mac: CPU / MEM / Battery
- iOS: Battery / Storage free / WiFi

### Large (4×4) — full context (best on iPad)
- Device cards with icon, name, kind, key metrics
- Active Ollama model card
- Kopia backup timestamp

### Detail screen (Scriptable full-page)
- Device list grouped by: Cluster / Computers / iOS Devices
- Tap a device → per-device detail screen
- Per-device detail: metric bars, info rows, ownership badge
- Company devices: banner + "Offboard & Remove Tracking" button
- iOS devices: banner explaining push-based collection + last push time
- "Open Grafana" button at the bottom of cluster detail

---

## Special Requirements

### Company MacBook cleanup
- Device tagged `ownership: company, cleanup_on_offboard: true`
- Detail screen shows a warning banner
- `make device-offboard <id>` → stops and uninstalls homelab-agent, removes entry from devices.yaml

### Easy device onboarding
- `make device-add` → interactive prompt → updates devices.yaml
- For mac/linux: prints homelab-agent install one-liner to run on the target machine
- For ios: prints the Scriptable push URL to paste into the iOS Shortcut
- Target: new device tracked in < 5 minutes

### Local WiFi first
- Cloudflare Tunnel is not a prerequisite
- Widget works immediately on home WiFi via local IP / Traefik
- When Cloudflare Tunnel is fixed → update widget URL to `https://status-api.lab.hiteshp.in`

---

## Code Locations

| Artifact | Repo | Path |
|----------|------|------|
| status-api Go source | awesome-tools | `cmd/status-api/` |
| homelab-agent Go source | awesome-tools | `cmd/homelab-agent/` |
| K8s manifests (Deployment, Service, RBAC, IngressRoute) | k3s-homelab | `gitops/manifests/status-api/` |
| ArgoCD Application | k3s-homelab | `gitops/apps/status-api.yaml` |
| Device registry | k3s-homelab | `config/devices.yaml` |
| Scriptable widget | k3s-homelab | `tools/status-widget/widget.js` |
| Widget mockup | k3s-homelab | `tools/status-widget/mockup-multi-device.html` |

---

## Out of Scope (for now)

- Per-node breakdown when Mac Mini joins (Phase 1) — status-api will extend naturally
- Multimodal / Immich metrics
- Tailscale for remote agent polling (use local WiFi for Phase 0)
- Alerting / push notifications (Uptime Kuma handles this already)
