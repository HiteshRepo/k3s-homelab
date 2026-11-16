## Purpose

`homelab-agent` is a lightweight Go HTTP daemon installed on Mac and Linux machines that exposes a single `GET /metrics` endpoint returning device health metrics; it is polled by `status-api` running in the cluster.

## ADDED Requirements

### Requirement: Expose metrics endpoint

The agent SHALL expose `GET /metrics` on a configurable port (default 9100) returning a JSON object with the following fields: `cpu_percent` (float), `mem_percent` (float), `disk_percent` (float), `uptime_seconds` (int), and `timestamp` (RFC 3339 string). On Mac and Linux hosts that have a battery, the response SHALL also include `battery_percent` (float) and `charging` (bool). On Linux hosts the response SHALL also include `cpu_temp_celsius` (float, or `null` if unreadable).

#### Scenario: Metrics polled successfully

- **WHEN** `GET /metrics` is called on a running agent
- **THEN** the response is HTTP 200 with a JSON body containing all applicable metric fields populated with current values

#### Scenario: Battery absent (Linux desktop)

- **WHEN** `GET /metrics` is called on a host without a battery
- **THEN** the response omits `battery_percent` and `charging`, or returns them as `null`

#### Scenario: CPU temperature unreadable

- **WHEN** `GET /metrics` is called and the CPU temperature cannot be read (permission or hardware)
- **THEN** `cpu_temp_celsius` is `null` and the rest of the response is unaffected

### Requirement: Run as a background service

The agent SHALL be installable as a persistent background service (systemd on Linux, launchd on macOS) via a single shell command. The service SHALL start automatically on boot and restart on crash.

#### Scenario: Install one-liner on macOS

- **WHEN** the user runs the printed install command on a Mac
- **THEN** the agent binary is placed in a stable path, a launchd plist is installed, and the service starts immediately

#### Scenario: Install one-liner on Linux

- **WHEN** the user runs the printed install command on a Linux machine
- **THEN** the agent binary is placed in a stable path, a systemd unit file is installed, the unit is enabled, and the service starts immediately

### Requirement: Health check endpoint

The agent SHALL expose `GET /health` returning HTTP 200 with `{"ok": true}`. This endpoint SHALL respond within 1 second regardless of the state of metric collection.

#### Scenario: Health check always returns 200

- **WHEN** `GET /health` is called on a running agent
- **THEN** the response is HTTP 200 with body `{"ok": true}`
