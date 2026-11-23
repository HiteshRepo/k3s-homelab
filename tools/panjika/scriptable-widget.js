// Odia Panjika — Scriptable Widget
// Paste into Scriptable, add as home screen widget, tap to open the full calendar.
// Data source: pre-computed JSON in the GitHub repo (cached locally after first fetch).
//
// Sizes supported: small · medium · large

const GITHUB_RAW =
  "https://raw.githubusercontent.com/HiteshRepo/k3s-homelab/main/tools/panjika/src/data"
const APP_URL = "https://panjika.hiteshpattanayak.com"

// ── Colors (match the web app) ───────────────────────────────────────────────
const C_MAROON      = new Color("#7B1A2B")
const C_DARK_MAROON = new Color("#4A0E1A")
const C_SAFFRON     = new Color("#E8690B")
const C_WHITE       = new Color("#FFFFFF")
const C_MUTED       = new Color("#FFFFFF", 0.55)
const C_DIM         = new Color("#FFFFFF", 0.35)

// ── Odia numerals ────────────────────────────────────────────────────────────
function toOdia(n) {
  const digits = "୦୧୨୩୪୫୬୭୮୯"
  return String(n).split("").map(c => digits[+c]).join("")
}

// ── Cache ────────────────────────────────────────────────────────────────────
const fm = FileManager.local()
const CACHE_DIR = fm.joinPath(fm.documentsDirectory(), "panjika-cache")
if (!fm.fileExists(CACHE_DIR)) fm.createDirectory(CACHE_DIR)

async function loadYear(year) {
  const path = fm.joinPath(CACHE_DIR, `${year}.json`)
  if (fm.fileExists(path)) {
    return JSON.parse(fm.readString(path))
  }
  const req = new Request(`${GITHUB_RAW}/panchanga_${year}.json`)
  const text = await req.loadString()
  fm.writeString(path, text)
  return JSON.parse(text)
}

// ── Today's data ─────────────────────────────────────────────────────────────
async function getToday() {
  const today = new Date().toISOString().slice(0, 10)
  const year  = parseInt(today.slice(0, 4))

  for (const y of [year, year - 1]) {
    try {
      const data = await loadYear(y)
      const day  = data.days.find(d => d.date === today)
      if (day) return day
    } catch (_) {}
  }
  return null
}

// ── Widget builder ────────────────────────────────────────────────────────────
function makeGradient() {
  const g = new LinearGradient()
  g.colors    = [C_MAROON, C_DARK_MAROON]
  g.locations = [0, 1]
  g.startPoint = new Point(0, 0)
  g.endPoint   = new Point(1, 1)
  return g
}

function addLabel(parent, text, font, color, lines = 1) {
  const t = parent.addText(text)
  t.font      = font
  t.textColor = color
  t.lineLimit = lines
  t.minimumScaleFactor = 0.7
  return t
}

function enDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number)
  const months = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  return `${months[m]} ${d}, ${y}`
}

function tithiLine(day) {
  return day.paksha ? `${day.paksha} ${day.tithi}` : day.tithi
}

