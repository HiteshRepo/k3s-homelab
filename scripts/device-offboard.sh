#!/usr/bin/env bash
# Offboard a device: stop/uninstall homelab-agent (via SSH for mac/linux),
# remove the entry from config/devices.yaml.
set -euo pipefail

DEVICES_FILE="config/devices.yaml"
DEVICE_ID="${1:-}"

if [ -z "$DEVICE_ID" ]; then
  echo "Usage: make device-offboard id=<device-id>" >&2
  exit 1
fi

# Parse device fields using Python (venv) to avoid yq dependency
PYTHON="${PYTHON:-.venv/bin/python3}"
if ! command -v "$PYTHON" &>/dev/null; then
  PYTHON="python3"
fi

device_json=$("$PYTHON" - <<PYEOF
import yaml, json, sys
with open("$DEVICES_FILE") as f:
    data = yaml.safe_load(f)
devices = data.get("devices", [])
match = next((d for d in devices if d["id"] == "$DEVICE_ID"), None)
if match is None:
    print("ERROR: device '${DEVICE_ID}' not found in ${DEVICES_FILE}", file=sys.stderr)
    sys.exit(1)
print(json.dumps(match))
PYEOF
)

kind=$(echo "$device_json" | "$PYTHON" -c "import json,sys; d=json.load(sys.stdin); print(d.get('kind',''))")
host=$(echo "$device_json" | "$PYTHON" -c "import json,sys; d=json.load(sys.stdin); print(d.get('host',''))")
cleanup=$(echo "$device_json" | "$PYTHON" -c "import json,sys; d=json.load(sys.stdin); print(str(d.get('cleanup_on_offboard',False)).lower())")

if [ "$cleanup" = "true" ]; then
  echo ""
  echo "⚠️  Device '${DEVICE_ID}' has cleanup_on_offboard: true."
  read -rp "Type 'yes' to confirm offboarding: " confirm
  if [ "$confirm" != "yes" ]; then
    echo "Aborted." >&2
    exit 1
  fi
fi

if [ "$kind" = "mac" ] || [ "$kind" = "linux" ]; then
  if [ -z "$host" ]; then
    echo "Error: no host configured for device '${DEVICE_ID}'" >&2
    exit 1
  fi

  echo "Connecting to ${host} to stop and uninstall homelab-agent..."

  if [ "$kind" = "mac" ]; then
    ssh "$host" 'launchctl unload ~/Library/LaunchAgents/in.hiteshp.homelab-agent.plist 2>/dev/null; rm -f ~/Library/LaunchAgents/in.hiteshp.homelab-agent.plist /usr/local/bin/homelab-agent && echo "homelab-agent removed"' \
      || echo "Warning: SSH command failed — agent may need manual removal on ${host}"
  else
    ssh "$host" 'systemctl --user stop homelab-agent 2>/dev/null; systemctl --user disable homelab-agent 2>/dev/null; rm -f ~/.config/systemd/user/homelab-agent.service /usr/local/bin/homelab-agent && echo "homelab-agent removed"' \
      || echo "Warning: SSH command failed — agent may need manual removal on ${host}"
  fi
fi

# Remove entry from devices.yaml
"$PYTHON" - <<PYEOF
import yaml, sys

with open("$DEVICES_FILE") as f:
    data = yaml.safe_load(f)

before = len(data.get("devices", []))
data["devices"] = [d for d in data.get("devices", []) if d["id"] != "$DEVICE_ID"]
after = len(data["devices"])

if before == after:
    print("Error: device '${DEVICE_ID}' not found — nothing removed.", file=sys.stderr)
    sys.exit(1)

with open("$DEVICES_FILE", "w") as f:
    yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

print(f"✓ Removed device '${DEVICE_ID}' from ${DEVICES_FILE}")
PYEOF

echo ""
echo "Commit and push config/devices.yaml to remove the device from ArgoCD."
