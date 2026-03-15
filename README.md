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

## Network

- MetalLB IP pool: `192.168.1.200 – 192.168.1.220`
- Traefik LoadBalancer IP: `192.168.1.200`
- Domain: `*.lab.hiteshp.in` (fake local domain, resolved via /etc/hosts)

> If your router uses `192.168.1.200+` for DHCP, adjust the IP pool in
> `gitops/manifests/metallb-config/ippool.yaml` and Traefik's IP in
> `gitops/apps/traefik.yaml` to a free range.

---

## Setup

### Step 1 — Install Ubuntu on the laptop

Install Ubuntu 24.04 LTS. During install, disable Secure Boot if prompted.

After install, disable lid-close suspend:
```bash
sudo sed -i 's/#HandleLidSwitch=suspend/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
sudo systemctl restart systemd-logind
```

### Step 2 — Install K3s

```bash
curl -sfL https://get.k3s.io | sh -s - \
  --disable traefik \
  --disable servicelb \
  --disable local-storage \
  --disable metrics-server
```

Copy kubeconfig to your home directory:
```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config
```

### Step 3 — Create GitHub repo

1. Create a new GitHub repo named `k3s-homelab`
2. Replace `YOUR_USERNAME` in all files with your GitHub username:
   ```bash
   find gitops/ -type f -name "*.yaml" \
     -exec sed -i 's/YOUR_USERNAME/your-actual-username/g' {} +
   ```
3. Push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: initial k3s homelab setup"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/k3s-homelab.git
   git push -u origin main
   ```

### Step 4 — Install ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Wait for ArgoCD to be ready:
```bash
kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=120s
```

Get the initial admin password:
```bash
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 -d && echo
```

### Step 5 — Bootstrap the app-of-apps

```bash
kubectl apply -f gitops/app-of-apps.yaml
```

ArgoCD will now automatically deploy all apps. Watch progress:
```bash
kubectl get applications -n argocd -w
```

### Step 6 — Set up /etc/hosts

Add these lines to `/etc/hosts` on any machine you want access from
(replace `192.168.1.200` with the actual IP K3s assigned to Traefik):

```
192.168.1.200   argocd.lab.hiteshp.in
192.168.1.200   homarr.lab.hiteshp.in
192.168.1.200   grafana.lab.hiteshp.in
192.168.1.200   status.lab.hiteshp.in
192.168.1.200   traefik.lab.hiteshp.in
```

Find Traefik's actual IP:
```bash
kubectl get svc -n traefik-system traefik -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

---

## Adding a New App

1. Create `gitops/apps/myapp.yaml` (ArgoCD Application pointing to a Helm chart)
2. Push to GitHub — ArgoCD auto-discovers and deploys it

## Credentials

| Service | Username | Password |
|---------|----------|----------|
| ArgoCD | admin | (see Step 4) |
| Grafana | admin | admin |
