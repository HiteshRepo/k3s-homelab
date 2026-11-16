## 1. Device Registry

- [ ] 1.1 Create `config/devices.yaml` with the initial device list (legion k8s-node, macbook-work mac, ipad-pro ios, iphone-15 ios) and verify the file parses as valid YAML with all required fields present
- [ ] 1.2 Add `make device-add` target that interactively prompts for device fields and appends a valid entry to `config/devices.yaml`; verify by running `make device-add` and confirming the file is updated with correct YAML
- [ ] 1.3 Add `make device-offboard id=<id>` target that removes the entry from `config/devices.yaml` and (for mac/linux) stops/uninstalls homelab-agent via SSH; verify by running against a test entry and confirming removal
- [ ] 1.4 Validate that `make device-add` for a mac device prints the homelab-agent install one-liner and for an iOS device prints the POST push URL

## 2. homelab-agent (Go binary)

- [ ] 2.1 Scaffold `cmd/homelab-agent/` in the `awesome-tools` repo with a minimal Go module; verify `go build ./cmd/homelab-agent/` succeeds
- [ ] 2.2 Implement `GET /metrics` endpoint using `gopsutil` returning JSON with cpu_percent, mem_percent, disk_percent, uptime_seconds, timestamp; verify the endpoint returns HTTP 200 with all fields populated when hit with `curl`
- [ ] 2.3 Add battery_percent and charging fields for Mac and Linux hosts that have a battery; verify on a MacBook that the fields are present, and on a desktop/CI runner that they are null/omitted
- [ ] 2.4 Add cpu_temp_celsius field for Linux hosts (null if unreadable); verify the field is present on a Linux host and null when thermal data is unavailable
- [ ] 2.5 Implement `GET /health` endpoint returning `{"ok": true}`; verify HTTP 200 within 1 second
- [ ] 2.6 Write a systemd unit file template and a launchd plist template for the agent; verify service starts on boot by installing on a test Mac and confirming the agent survives a reboot
- [ ] 2.7 Add a cross-compile step to the Makefile (`make homelab-agent-build`) producing binaries for linux/amd64 and darwin/arm64; verify both binaries run on their respective targets
- [ ] 2.8 Write unit tests covering the metrics serialisation logic; verify `go test ./cmd/homelab-agent/...` passes with ≥ 80% coverage on the metrics package

## 3. status-api (Go service)

- [ ] 3.1 Scaffold `cmd/status-api/` in the `awesome-tools` repo; verify `go build ./cmd/status-api/` succeeds
- [ ] 3.2 Implement `config/devices.yaml` loader that validates required fields and fails with a descriptive error on missing/duplicate id; verify by passing a malformed YAML and confirming the error message
- [ ] 3.3 Implement `GET /status` endpoint returning a JSON array of device entries; verify HTTP 200 with one entry per device in a test fixture
- [ ] 3.4 Implement the homelab-agent poller: for each mac/linux device, spawn a goroutine that calls `GET /metrics` every 60 s and stores the result; verify by running a mock agent and confirming the status response reflects its metrics
- [ ] 3.5 Implement poll-timeout handling: if homelab-agent does not respond within 5 s, mark the device `error`; verify by pointing status-api at a port with no listener
- [ ] 3.6 Implement the k8s-node collector: query metrics-server for CPU/MEM, kubectl for pod counts/error pods, ArgoCD API for sync status, Ollama API for active model/VRAM, Kopia API for last backup, Uptime Kuma API for results; verify each data source is queried by running against the live cluster with `curl localhost:8080/status`
- [ ] 3.7 Implement `POST /push` endpoint: validate payload, store in `sync.Map` keyed by device id, return 204; verify 204 on valid payload, 404 on unknown id, 400 on malformed JSON
- [ ] 3.8 Implement stale detection for iOS devices: if `last_seen` is older than 2 hours, set status to `stale`; verify by inserting a push with an old timestamp in a unit test
- [ ] 3.9 Write unit tests for the registry loader, push handler, and stale detection; verify `go test ./cmd/status-api/...` passes with ≥ 80% coverage on those packages
- [ ] 3.10 Build Docker image (`FROM gcr.io/distroless/static` or similar) and push to GHCR; verify `docker run` starts the server and `GET /health` returns 200