async function buildWidget(day, family) {
  const w = new ListWidget()
  w.backgroundGradient = makeGradient()
  w.url = APP_URL
  w.setPadding(14, 14, 14, 14)

  if (!day) {
    addLabel(w, "ତ୍ରୁଟି — ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ", Font.systemFont(14), C_WHITE)
    return w
  }

  if (family === "small") {
    // ── Small ──────────────────────────────────────────────────────────────
    addLabel(w, `${toOdia(day.odiaDate)}`, Font.boldSystemFont(42), C_SAFFRON)
    addLabel(w, day.odiaMonth, Font.boldSystemFont(15), C_WHITE)
    w.addSpacer(4)
    addLabel(w, enDate(day.date), Font.systemFont(11), C_MUTED)
    w.addSpacer(6)
    addLabel(w, tithiLine(day), Font.systemFont(12), C_WHITE, 2)

  } else if (family === "medium") {
    // ── Medium ─────────────────────────────────────────────────────────────
    const row = w.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()

    // Left: big date
    const left = row.addStack()
    left.layoutVertically()
    addLabel(left, `${toOdia(day.odiaDate)}`, Font.boldSystemFont(48), C_SAFFRON)
    addLabel(left, day.odiaMonth, Font.boldSystemFont(14), C_WHITE)
    addLabel(left, enDate(day.date), Font.systemFont(10), C_MUTED)

    row.addSpacer()

    // Right: panchanga rows
    const right = row.addStack()
    right.layoutVertically()
    right.spacing = 5

    const rows = [
      ["ତିଥି",    tithiLine(day)],
      ["ନକ୍ଷତ୍ର", day.nakshatra],
      ["ଯୋଗ",    day.yoga],
    ]
    for (const [label, val] of rows) {
      const r = right.addStack()
      r.layoutHorizontally()
      r.spacing = 4
      addLabel(r, label, Font.systemFont(10), C_DIM)
      r.addSpacer()
      addLabel(r, val, Font.systemFont(12), C_WHITE, 1)
    }

    w.addSpacer()

    // Bottom: sunrise / sunset / rahu
    const bottom = w.addStack()
    bottom.layoutHorizontally()
    bottom.spacing = 8
    addLabel(bottom, `☀ ${day.sunrise}`, Font.systemFont(10), C_MUTED)
    bottom.addSpacer()
    addLabel(bottom, `🌅 ${day.sunset}`, Font.systemFont(10), C_MUTED)
    bottom.addSpacer()
    addLabel(bottom, `⚠ ${day.rahuStart}–${day.rahuEnd}`, Font.systemFont(10), new Color("#FF6B6B"))

  } else {
    // ── Large ──────────────────────────────────────────────────────────────
    addLabel(w, `${toOdia(day.odiaDate)} ${day.odiaMonth}`, Font.boldSystemFont(32), C_SAFFRON)
    addLabel(w, enDate(day.date), Font.systemFont(13), C_MUTED)
    w.addSpacer(10)

    const fields = [
      ["ତିଥି",    tithiLine(day)],
      ["ନକ୍ଷତ୍ର", day.nakshatra],
      ["ଯୋଗ",    day.yoga],
      ["କରଣ",    day.karana],
    ]
    for (const [label, val] of fields) {
      const r = w.addStack()
      r.layoutHorizontally()
      r.spacing = 6
      addLabel(r, label, Font.systemFont(12), C_DIM)
      r.addSpacer()
      addLabel(r, val, Font.systemFont(14), C_WHITE)
      w.addSpacer(4)
    }

    w.addSpacer(8)

    const times = w.addStack()
    times.layoutHorizontally()
    addLabel(times, `☀ ସୂର୍ଯ୍ୟୋଦୟ  ${day.sunrise}`, Font.systemFont(12), C_MUTED)
    times.addSpacer()
    addLabel(times, `🌅 ${day.sunset}`, Font.systemFont(12), C_MUTED)

    w.addSpacer(6)

    const rahu = w.addStack()
    rahu.layoutHorizontally()
    rahu.backgroundColor = new Color("#FF000020")
    rahu.cornerRadius = 6
    rahu.setPadding(6, 8, 6, 8)
    addLabel(rahu, "ରାହୁ କାଳ", Font.systemFont(12), new Color("#FF6B6B"))
    rahu.addSpacer()
    addLabel(rahu, `${day.rahuStart} – ${day.rahuEnd}`, Font.boldSystemFont(12), new Color("#FF6B6B"))
  }

  return w
}

// ── Run ───────────────────────────────────────────────────────────────────────
const day    = await getToday()
const family = config.widgetFamily ?? "medium"
const widget = await buildWidget(day, family)

Script.setWidget(widget)
if (config.runsInApp) {
  if (family === "small")  widget.presentSmall()
  else if (family === "large") widget.presentLarge()
  else widget.presentMedium()
}
Script.complete()
