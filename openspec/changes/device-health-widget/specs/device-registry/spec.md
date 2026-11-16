## Purpose

The device registry is a YAML file (`config/devices.yaml`) that serves as the single source of truth for which devices are tracked; adding or removing a device requires only editing this file and pushing to `main`.

## ADDED Requirements

### Requirement: Declare devices in YAML

The registry SHALL be located at `config/devices.yaml` relative to the repository root. It SHALL contain a top-level `devices` key with an array of device entries. Each entry SHALL include: `id` (unique kebab-case string), `name` (human-readable string), `kind` (one of `k8s-node`, `mac`, `linux`, `ios`), and `ownership` (one of `personal`, `company`). Entries with `kind: mac` or `kind: linux` SHALL also include `host` (IP or hostname) and `port` (integer). Entries with `ownership: company` MAY include `cleanup_on_offboard: true`.

#### Scenario: Valid registry loaded by status-api

- **WHEN** status-api starts and reads a valid `config/devices.yaml`
- **THEN** every device declared in the file is tracked and appears in `GET /status`

#### Scenario: Missing required field

- **WHEN** `config/devices.yaml` contains an entry missing a required field (e.g. `kind`)
- **THEN** status-api logs a startup error naming the offending entry and exits with a non-zero code

#### Scenario: Duplicate device id

- **WHEN** `config/devices.yaml` contains two entries with the same `id`
- **THEN** status-api logs a startup error and exits with a non-zero code

### Requirement: Device onboarding via make target

The repository SHALL provide a `make device-add` target that interactively prompts for device fields, appends a valid entry to `config/devices.yaml`, and prints the appropriate next step (homelab-agent install one-liner for mac/linux; push URL for iOS Shortcuts). The entire onboarding process for a new device SHALL be completable in under 5 minutes.

#### Scenario: Add a mac device

- **WHEN** the user runs `make device-add` and answers prompts for a mac device
- **THEN** a new entry is appended to `config/devices.yaml` and the homelab-agent install one-liner is printed

#### Scenario: Add an iOS device

- **WHEN** the user runs `make device-add` and answers prompts for an iOS device
- **THEN** a new entry is appended to `config/devices.yaml` and the POST push URL is printed for use in iOS Shortcuts

### Requirement: Device offboarding via make target

The repository SHALL provide a `make device-offboard id=<id>` target that stops and uninstalls the homelab-agent on the target machine (via SSH for mac/linux) and removes the entry from `config/devices.yaml`. For devices with `cleanup_on_offboard: true`, the target SHALL print a confirmation prompt before proceeding.

#### Scenario: Offboard a company mac

- **WHEN** the user runs `make device-offboard id=macbook-work` for a device with `cleanup_on_offboard: true`
- **THEN** the target prompts for confirmation, stops and removes the homelab-agent on the remote machine, and removes the entry from `config/devices.yaml`
