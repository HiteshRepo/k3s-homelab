// Homelab Device Status Widget for Scriptable
// ─────────────────────────────────────────────
// Install: paste into Scriptable, set widget parameter to your status-api base URL
// Default: http://192.168.29.201:8080 (plain HTTP, direct LoadBalancer IP — no hostname needed)
// To use HTTPS: change BASE_URL to https://status-api.lab.hiteshp.in
//
// Widget parameter overrides BASE_URL at runtime.

const BASE_URL = args.widgetParameter || "http://192.168.29.201:8080"
const STATUS_PATH = "/status"

// ─── Colours ───────────────────────────────────────────────────────────────────
const COLOR = {
  bg:          new Color("#1C1C1E"),
  bgCard:      new Color("#2C2C2E"),
  bgCardAlt:   new Color("#3A3A3C"),
  healthy:     new Color("#30D158"),
  warning:     new Color("#FFD60A"),
  error:       new Color("#FF453A"),
  stale:       new Color("#8E8E93"),
  text:        new Color("#FFFFFF"),
  textDim:     new Color("#8E8E93"),
  textSmall:   new Color("#AEAEB2"),
  company:     new Color("#FF9F0A"),
  accent:      new Color("#0A84FF"),
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
async function fetchStatus() {
  const url = BASE_URL.replace(/\/$/, "") + STATUS_PATH
  const req = new Request(url)
  req.timeoutInterval = 10
  const data = await req.loadJSON()
  return Array.isArray(data) ? data : []
}

function statusColor(status) {
  switch (status) {
    case "healthy":  return COLOR.healthy
    case "warning":  return COLOR.warning
    case "error":    return COLOR.error
    case "stale":    return COLOR.stale
    default:         return COLOR.stale
  }
}

function kindIcon(kind) {
  switch (kind) {
    case "k8s-node": return "🖥"
    case "mac":      return "💻"
    case "linux":    return "🐧"
    case "ios":      return "📱"
    default:         return "❓"
  }
}

function fmtPct(val) {
  if (val == null) return "—"
  return Math.round(val) + "%"
}

function fmtBytes(bytes) {
  if (bytes == null) return "—"
  const gb = bytes / 1073741824
  return gb.toFixed(1) + "GB"
}

function fmtRelative(isoStr) {
  if (!isoStr) return "never"
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000
  if (diff < 60)   return Math.round(diff) + "s ago"
  if (diff < 3600) return Math.round(diff / 60) + "m ago"
  if (diff < 86400) return Math.round(diff / 3600) + "h ago"
  return Math.round(diff / 86400) + "d ago"
}

function healthSummary(devices) {
  const total   = devices.length
  const healthy = devices.filter(d => d.status === "healthy").length
  const issues  = devices.filter(d => d.status !== "healthy").length
  return { total, healthy, issues }
}

// ─── Small widget (2×2) ────────────────────────────────────────────────────────
// Shows: fleet health fraction, warning pill, last updated
function buildSmall(widget, devices) {
  widget.backgroundColor = COLOR.bg
  widget.setPadding(14, 14, 14, 14)

  const { total, healthy, issues } = healthSummary(devices)

  // Title
  const title = widget.addText("Homelab")
  title.font = Font.boldSystemFont(13)
  title.textColor = COLOR.textDim

  widget.addSpacer(6)

  // Fraction
  const frac = widget.addText(`${healthy}/${total}`)
  frac.font = Font.boldSystemFont(28)
  frac.textColor = issues === 0 ? COLOR.healthy : COLOR.warning
  frac.minimumScaleFactor = 0.7

  const sub = widget.addText("devices healthy")
  sub.font = Font.systemFont(11)
  sub.textColor = COLOR.textDim

  widget.addSpacer()

  // Warning pill
  if (issues > 0) {
    const pill = widget.addText(`⚠ ${issues} issue${issues > 1 ? "s" : ""}`)
    pill.font = Font.boldSystemFont(11)
    pill.textColor = COLOR.error
  }

  widget.addSpacer(4)

  // Last updated
  const now = widget.addText("Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
  now.font = Font.systemFont(9)
  now.textColor = COLOR.textDim
}

// ─── Medium widget (4×2) ───────────────────────────────────────────────────────
// One row per device: dot, name, kind, ownership badge, key metrics
function buildMedium(widget, devices) {
  widget.backgroundColor = COLOR.bg
  widget.setPadding(10, 14, 10, 14)

  const header = widget.addText("Homelab Fleet")
  header.font = Font.boldSystemFont(12)
  header.textColor = COLOR.textDim
  widget.addSpacer(6)

  for (const d of devices) {
    const row = widget.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()
    row.spacing = 6

    // Status dot
    const dot = row.addText("●")
    dot.font = Font.boldSystemFont(10)
    dot.textColor = statusColor(d.status)

    // Icon + name
    const nameStack = row.addStack()
    nameStack.layoutHorizontally()
    nameStack.spacing = 3

    const icon = nameStack.addText(kindIcon(d.kind))
    icon.font = Font.systemFont(11)

    const name = nameStack.addText(d.name)
    name.font = Font.systemFont(11)
    name.textColor = COLOR.text
    name.lineLimit = 1

    // Company badge
    if (d.ownership === "company") {
      const badge = row.addText("work")
      badge.font = Font.boldSystemFont(8)
      badge.textColor = COLOR.company
    }

    row.addSpacer()

    // Kind-specific key metric
    const metric = row.addText(keyMetric(d))
    metric.font = Font.systemFont(10)
    metric.textColor = COLOR.textSmall

    widget.addSpacer(4)
  }

  widget.addSpacer()
  const ts = widget.addText(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
  ts.font = Font.systemFont(9)
  ts.textColor = COLOR.textDim
  ts.rightAlignText()
}

function keyMetric(d) {
  const m = d.metrics
  if (!m) {
    return d.status === "error" ? "unreachable" : d.last_seen ? fmtRelative(d.last_seen) : "—"
  }
  switch (d.kind) {
    case "k8s-node":
      return `${fmtPct(m.cpu_percent)} CPU · ${m.pod_count ?? "?"} pods`
    case "mac":
    case "linux":
      return `${fmtPct(m.cpu_percent)} CPU · ${fmtPct(m.mem_percent)} MEM`
    case "ios": {
      const batt = m.battery_percent != null ? fmtPct(m.battery_percent) : "—"
      const wifi = m.wifi_name || "no WiFi"
      return `${batt} · ${wifi}`
    }
    default:
      return "—"
  }
}

// ─── Large widget (4×4) ────────────────────────────────────────────────────────
// Device cards + Ollama active model card + Kopia last backup card
function buildLarge(widget, devices) {
  widget.backgroundColor = COLOR.bg
  widget.setPadding(14, 14, 14, 14)

  const header = widget.addText("Homelab Fleet")
  header.font = Font.boldSystemFont(14)
  header.textColor = COLOR.text
  widget.addSpacer(8)

  for (const d of devices) {
    addDeviceCard(widget, d)
    widget.addSpacer(6)
  }

  // Ollama card
  const legion = devices.find(d => d.kind === "k8s-node")
  if (legion?.metrics) {
    addInfoCard(widget, "🤖 Ollama",
      legion.metrics.ollama_active_model || "idle",
      legion.metrics.ollama_vram_used_bytes ? fmtBytes(legion.metrics.ollama_vram_used_bytes) + " VRAM" : null
    )
    widget.addSpacer(6)
  }

  // Kopia backup card
  if (legion?.metrics?.kopia_last_backup) {
    addInfoCard(widget, "💾 Kopia backup",
      fmtRelative(legion.metrics.kopia_last_backup), null)
  }

  widget.addSpacer()
  const ts = widget.addText("Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
  ts.font = Font.systemFont(9)
  ts.textColor = COLOR.textDim
}

function addDeviceCard(widget, d) {
  const card = widget.addStack()
  card.backgroundColor = COLOR.bgCard
  card.cornerRadius = 8
  card.setPadding(8, 10, 8, 10)
  card.layoutHorizontally()
  card.centerAlignContent()
  card.spacing = 8

  // Icon
  const iconText = card.addText(kindIcon(d.kind))
  iconText.font = Font.systemFont(18)

  // Name + kind
  const info = card.addStack()
  info.layoutVertically()
  info.spacing = 2

  const nameRow = info.addStack()
  nameRow.layoutHorizontally()
  nameRow.spacing = 4

  const name = nameRow.addText(d.name)
  name.font = Font.boldSystemFont(11)
  name.textColor = COLOR.text

  if (d.ownership === "company") {
    const badge = nameRow.addText("work")
    badge.font = Font.boldSystemFont(8)
    badge.textColor = COLOR.company
  }

  const kindLabel = info.addText(d.kind)
  kindLabel.font = Font.systemFont(9)
  kindLabel.textColor = COLOR.textDim

  card.addSpacer()

  // Status + metric
  const right = card.addStack()
  right.layoutVertically()
  right.spacing = 2

  const dot = right.addText("● " + d.status)
  dot.font = Font.boldSystemFont(10)
  dot.textColor = statusColor(d.status)
  dot.rightAlignText()

  const metric = right.addText(keyMetric(d))
  metric.font = Font.systemFont(9)
  metric.textColor = COLOR.textSmall
  metric.rightAlignText()
}

function addInfoCard(widget, title, value, sub) {
  const card = widget.addStack()
  card.backgroundColor = COLOR.bgCardAlt
  card.cornerRadius = 8
  card.setPadding(8, 10, 8, 10)
  card.layoutHorizontally()
  card.centerAlignContent()
  card.spacing = 8

  const t = card.addText(title)
  t.font = Font.boldSystemFont(11)
  t.textColor = COLOR.textDim

  card.addSpacer()

  const valStack = card.addStack()
  valStack.layoutVertically()

  const v = valStack.addText(value)
  v.font = Font.systemFont(11)
  v.textColor = COLOR.text
  v.rightAlignText()

  if (sub) {
    const s = valStack.addText(sub)
    s.font = Font.systemFont(9)
    s.textColor = COLOR.textSmall
    s.rightAlignText()
  }
}

// ─── Full-page detail screen ───────────────────────────────────────────────────
// Groups: Cluster / Computers / iOS Devices
// Tap-to-drill-down per device
async function showDetailScreen(devices) {
  const table = new UITable()
  table.showSeparators = true

  // Header row
  const headerRow = new UITableRow()
  headerRow.isHeader = true
  const headerCell = headerRow.addText("Homelab Fleet", "")
  headerCell.titleFont = Font.boldSystemFont(16)
  table.addRow(headerRow)

  const groups = [
    { label: "Cluster",     kinds: ["k8s-node"] },
    { label: "Computers",   kinds: ["mac", "linux"] },
    { label: "iOS Devices", kinds: ["ios"] },
  ]

  for (const group of groups) {
    const devicesInGroup = devices.filter(d => group.kinds.includes(d.kind))
    if (devicesInGroup.length === 0) continue

    // Section header
    const sectionRow = new UITableRow()
    sectionRow.isHeader = true
    const sectionCell = sectionRow.addText(group.label)
    sectionCell.titleFont = Font.boldSystemFont(13)
    sectionCell.titleColor = COLOR.textDim
    table.addRow(sectionRow)

    for (const d of devicesInGroup) {
      const row = new UITableRow()
      row.height = 55

      const iconCell = row.addText(kindIcon(d.kind))
      iconCell.widthWeight = 10

      const nameCell = row.addText(d.name, d.kind + (d.ownership === "company" ? " · work" : ""))
      nameCell.widthWeight = 55

      const statusCell = row.addText("● " + d.status)
      statusCell.widthWeight = 20
      statusCell.titleColor = statusColor(d.status)
      statusCell.rightAligned()

      const metricCell = row.addText(keyMetric(d))
      metricCell.widthWeight = 15
      metricCell.rightAligned()

      row.onSelect = () => showDeviceDetail(d)
      row.dismissOnSelect = false

      table.addRow(row)
    }
  }

  await table.present(false)
}

async function showDeviceDetail(d) {
  const table = new UITable()
  table.showSeparators = true

  // Title
  const titleRow = new UITableRow()
  titleRow.isHeader = true
  const titleCell = titleRow.addText(kindIcon(d.kind) + " " + d.name, d.kind)
  titleCell.titleFont = Font.boldSystemFont(16)
  table.addRow(titleRow)

  // Status row
  addInfoRow(table, "Status", d.status, statusColor(d.status))
  addInfoRow(table, "Ownership", d.ownership, d.ownership === "company" ? COLOR.company : COLOR.text)

  if (d.last_seen) {
    addInfoRow(table, "Last seen", fmtRelative(d.last_seen), COLOR.textDim)
  }

  const m = d.metrics

  // Kind-specific metrics
  switch (d.kind) {
    case "k8s-node":
      if (m) {
        addMetricBar(table, "CPU",  m.cpu_percent)
        addMetricBar(table, "MEM",  m.mem_percent)
        addInfoRow(table, "Pods",         (m.pod_count ?? "—") + " total · " + (m.error_pod_count ?? "0") + " errors", COLOR.text)
        addInfoRow(table, "ArgoCD",       m.argocd_sync_status || "—", COLOR.text)
        addInfoRow(table, "Ollama model", m.ollama_active_model || "idle", COLOR.text)
        addInfoRow(table, "Kopia backup", m.kopia_last_backup ? fmtRelative(m.kopia_last_backup) : "—", COLOR.text)
      }
      addOpenGrafanaButton(table)
      break

    case "mac":
    case "linux":
      if (m) {
        addMetricBar(table, "CPU",  m.cpu_percent)
        addMetricBar(table, "MEM",  m.mem_percent)
        addMetricBar(table, "Disk", m.disk_percent)
        if (m.battery_percent != null) {
          addMetricBar(table, "Battery", m.battery_percent)
          addInfoRow(table, "Charging", m.charging ? "Yes" : "No", COLOR.text)
        }
        if (m.cpu_temp_celsius != null) {
          addInfoRow(table, "CPU temp", m.cpu_temp_celsius + "°C", COLOR.text)
        }
        addInfoRow(table, "Uptime", formatUptime(m.uptime_seconds), COLOR.text)
      }
      break

    case "ios":
      addIOSPushBanner(table, d)
      if (m) {
        if (m.battery_percent != null) addMetricBar(table, "Battery", m.battery_percent)
        addInfoRow(table, "Charging",   m.charging ? "Yes" : "No", COLOR.text)
        addInfoRow(table, "Disk free",  fmtBytes(m.disk_free_bytes), COLOR.text)
        addInfoRow(table, "Disk total", fmtBytes(m.disk_total_bytes), COLOR.text)
        addInfoRow(table, "WiFi",       m.wifi_name || "Disconnected", COLOR.text)
      }
      break
  }

  // Company warning banner + offboard button
  if (d.ownership === "company") {
    addCompanyWarningBanner(table, d)
  }

  await table.present(false)
}

function addInfoRow(table, label, value, color) {
  const row = new UITableRow()
  row.height = 44
  const lCell = row.addText(label)
  lCell.widthWeight = 35
  lCell.titleColor = COLOR.textDim
  lCell.titleFont = Font.systemFont(13)

  const vCell = row.addText(String(value ?? "—"))
  vCell.widthWeight = 65
  vCell.titleColor = color || COLOR.text
  vCell.titleFont = Font.systemFont(13)
  vCell.rightAligned()

  table.addRow(row)
}

function addMetricBar(table, label, pct) {
  const row = new UITableRow()
  row.height = 44

  const lCell = row.addText(label)
  lCell.widthWeight = 30
  lCell.titleColor = COLOR.textDim
  lCell.titleFont = Font.systemFont(13)

  const pctStr = pct != null ? Math.round(pct) + "%" : "—"
  const filled  = pct != null ? Math.round(pct / 10) : 0
  const bar = "█".repeat(filled) + "░".repeat(10 - filled)

  const barCell = row.addText(bar + " " + pctStr)
  barCell.widthWeight = 70
  barCell.titleColor = pct > 85 ? COLOR.error : pct > 60 ? COLOR.warning : COLOR.healthy
  barCell.titleFont = Font.systemFont(11)
  barCell.rightAligned()

  table.addRow(row)
}

function addOpenGrafanaButton(table) {
  const row = new UITableRow()
  row.height = 48

  const cell = row.addButton("Open Grafana ↗")
  cell.widthWeight = 100
  cell.onTap = () => Safari.open("https://grafana.lab.hiteshp.in")

  table.addRow(row)
}

function addCompanyWarningBanner(table, d) {
  const bannerRow = new UITableRow()
  bannerRow.height = 60

  const cell = bannerRow.addText(
    "⚠️ Company device",
    "This device is tracked under a company account."
  )
  cell.titleColor = COLOR.company
  cell.titleFont = Font.boldSystemFont(13)
  table.addRow(bannerRow)

  // Offboard button — deep-links to Shortcuts or shows instructional alert
  const offboardRow = new UITableRow()
  offboardRow.height = 48
  const btn = offboardRow.addButton("Offboard & Remove Tracking")
  btn.widthWeight = 100
  btn.onTap = async () => {
    const alert = new Alert()
    alert.title = "Offboard " + d.name
    alert.message =
      "Run the following on your homelab machine to remove this device:\n\n" +
      "make device-offboard id=" + d.id
    alert.addAction("Copy command")
    alert.addCancelAction("Cancel")
    const idx = await alert.present()
    if (idx === 0) {
      Pasteboard.copy("make device-offboard id=" + d.id)
    }
  }
  table.addRow(offboardRow)
}

function addIOSPushBanner(table, d) {
  const row = new UITableRow()
  row.height = 60
  const cell = row.addText(
    "📡 Push-based collection",
    "Last push: " + (d.last_seen ? fmtRelative(d.last_seen) : "never") +
    "\nData sent via iOS Shortcuts — no polling needed."
  )
  cell.titleColor = COLOR.accent
  cell.titleFont = Font.boldSystemFont(12)
  table.addRow(row)
}

function formatUptime(seconds) {
  if (!seconds) return "—"
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ─── Entry point ───────────────────────────────────────────────────────────────
let devices = []
try {
  devices = await fetchStatus()
} catch (e) {
  console.error("fetchStatus error: " + e)
}

if (config.runsInWidget) {
  const widget = new ListWidget()
  widget.url = URLScheme.forRunningScript()

  switch (config.widgetFamily) {
    case "small":
      buildSmall(widget, devices)
      break
    case "large":
      buildLarge(widget, devices)
      break
    default: // medium
      buildMedium(widget, devices)
  }

  Script.setWidget(widget)
  widget.presentMedium()
} else {
  // Running in app — show detail screen
  await showDetailScreen(devices)
}

Script.complete()