## 4. Kubernetes Manifests (k3s-homelab repo)

- [ ] 4.1 Create `gitops/manifests/status-api/namespace.yaml` (Namespace: status-api); verify `kubectl apply -f` succeeds
- [ ] 4.2 Create `gitops/manifests/status-api/rbac.yaml` (ServiceAccount, ClusterRole granting get/list on nodes/pods/applications.argoproj.io, ClusterRoleBinding); verify by checking RBAC with `kubectl auth can-i list pods --as=system:serviceaccount:status-api:status-api`
- [ ] 4.3 Create `gitops/manifests/status-api/configmap.yaml` mounting `config/devices.yaml` as a ConfigMap; verify the ConfigMap data matches the file contents after `kubectl apply`
- [ ] 4.4 Create `gitops/manifests/status-api/deployment.yaml` referencing the GHCR image, the ConfigMap volume, and the ServiceAccount; set `imagePullPolicy: IfNotPresent`; verify the pod starts and `/health` returns 200 via port-forward
- [ ] 4.5 Create `gitops/manifests/status-api/service.yaml` (ClusterIP on port 8080); verify `kubectl get svc -n status-api` shows the service
- [ ] 4.6 Add `gitops/apps/status-api.yaml` ArgoCD Application (wave 4, prune + selfHeal); verify ArgoCD syncs the app after push to main
- [ ] 4.7 Add IngressRoute to `gitops/manifests/ingress-routes/` in `traefik-system` namespace for `status-api.lab.hiteshp.in`; verify the route responds via `curl -k https://status-api.lab.hiteshp.in/health`

## 5. Scriptable Widget (k3s-homelab repo)

- [ ] 5.1 Create `tools/status-widget/widget.js` with a configurable `BASE_URL` constant and a `fetchStatus()` function; verify the function returns parsed JSON when pointed at a running status-api
- [ ] 5.2 Implement small widget renderer (2×2): fleet health fraction, warning pill, last updated time; verify visually in Scriptable on iPhone
- [ ] 5.3 Implement medium widget renderer (4×2): one row per device with status dot, name, kind, ownership badge, and kind-specific key metrics; verify all four device kinds render correctly in Scriptable preview
- [ ] 5.4 Implement large widget renderer (4×4): device cards with icon/name/kind/metrics, Ollama active model card, Kopia last backup card; verify visually in Scriptable on iPad
- [ ] 5.5 Implement full-page detail screen: grouped device list (Cluster / Computers / iOS Devices), tap-to-drill-down, per-device metric bars and info rows, ownership badge; verify navigation works in Scriptable
- [ ] 5.6 Add "Open Grafana" button to cluster device detail screen; verify tapping opens `https://grafana.lab.hiteshp.in` in Safari
- [ ] 5.7 Add company device warning banner and "Offboard & Remove Tracking" button (deep-link to Shortcuts or instructional alert); verify the banner appears only for `ownership: company` devices
- [ ] 5.8 Add iOS device push-collection banner with last push timestamp to iOS device detail screens; verify the banner shows the correct last_seen time from the status response

## 6. End-to-End Verification

- [ ] 6.1 Add a mac/linux test device to `config/devices.yaml`, install homelab-agent via the `make device-add` one-liner, push to main, confirm the device appears in `GET /status` within 2 minutes of ArgoCD sync
- [ ] 6.2 Set up iOS Shortcut on iPhone using the printed push URL, trigger the shortcut manually, confirm the device appears with `healthy` status in `GET /status`
- [ ] 6.3 Install `widget.js` in Scriptable on iPhone, set widget parameter to `http://192.168.1.200`, confirm all three widget sizes render correct data from the live cluster
- [ ] 6.4 Simulate homelab-agent unreachable (stop the service) and confirm the device switches to `error` within 65 seconds in `GET /status` and the widget reflects this on next refresh
- [ ] 6.5 Run `make device-offboard id=<test-id>` on the test device added in 6.1 and confirm the entry is removed from `config/devices.yaml` and the device disappears from `GET /status` after ArgoCD sync
