#!/usr/bin/env bash
# Interactive device onboarding: prompts for fields, appends to config/devices.yaml,
# prints the appropriate next step (agent install one-liner or iOS push URL).
set -euo pipefail

DEVICES_FILE="config/devices.yaml"
STATUS_API_HOST="${STATUS_API_HOST:-192.168.1.200}"
STATUS_API_PORT="${STATUS_API_PORT:-8080}"

prompt() {
  local var_name="$1"
  local prompt_text="$2"
  local default="${3:-}"
  local value
  if [ -n "$default" ]; then
    read -rp "$prompt_text [$default]: " value
    value="${value:-$default}"
  else
    while true; do
      read -rp "$prompt_text: " value
      [ -n "$value" ] && break
      echo "  (required)" >&2
    done
  fi
  printf '%s' "$value"
}

prompt_choice() {
  local prompt_text="$1"
  shift
  local choices=("$@")
  while true; do
    echo "$prompt_text"
    for i in "${!choices[@]}"; do
      echo "  $((i+1))) ${choices[$i]}"
    done
    read -rp "Choice [1-${#choices[@]}]: " idx
    if [[ "$idx" =~ ^[0-9]+$ ]] && [ "$idx" -ge 1 ] && [ "$idx" -le "${#choices[@]}" ]; then
      echo "${choices[$((idx-1))]}"
      return
    fi
    echo "  Invalid choice." >&2
  done
}

echo ""
echo "=== Add a new device to config/devices.yaml ==="
echo ""

id=$(prompt "id" "Device ID (kebab-case, e.g. macbook-home)")
name=$(prompt "name" "Display name (e.g. MacBook Home)")
kind=$(prompt_choice "Device kind:" k8s-node mac linux ios)
ownership=$(prompt_choice "Ownership:" personal company)

entry="  - id: ${id}"$'\n'"    name: ${name}"$'\n'"    kind: ${kind}"$'\n'"    ownership: ${ownership}"

if [ "$kind" = "mac" ] || [ "$kind" = "linux" ]; then
  host=$(prompt "host" "IP address or hostname")
  port=$(prompt "port" "Agent port" "9100")
  entry="${entry}"$'\n'"    host: ${host}"$'\n'"    port: ${port}"
fi

if [ "$ownership" = "company" ]; then
  entry="${entry}"$'\n'"    cleanup_on_offboard: true"
fi

echo "" >> "$DEVICES_FILE"
echo "$entry" >> "$DEVICES_FILE"

echo ""
echo "✓ Added device '${id}' to ${DEVICES_FILE}"
echo ""

if [ "$kind" = "mac" ] || [ "$kind" = "linux" ]; then
  echo "Next step — install homelab-agent on the device:"
  echo ""
  echo "  curl -fsSL http://${STATUS_API_HOST}/homelab-agent/install.sh | bash -s -- --port ${port}"
  echo ""
  echo "Or if cross-compiled binaries are available via GitHub Releases:"
  echo "  curl -fsSL https://github.com/HiteshRepo/awesome-tools/releases/latest/download/install-homelab-agent.sh | bash -s -- --port ${port}"
  echo ""
elif [ "$kind" = "ios" ]; then
  echo "Next step — create an iOS Shortcut that POSTs to:"
  echo ""
  echo "  http://${STATUS_API_HOST}/push"
  echo ""
  echo "Payload (adjust values as needed):"
  cat <<JSON
  {
    "id": "${id}",
    "battery_percent": 80.0,
    "charging": false,
    "disk_free_bytes": 10000000000,
    "disk_total_bytes": 128000000000,
    "wifi_connected": true
  }
JSON
fi

echo "Commit and push config/devices.yaml to trigger ArgoCD sync."
