# k3s-homelab

GitOps homelab on K3s. Runs on a single Ubuntu laptop on your home network.

## What's Included

| App | URL | Purpose |
|-----|-----|---------|
| ArgoCD | https://argocd.lab.hiteshp.in | GitOps engine |
| Homarr | https://homarr.lab.hiteshp.in | Dashboard |
| Grafana | https://grafana.lab.hiteshp.in | Metrics dashboards |
| Uptime Kuma | https://status.lab.hiteshp.in | Uptime monitoring |
| Traefik | https://traefik.lab.hiteshp.in | Ingress controller |
| Open WebUI | https://chat.lab.hiteshp.in | LLM chat UI (backed by Ollama) |

## Network

- MetalLB IP pool: `192.168.1.200 – 192.168.1.220`
- Traefik LoadBalancer IP: `192.168.1.200`
- Domain: `*.lab.hiteshp.in` (fake local domain, resolved via /etc/hosts)

> If your router uses `192.168.1.200+` for DHCP, adjust the IP pool in
> `gitops/manifests/metallb-config/ippool.yaml` and Traefik's IP in
> `gitops/apps/traefik.yaml` to a free range.

---

## Setup

### Step 1 — Install Ubuntu 26.04 on the laptop

Fresh install. Disable Secure Boot if prompted.

### Step 2 — Clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/k3s-homelab.git
cd k3s-homelab
```

### Step 3 — (GPU nodes only) Set up GPU support

If the laptop has an NVIDIA GPU, run this first — it installs the driver and requires a reboot before continuing:

```bash
./gpu-node-setup.sh
```

Re-run after reboot to complete the remaining layers (CUDA, container toolkit, device plugin).

### Step 4 — Run first-time setup

```bash
./first-time-setup.sh
```

This handles everything: prompts for your GitHub username, replaces placeholders, installs K3s and ArgoCD, bootstraps the app-of-apps, and prints the `/etc/hosts` entries to add on client machines.

### Step 5 — Set up /etc/hosts

Add these lines to `/etc/hosts` on any machine you want access from
(replace `192.168.1.200` with the IP printed by the setup script):

```
192.168.1.200   argocd.lab.hiteshp.in
192.168.1.200   homarr.lab.hiteshp.in
192.168.1.200   grafana.lab.hiteshp.in
192.168.1.200   status.lab.hiteshp.in
192.168.1.200   traefik.lab.hiteshp.in
192.168.1.200   chat.lab.hiteshp.in
```

### Step 6 — (Optional) Cloudflare Tunnel for external access

To expose Open WebUI outside your LAN via Cloudflare Tunnel:

1. Create a tunnel in [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → Networks → Tunnels → Create tunnel → Cloudflared
2. Copy the tunnel token, then:
   ```bash
   make cloudflared-secret TUNNEL_TOKEN=<token>
   ```
3. In the Cloudflare dashboard, add a public hostname:
   - Hostname: `chat.yourdomain.com`
   - Service: `http://open-webui.ollama.svc.cluster.local:8080`

---

## TODO

External access options (not yet implemented):

- [ ] **Cloudflare Tunnel** — transfer DNS from Netlify to Cloudflare (keep domain at Netlify, point nameservers to Cloudflare — free, ~24h propagation), then `make cloudflared-secret TUNNEL_TOKEN=<token>` and configure the public hostname in Zero Trust dashboard
- [ ] **Tailscale** — no domain needed, free for personal use, install on the GPU laptop and any client device; reach all services over the Tailscale network without exposing anything publicly

## Adding a New App

1. Create `gitops/apps/myapp.yaml` (ArgoCD Application pointing to a Helm chart or Git path)
2. Add a Traefik `IngressRoute` to `gitops/manifests/ingress-routes/` if the app needs external access
3. Push to GitHub — ArgoCD auto-discovers and deploys it

See `CLAUDE.md` for the full pattern including sync waves and IngressRoute conventions.

## Credentials

| Service | Username | Password |
|---------|----------|----------|
| ArgoCD | admin | run `make argocd-password` |
| Grafana | admin | admin |
| Open WebUI | — | first user registered becomes admin |
