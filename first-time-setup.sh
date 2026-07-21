#!/usr/bin/env bash
set -euo pipefail

# ─── Helpers ──────────────────────────────────────────────────────────────────

info()  { echo -e "\n\033[1;34m==>\033[0m $*"; }
ok()    { echo -e "\033[1;32m✓\033[0m $*"; }
pause() { echo -e "\n\033[1;33m[ACTION REQUIRED]\033[0m $*"; read -rp "Press Enter when done..."; }

# ─── GitHub username ──────────────────────────────────────────────────────────

if grep -qr "YOUR_USERNAME" gitops/ 2>/dev/null; then
  read -rp "Enter your GitHub username: " GITHUB_USERNAME
  make set-github-username GITHUB_USERNAME="$GITHUB_USERNAME"

  pause "Commit and push to GitHub now:
  git add gitops/
  git commit -m 'chore: set github username'
  git remote add origin https://github.com/$GITHUB_USERNAME/k3s-homelab.git
  git push -u origin main"
fi

# ─── System ───────────────────────────────────────────────────────────────────

if grep -q "^HandleLidSwitch=ignore" /etc/systemd/logind.conf; then
  ok "Lid suspend already disabled"
else
  info "Disabling lid-close suspend"
  make lid-suspend-off
  ok "Lid suspend disabled"
fi

# ─── K3s ──────────────────────────────────────────────────────────────────────

if command -v k3s &>/dev/null; then
  ok "K3s already installed"
else
  info "Installing K3s"
  make install-k3s
  ok "K3s installed"
fi

if [ ! -f ~/.kube/config ]; then
  info "Copying kubeconfig"
  make kubeconfig
  ok "kubeconfig ready at ~/.kube/config"
fi

# ─── ArgoCD ───────────────────────────────────────────────────────────────────

if kubectl get deployment argocd-server -n argocd >/dev/null 2>&1; then
  ok "ArgoCD already installed"
else
  info "Installing ArgoCD"
  make install-argocd
  ok "ArgoCD ready"
fi

if kubectl get application app-of-apps -n argocd >/dev/null 2>&1; then
  ok "app-of-apps already bootstrapped"
else
  info "Bootstrapping app-of-apps"
  make bootstrap
  ok "Bootstrap applied — ArgoCD is now deploying all apps"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "ArgoCD admin password:"
make argocd-password

echo ""
info "Waiting for all apps to sync (Ctrl+C to exit when green)"
make watch

echo ""
info "Traefik LoadBalancer IP (add this to /etc/hosts on your client machines):"
make traefik-ip

echo ""
ok "Setup complete. Add the IP above to /etc/hosts:"
echo "  <ip>   argocd.lab.hiteshp.in"
echo "  <ip>   homarr.lab.hiteshp.in"
echo "  <ip>   grafana.lab.hiteshp.in"
echo "  <ip>   status.lab.hiteshp.in"
echo "  <ip>   traefik.lab.hiteshp.in"
