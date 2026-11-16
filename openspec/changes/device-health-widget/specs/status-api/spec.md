## Purpose

`status-api` is an HTTP aggregator running in the Legion K3s cluster that collects device health metrics from cluster internals, LAN-reachable homelab-agents, and iOS push payloads, then serves a unified JSON snapshot to the Scriptable widget.

## ADDED Requirements

### Requirement: Serve unified device status

The system SHALL expose `GET /status` returning a JSON object containing an array of device entries, one per device declared in `config/devices.yaml`. Each entry SHALL include at minimum: device id, name, kind, ownership, an overall health status (`healthy` | `warning` | `error` | `stale`), and the metrics appropriate to its kind. The response SHALL be produced within 3 seconds under normal LAN conditions.

#### Scenario: All devices reachable

- **WHEN** all homelab-agents respond within timeout and cluster APIs are reachable
- **THEN** `GET /status` returns HTTP 200 with a JSON body containing one entry per registered device, all with health status `healthy` or `warning`

#### Scenario: A homelab-agent is unreachable

- **WHEN** the homelab-agent for a registered mac/linux device does not respond within the poll timeout
- **THEN** the corresponding device entry in `GET /status` has health status `error` and a `last_seen` timestamp indicating when it was last successfully polled

#### Scenario: An iOS device is stale

- **WHEN** no `POST /push` has been received from an iOS device within 2 hours
- **THEN** that device's entry in `GET /status` has health status `stale` and the `last_seen` field reflects the timestamp of the last received push

### Requirement: Receive iOS push data

The system SHALL expose `POST /push` accepting a JSON body identifying the device by id and carrying the iOS metrics payload (battery level, charging state, available disk, total disk, WiFi connected). The endpoint SHALL store the payload in memory and update the `last_seen` timestamp for that device. The endpoint SHALL return HTTP 204 on success.

#### Scenario: Valid iOS push

- **WHEN** an iOS Shortcut posts a valid JSON payload to `POST /push` with a known device id
- **THEN** the server responds HTTP 204 and the device's metrics are reflected in the next `GET /status` response

#### Scenario: Unknown device id

- **WHEN** `POST /push` receives a payload with an id not present in `config/devices.yaml`
- **THEN** the server responds HTTP 404 with an error message; no state is modified

#### Scenario: Malformed payload

- **WHEN** `POST /push` receives a body that is not valid JSON or is missing required fields
- **THEN** the server responds HTTP 400 with a descriptive error message

### Requirement: Pull cluster metrics for k8s-node devices

For each device with `kind: k8s-node`, the system SHALL query the in-cluster Kubernetes API (metrics-server, kubectl) and the Ollama, ArgoCD, Kopia, and Uptime Kuma APIs on a configurable interval (default 60 s). The collected metrics SHALL include CPU %, memory %, disk %, GPU utilisation %, GPU VRAM used/free, GPU temperature, running pod count, error pod count, ArgoCD sync status, active Ollama model, Ollama VRAM consumed, Kopia last backup time, and Uptime Kuma results.

#### Scenario: Cluster metrics collected successfully

- **WHEN** the collection interval elapses and all cluster APIs are reachable
- **THEN** the legion device entry in `GET /status` contains up-to-date values for all k8s-node metrics

#### Scenario: One cluster API unavailable

- **WHEN** the collection interval elapses and one cluster API (e.g. Ollama) is unreachable
- **THEN** the affected metric fields are set to `null` and the device health status is `warning`; other metrics are still populated

### Requirement: Poll homelab-agent for mac and linux devices

For each device with `kind: mac` or `kind: linux`, the system SHALL send `GET /metrics` to `http://<host>:<port>/metrics` on a configurable interval (default 60 s) and record the returned payload. If the agent does not respond within 5 seconds, the device SHALL be marked `error`.

#### Scenario: Homelab-agent responds in time

- **WHEN** the poll interval elapses and the agent responds within 5 seconds
- **THEN** the device entry contains the metrics from the agent response and health status reflects the values

#### Scenario: Homelab-agent poll timeout

- **WHEN** the poll interval elapses and the agent does not respond within 5 seconds
- **THEN** the device entry health status is set to `error` and the previous metrics are retained with a staleness indicator

### Requirement: Device registry reload on change

The system SHALL re-read `config/devices.yaml` on startup. If the file is updated and the pod is restarted (via ArgoCD sync), the new device list SHALL take effect without manual intervention.

#### Scenario: New device added via GitOps

- **WHEN** a new entry is added to `config/devices.yaml`, committed, and ArgoCD syncs the pod
- **THEN** the new device appears in `GET /status` within 2 minutes of the pod restart
