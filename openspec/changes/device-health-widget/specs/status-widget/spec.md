## Purpose

`status-widget` is a Scriptable JavaScript widget for iPhone and iPad that polls `GET /status` every 5 minutes and renders device health in small, medium, and large variants with a full-page detail drill-down screen.

## ADDED Requirements

### Requirement: Render small widget (2×2)

The small widget SHALL display: overall fleet health as a fraction (`N/M devices healthy`), a warning count pill (hidden when zero), and the time of the last successful poll. It SHALL update at the Scriptable refresh interval (≤ 5 minutes).

#### Scenario: All devices healthy

- **WHEN** the small widget refreshes and all devices report `healthy`
- **THEN** the widget shows `N/N devices healthy` and no warning pill

#### Scenario: One device in warning state

- **WHEN** the small widget refreshes and one device has status `warning` or higher
- **THEN** the widget shows the warning count pill with the count

### Requirement: Render medium widget (4×2)

The medium widget SHALL display one row per device. Each row SHALL include a status dot (green/yellow/red/grey), device name, kind label, ownership badge (company devices highlighted), and the key metrics for its kind: Legion — CPU %, MEM %, GPU temp, pod count; Mac — CPU %, MEM %, battery %; iOS — battery %, storage free, WiFi indicator.

#### Scenario: Medium widget normal state

- **WHEN** the medium widget refreshes and all devices are reachable
- **THEN** each row shows a green dot and the device's current metrics

#### Scenario: Device offline in medium widget

- **WHEN** a device has status `error` or `stale`
- **THEN** its row shows a red or grey dot and the last-known metrics are displayed with a staleness indicator

### Requirement: Render large widget (4×4)

The large widget SHALL display device cards, each containing a kind icon, device name, kind label, and all key metrics for the device's kind. The large widget SHALL also include an "Active Ollama model" card and a "Kopia last backup" card derived from the Legion k8s-node entry.

#### Scenario: Large widget on iPad

- **WHEN** the large widget is placed on an iPad home screen and refreshes
- **THEN** all device cards are visible without scrolling, and the Ollama and Kopia cards are populated

### Requirement: Full-page detail screen

Tapping any widget variant SHALL open a Scriptable full-page detail screen. The detail screen SHALL list devices grouped by category: Cluster, Computers, iOS Devices. Tapping a device row SHALL navigate to a per-device detail screen showing metric bars, info rows, and an ownership badge. The cluster device detail SHALL include an "Open Grafana" button. Company device details SHALL show a warning banner. iOS device details SHALL show a banner explaining push-based collection and display the last push timestamp. The detail screen SHALL include an "Offboard & Remove Tracking" button for devices with `cleanup_on_offboard: true`.

#### Scenario: Tap widget to open detail

- **WHEN** the user taps any widget variant
- **THEN** Scriptable opens the full-page detail screen showing grouped device list

#### Scenario: Per-device metric drill-down

- **WHEN** the user taps a device row in the detail screen
- **THEN** a per-device screen shows all metrics for that device as bars and info rows

#### Scenario: Open Grafana from cluster detail

- **WHEN** the user views the Legion cluster detail screen and taps "Open Grafana"
- **THEN** Safari opens the Grafana URL (`https://grafana.lab.hiteshp.in`)

### Requirement: Widget data source configuration

The widget SHALL read the `status-api` base URL from a Scriptable widget parameter or a constant at the top of the script. The default SHALL be the local Traefik IP/hostname. Changing the URL to `https://status-api.lab.hiteshp.in` SHALL require only a one-line edit.

#### Scenario: Local WiFi data source

- **WHEN** the widget parameter is set to the local IP of the Traefik load balancer
- **THEN** the widget fetches data without requiring Cloudflare Tunnel
