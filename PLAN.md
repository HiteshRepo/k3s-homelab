# k3s-homelab — Plan

> Living document. See CLAUDE.md for architecture, gotchas, and key commands.
> This doc covers what to build and why — CLAUDE.md covers how it works.

---

## Current State (Nov 2026)

**Hardware:** Lenovo Legion Y540 — GTX 1650 (4GB VRAM), i5-9300H (8 threads), 16GB RAM, 468GB NVMe.
**Cluster:** Single-node K3s, v1.36.2+k3s1, Ubuntu 26.04. SSH at `hitesh@192.168.29.146`.

| Component | Status | Notes |
|-----------|--------|-------|
| K3s node | Ready | 120d uptime |
| ArgoCD | Synced | v2.13.3 pinned — do not upgrade (Redis multi-arch issue) |
| Traefik + MetalLB | Running | IP 192.168.1.200 |
| Immich | Running | Photos + ML |
| Kopia | Running | Backup |
| Prometheus + Grafana | Running | Monitoring |
| Ollama + Open WebUI | Running | No models pulled yet |
| LiteLLM | Running | Cloud API proxy |
| **Cloudflared** | **Broken** | CreateContainerConfigError — tunnel token secret missing |

**GPU ceiling:** 3B models on GPU (~30 tok/s). 7B on CPU (~4 tok/s, 4.5GB RAM).

---

## Phased Plan

### Phase 0 — Prove the workflow (Legion, now, free)

Validate the full stack end-to-end before spending on hardware.
Decision gate: if after 2–3 weeks of daily use the Legion feels too slow → proceed to Phase 1.

#### 1. Models

Single Ollama deployment. Models cached on disk, swapped on demand.

| Model | Runs on | Speed | Purpose |
|-------|---------|-------|---------|
| `phi4-mini` (3.8B) | GPU ~2.5GB VRAM | ~30 tok/s | Real-time chat, personal docs, Immich Q&A |
| `deepseek-r1:1.5b` (1.5B) | GPU ~1.2GB VRAM | ~40 tok/s | Offline reasoning — no internet, no cloud |
| `qwen2.5:7b` (7B) | CPU ~4.5GB RAM | ~4 tok/s | Agent-forge tasks — async, slow tokens acceptable |

Note: Only one GPU model active at a time (4GB VRAM ceiling). Ollama evicts automatically.

#### 2. Internet Access — fix Cloudflared

Cloudflared is already deployed but broken: missing tunnel token secret.

Fix: `make cloudflared-secret TUNNEL_TOKEN=<token>` (get token from Cloudflare Zero Trust dashboard).

Once fixed, permanent public URLs (no ngrok, no VPN):

| Service | Public URL | Purpose |
|---------|-----------|---------|
| Open WebUI | `chat.lab.hiteshp.in` | Chat from iPad/iPhone anywhere |
| Grafana | `grafana.lab.hiteshp.in` | Health dashboards |
| Status API | `status-api.lab.hiteshp.in` | Health widget data feed |

LiteLLM stays internal (not publicly exposed — accessed by agent-forge inside cluster).

#### 3. Device Health Widget

**Problem:** No way to monitor cluster health from iPad/iPhone.

**Solution:** Small status API service + iOS Scriptable widget.

Architecture:
```
Legion cluster
└── status-api (new lightweight service)
    ├── Queries: nvidia-smi, kubectl metrics-server, Kopia API, ArgoCD API
    └── Exposes: GET /status → JSON

Cloudflare Tunnel → status-api.lab.hiteshp.in

iOS (iPad + iPhone)
└── Scriptable widget (free app) → polls /status every 5 min
    ├── Summary: 🟢 24 pods · CPU 45% · MEM 70% · GPU 38°C
    └── Tap → opens Grafana full dashboard
```

Metrics to expose:

| Category | Metrics |
|----------|---------|
| Node | CPU %, Memory %, Disk %, CPU temp |
| GPU | VRAM used/free, util %, temp |
| Cluster | Running pods / total, error pod count |
| Services | ArgoCD sync status, Cloudflared status, key apps up/down |
| Models | Active Ollama model name, VRAM consumed |
| Storage | Immich PVC usage, Kopia last backup timestamp |
| Uptime | Results from Uptime Kuma (already running) |

New device onboarding: install Scriptable → paste script → working in < 5 min. Widget script lives in this repo under `tools/status-widget/`.

#### 4. Agent-forge Integration

Wire agent-forge coordinator to LiteLLM endpoint in cluster (`http://litellm.litellm.svc.cluster.local:4000/v1`).

Routing strategy (see agent-forge/PLAN.md for full details):
- Simple tasks → `phi4-mini` local (fast, free)
- Agent orchestration → `qwen2.5:7b` local (slow but offline-capable)
- Heavy reasoning → `deepseek-r1:1.5b` local (offline) or Anthropic via LiteLLM (cloud fallback)

---

### Phase 1 — New compute node

**Trigger:** Phase 0 decision gate passes (daily use, Legion feels limiting).
**Timing:** After MacBook situation resolves (company sale confirmed or MacBook Air purchased).

**Target:** Mac Mini M6 32GB (₹2,07,900)
- 32GB unified memory → Qwen2.5-32B Q4 (~20GB) fits comfortably
- Silent, ~20W, always-on homelab server
- Plugs into existing monitor
- Joins cluster as K3s primary node

**Models on Mac Mini M6:**

| Model | Purpose |
|-------|---------|
| `qwen2.5:32b` | Agent-forge orchestrator — handles complex multi-step tasks |
| `deepseek-r1:32b` distill | Reasoning agents — offline, no cloud needed |
| `phi4-mini` / `llama3.2:3b` | Fast chat, notes, low-latency responses |
| Multimodal (llava or minicpm-v) | Immich photos/video context — "what's in this album?" |

**Migration steps:**
1. Join Mac Mini as K3s worker node
2. Drain and migrate workloads from Legion
3. Pull models on Mac Mini
4. Update LiteLLM to point at Mac Mini's Ollama
5. Legion becomes secondary (see Phase 2)

---

### Phase 2 — Legion repurposing

Decide after Phase 1 is stable. Options:

| Option | Description | Best if |
|--------|-------------|---------|
| A — Secondary K3s worker | Join as worker node, adds redundancy | Mac Mini handling all workloads solo |
| B — Dedicated storage node | Kopia backup target, Immich raw storage | Storage PVCs getting large |
| C — Small model host | Always-warm phi4-mini for fast chat | Mac Mini busy with 32B inference |
| D — Decommission | Retire | Mac Mini handles everything comfortably |

---

## Open Questions

| Question | Status |
|----------|--------|
| Tailscale for SSH/kubectl admin access (vs Cloudflare for public services)? | Recommended — add once Cloudflared is working |
| DSLR photos B2 backup (20GB, currently pendrive only)? | Blocked on B2 paid tier (~$1/mo) |
| Self-signed SSL → cert-manager CA for proper trust? | Deferred — port-forward workaround works |
| Which status-api language? Go or Python? | Go preferred (matches awesome-tools Go packages) |
