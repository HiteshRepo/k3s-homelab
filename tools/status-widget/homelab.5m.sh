#!/usr/bin/env bash
# Homelab fleet status in the menu bar
# Refreshes every 5 minutes (5m in filename)
# <xbar.title>Homelab Status</xbar.title>
# <xbar.version>1.0</xbar.version>

STATUS_URL="https://status.hiteshpattanayak.com/status"

data=$(curl -sf --connect-timeout 3 "$STATUS_URL" 2>/dev/null)

if [ -z "$data" ]; then
  echo "🖥 offline"
  exit 0
fi

total=$(echo "$data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null)
healthy=$(echo "$data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for x in d if x['status']=='healthy'))" 2>/dev/null)
issues=$((total - healthy))

if [ "$issues" -eq 0 ]; then
  echo "🖥 ${healthy}/${total} ✓"
else
  echo "🖥 ${healthy}/${total} ⚠${issues}"
fi

echo "---"

echo "$data" | python3 -c "
import sys, json
d = json.load(sys.stdin)
icons = {'k8s-node': '🖥', 'mac': '💻', 'linux': '🐧', 'ios': '📱'}
colors = {'healthy': 'green', 'warning': 'orange', 'error': 'red', 'stale': 'gray'}
for dev in d:
    icon = icons.get(dev['kind'], '?')
    status = dev['status']
    color = colors.get(status, 'gray')
    m = dev.get('metrics') or {}
    cpu = m.get('cpu_percent')
    metric = f'{round(cpu)}% CPU' if cpu is not None else status
    print(f\"{icon} {dev['name']}  {metric} | color={color}\")
" 2>/dev/null

echo "---"
echo "Open status-api | href=https://status.hiteshpattanayak.com/status"
echo "Open Grafana | href=https://grafana.hiteshpattanayak.com"
