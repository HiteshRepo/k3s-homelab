#!/usr/bin/env bash
set -euo pipefail

# Sets up a GPU-enabled k3s node on Ubuntu 26.04 with an NVIDIA GTX 1650 (or similar).
# Safe to re-run — each layer checks whether it is already installed before proceeding.
#
# Stack installed (in order):
#   NVIDIA Driver → CUDA Toolkit → NVIDIA Container Toolkit → k3s → NVIDIA runtime config → Device Plugin
#
# Logs are written to /tmp/gpu-node-setup.log in addition to the terminal.

# ─── Helpers ──────────────────────────────────────────────────────────────────

info()  { echo -e "\n\033[1;34m==>\033[0m $*"; }
ok()    { echo -e "\033[1;32m✓\033[0m $*"; }
err()   { echo -e "\033[1;31m✗\033[0m $*" >&2; }

# Tee all output (stdout + stderr) to a log file for post-mortem inspection
LOG_FILE="/tmp/gpu-node-setup.log"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== gpu-node-setup.sh started at $(date) ==="

# Print the failing line and command when set -e triggers
trap 'err "Failed at line $LINENO — command: $BASH_COMMAND"; err "Full log: $LOG_FILE"' ERR

# ─── Layer 1: NVIDIA Driver ───────────────────────────────────────────────────
# ubuntu-drivers autoinstall is deprecated on 26.04; use ubuntu-drivers install.

if command -v nvidia-smi &>/dev/null; then
  ok "NVIDIA driver already installed"
else
  info "Installing NVIDIA driver"
  sudo ubuntu-drivers install
  echo ""
  echo "Driver installed — a reboot is required before continuing."
  echo "After rebooting, re-run this script to continue."
  exit 0
fi

# ─── Layer 2: CUDA Toolkit ────────────────────────────────────────────────────
# Without CUDA, Ollama falls back to CPU (~10–50x slower).

if command -v nvcc &>/dev/null; then
  ok "CUDA toolkit already installed"
else
  info "Installing CUDA toolkit"
  sudo apt-get install -y nvidia-cuda-toolkit
  ok "CUDA toolkit installed"
fi

nvcc --version

# ─── Layer 3: NVIDIA Container Toolkit ───────────────────────────────────────
# Installs only — the runtime is configured AFTER k3s because k3s bundles its
# own containerd binary separate from the system one. Configuring before k3s
# installs results in "containerd not found".

if dpkg -s nvidia-container-toolkit &>/dev/null 2>&1; then
  ok "NVIDIA Container Toolkit already installed"
else
  info "Installing NVIDIA Container Toolkit"
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | sudo gpg --yes --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
  sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
  ok "NVIDIA Container Toolkit installed"
fi

# ─── Layer 4: k3s ─────────────────────────────────────────────────────────────

if command -v k3s &>/dev/null; then
  ok "k3s already installed"
else
  info "Installing k3s"
  make install-k3s
  ok "k3s installed"
fi

# Checked independently — kubeconfig may be missing even if k3s is already installed
if [ ! -f ~/.kube/config ]; then
  info "Copying kubeconfig"
  make kubeconfig
  ok "kubeconfig ready at ~/.kube/config"
fi

info "Waiting for k3s node to be Ready"
sudo k3s kubectl wait node --all --for=condition=Ready --timeout=60s
ok "k3s node is Ready"

# ─── Layer 5: Configure NVIDIA runtime for k3s containerd ────────────────────
# k3s regenerates config.toml on every restart, wiping manual edits.
# Use config.toml.d/ drop-in directory — k3s imports these and never overwrites them.

NVIDIA_DROP_IN="/var/lib/rancher/k3s/agent/etc/containerd/config.toml.d/nvidia.toml"

if [ -f "$NVIDIA_DROP_IN" ]; then
  ok "NVIDIA runtime already configured for k3s containerd"
