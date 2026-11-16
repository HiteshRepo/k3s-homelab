# Homelab Status Widgets

Fleet health widgets for iPhone, Mac, and Linux — all reading from `status-api` running in the cluster.

## Status API

Base URL (home WiFi only):

| Access method | URL |
|---|---|
| Direct (Mac/iPhone on LAN) | `http://192.168.29.146:31376` |
| Via LoadBalancer (Mac only) | `http://192.168.29.201:8080` |
| Via Traefik HTTPS | `https://status-api.lab.hiteshp.in` |

Endpoints: `GET /status`, `POST /push`, `GET /health`, `GET /widget.js`

---

## iPhone — Scriptable Widget

**Requires:** [Scriptable](https://scriptable.app) (free, App Store)

1. Install Scriptable
2. Open Safari on iPhone → `http://192.168.29.146:31376/widget.js`
3. Long-press page → Select All → Copy
4. Open Scriptable → `+` → Paste → name it `Homelab Status` → Done
5. Long-press home screen → `+` → Scriptable → choose size → Edit Widget → set Script to `Homelab Status`

**iOS Push Shortcut** (reports iPhone battery/WiFi to status-api):

Create a Shortcut with these 3 actions in order:
1. **Get Battery Level**
2. **Get Network Details** → WiFi → Network Name
3. **Get Contents of URL**
   - URL: `http://192.168.29.146:31376/push`
   - Method: POST
   - Body: JSON → `id=iphone-11`, `battery_percent=`[Battery Level], `wifi_name=`[Network Name]

Set an **Automation** (Shortcuts → Automation → Time of Day → Every hour → Don't Ask) to run it silently.

---

## macOS — xbar Menu Bar Plugin

**Requires:** [xbar](https://xbarapp.com) (`brew install xbar`)

1. Copy `homelab.5m.sh` to your xbar plugins directory:
   ```bash
   cp tools/status-widget/homelab.5m.sh ~/Library/Application\ Support/xbar/plugins/
   chmod +x ~/Library/Application\ Support/xbar/plugins/homelab.5m.sh
   ```
2. Open xbar — the plugin auto-loads and shows `🖥 N/N ✓` in your menu bar
3. Click the icon to see per-device status and quick links to Grafana

Refreshes every 5 minutes (controlled by `5m` in the filename).

---

## Linux / Lenovo — Shell Aliases

Add to `~/.bashrc`:

```bash
alias homelab='curl -s http://localhost:31376/status | python3 -m json.tool'
alias homelab-watch='watch -n 10 curl -s http://localhost:31376/status'
```

- `homelab` — one-shot pretty-printed status
- `homelab-watch` — live view refreshing every 10 seconds

---

## Device Registry

Devices are declared in `config/devices.yaml`. Add a device:

```bash
make device-add
```

Remove a device:

```bash
make device-offboard id=<device-id>
```

After editing `config/devices.yaml`, push to `main` — ArgoCD restarts `status-api` with the new device list automatically.