else
  info "Configuring NVIDIA runtime for k3s containerd"
  sudo mkdir -p "$(dirname "$NVIDIA_DROP_IN")"
  sudo nvidia-ctk runtime configure --runtime=containerd --config "$NVIDIA_DROP_IN"
  sudo systemctl restart k3s
  sleep 5
  sudo k3s kubectl wait node --all --for=condition=Ready --timeout=60s
  ok "NVIDIA runtime configured and k3s restarted"
fi

# ─── Layer 6: NVIDIA Device Plugin ───────────────────────────────────────────
# Without this, k3s's scheduler has no idea a GPU exists — it only tracks CPU
# and memory by default. The device plugin registers nvidia.com/gpu as a
# schedulable resource.

info "Deploying NVIDIA Device Plugin"
sudo k3s kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.17.0/deployments/static/nvidia-device-plugin.yml

info "Waiting for device plugin to be ready"
sudo k3s kubectl rollout status daemonset nvidia-device-plugin-daemonset -n kube-system --timeout=120s
ok "Device plugin running"

# The plugin may need a restart to pick up the runtime config it didn't see on first launch
if ! sudo k3s kubectl describe node | grep -q "nvidia.com/gpu"; then
  info "GPU not yet visible — restarting device plugin to pick up runtime config"
  sudo k3s kubectl rollout restart daemonset nvidia-device-plugin-daemonset -n kube-system
  sudo k3s kubectl rollout status daemonset nvidia-device-plugin-daemonset -n kube-system --timeout=60s
fi

if sudo k3s kubectl describe node | grep -q "nvidia.com/gpu"; then
  ok "GPU registered with k3s scheduler:"
  sudo k3s kubectl describe node | grep "nvidia.com/gpu"
else
  err "GPU not visible to the scheduler. Device plugin logs:"
  sudo k3s kubectl logs -n kube-system -l name=nvidia-device-plugin-ds --tail=40 || true
  err "Full log: $LOG_FILE"
  exit 1
fi

# ─── Smoke Test ───────────────────────────────────────────────────────────────

info "Running GPU smoke test (pulls nvidia/cuda image — may take a few minutes)"
sudo k3s kubectl delete pod gpu-test --ignore-not-found=true

sudo k3s kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: gpu-test
spec:
  restartPolicy: Never
  containers:
  - name: gpu-test
    image: nvidia/cuda:12.4.0-base-ubuntu22.04
    command: ["nvidia-smi"]
    resources:
      limits:
        nvidia.com/gpu: 1
EOF

# Poll until the pod reaches a terminal state (up to 5 minutes for image pull)
PHASE="Unknown"
for i in $(seq 1 30); do
  PHASE=$(sudo k3s kubectl get pod gpu-test -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
  case "$PHASE" in
    Succeeded) break ;;
    Failed)
      err "Smoke test pod failed. Logs:"
      sudo k3s kubectl logs gpu-test || true
      err "Pod events:"
      sudo k3s kubectl describe pod gpu-test | grep -A 20 "^Events:" || true
      sudo k3s kubectl delete pod gpu-test --ignore-not-found=true
      exit 1
      ;;
    *) sleep 10 ;;
  esac
done

if [ "$PHASE" != "Succeeded" ]; then
  err "Smoke test timed out (phase: $PHASE). Diagnostics:"
  sudo k3s kubectl describe pod gpu-test | grep -A 20 "^Events:" || true
  sudo k3s kubectl logs gpu-test 2>/dev/null || true
  sudo k3s kubectl delete pod gpu-test --ignore-not-found=true
  err "Full log: $LOG_FILE"
  exit 1
fi

echo ""
ok "Smoke test passed:"
sudo k3s kubectl logs gpu-test
sudo k3s kubectl delete pod gpu-test
echo ""
ok "GPU-enabled k3s node is ready"
echo "=== gpu-node-setup.sh completed at $(date) ==="
