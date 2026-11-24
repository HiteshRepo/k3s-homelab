// Odia Panjika — Scriptable Widget
//
// Home screen widget → shows today's date.
// Tap → opens Scriptable and shows full panchanga detail table.
//
// Sizes: small · medium · large
// Setup: paste into Scriptable, name the script anything, add as widget.

const GITHUB_RAW =
  "https://raw.githubusercontent.com/HiteshRepo/k3s-homelab/main/tools/panjika/src/data"

// ── Colors ───────────────────────────────────────────────────────────────────
const C_MAROON      = new Color("#7B1A2B")
const C_DARK_MAROON = new Color("#4A0E1A")
const C_SAFFRON     = new Color("#E8690B")
const C_WHITE       = new Color("#FFFFFF")
const C_MUTED       = new Color("#FFFFFF", 0.55)
const C_DIM         = new Color("#FFFFFF", 0.35)
const C_RAHU        = new Color("#FF6B6B")

// ── Helpers ───────────────────────────────────────────────────────────────────
function toOdia(n) {
  const d = "୦୧୨୩୪୫୬୭୮୯"
  return String(n).split("").map(c => d[+c]).join("")
}

function enDate(dateStr) {
  const [y, m, day] = dateStr.split("-").map(Number)
  const mo = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  return `${mo[m]} ${day}, ${y}`
}

function tithiLine(day) {
  return day.paksha ? `${day.paksha} ${day.tithi}` : day.tithi
}

// Compact tithi label for lunar display (e.g. ଶୁ.୯, କ.୩, ପୂ, ଅ)
function tithiLabel(day) {
  const idx = day.tithiIndex
  if (idx === 14) return "ପୂ"
  if (idx === 29) return "ଅ"
  if (idx <= 13) return `ଶୁ.${toOdia(idx + 1)}`
  return `କ.${toOdia(idx - 14)}`
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const fm = FileManager.local()
const CACHE_DIR = fm.joinPath(fm.documentsDirectory(), "panjika-cache")
if (!fm.fileExists(CACHE_DIR)) fm.createDirectory(CACHE_DIR)

async function loadYear(year) {
  const path = fm.joinPath(CACHE_DIR, `${year}.json`)
  if (fm.fileExists(path)) return JSON.parse(fm.readString(path))
  const req  = new Request(`${GITHUB_RAW}/panchanga_${year}.json`)
  const text = await req.loadString()
  fm.writeString(path, text)
  return JSON.parse(text)
}

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

// ── Detail table (shown on tap) ───────────────────────────────────────────────
async function showDetail(day, mode) {
  if (!day) {
    const a = new Alert()
    a.title   = "ତ୍ରୁଟି"
    a.message = "Could not load today's data. Check your internet connection."
    a.addAction("OK")
    await a.present()
    return
  }

  const table = new UITable()
  table.showSeparators = true

  const C_LABEL = new Color("#E8690B")   // saffron — label names
  const C_VALUE = new Color("#FFFFFF")   // white   — values
  const C_FEST  = new Color("#FCD34D")   // amber   — festivals

  function addRow(label, value, opts = {}) {
    const row = new UITableRow()
    row.height = opts.tall ? 64 : 52

    if (opts.header) {
      row.backgroundColor = C_MAROON
      const cell = UITableCell.text(label, value)
      cell.titleFont    = Font.boldSystemFont(opts.titleSize || 26)
      cell.subtitleFont = Font.systemFont(13)
      cell.titleColor    = C_SAFFRON
      cell.subtitleColor = new Color("#FFFFFF", 0.7)
      cell.leftAligned()
      row.addCell(cell)
    } else {
      const lc = UITableCell.text(label)
      lc.titleFont  = Font.systemFont(13)
      lc.titleColor = opts.labelColor || C_LABEL
      lc.leftAligned()
      lc.widthWeight = 35

      const vc = UITableCell.text(value)
      vc.titleFont  = opts.valueFont || Font.systemFont(16)
      vc.titleColor = opts.valueColor || C_VALUE
      vc.rightAligned()
      vc.widthWeight = 65

      row.addCell(lc)
      row.addCell(vc)
    }

    table.addRow(row)
  }

  // Header
  const headerTitle = mode === "lunar"
    ? tithiLine(day)
    : `${toOdia(day.odiaDate)} ${day.odiaMonth}`
  addRow(headerTitle, enDate(day.date),
    { header: true, titleSize: 26, tall: true })

  // Festivals (if any)
  if (day.festivals?.length) {
    for (const f of day.festivals) {
      addRow("🎉", f, { valueFont: Font.boldSystemFont(14), valueColor: C_FEST })
    }
  }

  // Panchanga
  addRow("ତିଥି",    tithiLine(day))
  addRow("ନକ୍ଷତ୍ର", day.nakshatra)
  addRow("ଯୋଗ",    day.yoga)
  addRow("କରଣ",    day.karana)

  // Times
  addRow("ସୂର୍ଯ୍ୟୋଦୟ", day.sunrise)
  addRow("ସୂର୍ଯ୍ୟାସ୍ତ",  day.sunset)
  addRow("ରାହୁ କାଳ",
    `${day.rahuStart} – ${day.rahuEnd}`,
    { valueFont: Font.boldSystemFont(15), valueColor: new Color("#DC2626") })

  await table.present(false)
}

// ── Widget ────────────────────────────────────────────────────────────────────
function makeGradient() {
  const g = new LinearGradient()
  g.colors    = [C_MAROON, C_DARK_MAROON]
  g.locations = [0, 1]
  g.startPoint = new Point(0, 0)
  g.endPoint   = new Point(1, 1)
  return g
}

function txt(parent, text, font, color, lines = 1) {
  const t = parent.addText(text)
  t.font      = font
  t.textColor = color
  t.lineLimit = lines
  t.minimumScaleFactor = 0.7
  return t
}

async function buildWidget(day, family, mode) {
  const w = new ListWidget()
  w.backgroundGradient = makeGradient()
  // Tap opens this script → shows detail table
  w.url = `scriptable:///run?scriptName=${encodeURIComponent(Script.name())}&mode=${mode}`
  w.setPadding(14, 14, 14, 14)

  if (!day) {
    txt(w, "ତ୍ରୁଟି", Font.systemFont(14), C_WHITE)
    return w
  }

  if (family === "small") {
    if (mode === "lunar") {
      txt(w, tithiLabel(day), Font.boldSystemFont(44), C_SAFFRON)
      txt(w, tithiLine(day), Font.boldSystemFont(14), C_WHITE, 2)
      w.addSpacer(4)
      txt(w, enDate(day.date), Font.systemFont(10), C_MUTED)
      w.addSpacer(6)
      txt(w, day.nakshatra, Font.systemFont(11), C_WHITE)
    } else {
      txt(w, toOdia(day.odiaDate), Font.boldSystemFont(44), C_SAFFRON)
      txt(w, day.odiaMonth, Font.boldSystemFont(14), C_WHITE)
      w.addSpacer(4)
      txt(w, enDate(day.date), Font.systemFont(10), C_MUTED)
      w.addSpacer(6)
      txt(w, tithiLine(day), Font.systemFont(11), C_WHITE, 2)
    }

  } else if (family === "medium") {
    const row = w.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()

    const left = row.addStack()
    left.layoutVertically()
    if (mode === "lunar") {
      txt(left, tithiLabel(day), Font.boldSystemFont(50), C_SAFFRON)
      txt(left, tithiLine(day), Font.boldSystemFont(13), C_WHITE, 2)
      txt(left, enDate(day.date), Font.systemFont(10), C_MUTED)
    } else {
      txt(left, toOdia(day.odiaDate), Font.boldSystemFont(50), C_SAFFRON)
      txt(left, day.odiaMonth, Font.boldSystemFont(13), C_WHITE)
      txt(left, enDate(day.date), Font.systemFont(10), C_MUTED)
    }

    row.addSpacer()

    const right = row.addStack()
    right.layoutVertically()
    right.spacing = 5
    for (const [lbl, val] of [
      ["ତିଥି",    tithiLine(day)],
      ["ନକ୍ଷତ୍ର", day.nakshatra],
      ["ଯୋଗ",    day.yoga],
    ]) {
      const r = right.addStack()
      r.layoutHorizontally()
      r.spacing = 4
      txt(r, lbl, Font.systemFont(10), C_DIM)
      r.addSpacer()
      txt(r, val, Font.systemFont(12), C_WHITE)
    }

    w.addSpacer()
    const bot = w.addStack()
    bot.layoutHorizontally()
    bot.spacing = 6
    txt(bot, `☀ ${day.sunrise}`, Font.systemFont(10), C_MUTED)
    bot.addSpacer()
    txt(bot, `🌅 ${day.sunset}`, Font.systemFont(10), C_MUTED)
    bot.addSpacer()
    txt(bot, `⚠ ${day.rahuStart}–${day.rahuEnd}`, Font.systemFont(10), C_RAHU)

  } else {
    // large
    if (mode === "lunar") {
      txt(w, tithiLine(day), Font.boldSystemFont(28), C_SAFFRON, 2)
    } else {
      txt(w, `${toOdia(day.odiaDate)} ${day.odiaMonth}`, Font.boldSystemFont(32), C_SAFFRON)
    }
    txt(w, enDate(day.date), Font.systemFont(13), C_MUTED)
    w.addSpacer(10)

    for (const [lbl, val] of [
      ["ତିଥି",    tithiLine(day)],
      ["ନକ୍ଷତ୍ର", day.nakshatra],
      ["ଯୋଗ",    day.yoga],
      ["କରଣ",    day.karana],
    ]) {
      const r = w.addStack()
      r.layoutHorizontally()
      txt(r, lbl, Font.systemFont(12), C_DIM)
      r.addSpacer()
      txt(r, val, Font.systemFont(14), C_WHITE)
      w.addSpacer(4)
    }

    w.addSpacer(8)
    const times = w.addStack()
    times.layoutHorizontally()
    txt(times, `☀ ${day.sunrise}`, Font.systemFont(12), C_MUTED)
    times.addSpacer()
    txt(times, `🌅 ${day.sunset}`, Font.systemFont(12), C_MUTED)

    w.addSpacer(6)
    const rahu = w.addStack()
    rahu.layoutHorizontally()
    rahu.backgroundColor = new Color("#FF000020")
    rahu.cornerRadius = 6
    rahu.setPadding(6, 8, 6, 8)
    txt(rahu, "ରାହୁ କାଳ", Font.systemFont(12), C_RAHU)
    rahu.addSpacer()
    txt(rahu, `${day.rahuStart} – ${day.rahuEnd}`, Font.boldSystemFont(12), C_RAHU)
  }

  return w
}

// ── Entry point ───────────────────────────────────────────────────────────────
const day = await getToday()

// Widget parameter: set to "lunar" in Edit Widget → Parameter to show tithi view.
// When tapped, the mode is passed via URL query param so the detail screen matches.
const modeSource = args.widgetParameter ?? args.queryParameters?.mode ?? ""
const MODE = modeSource.toLowerCase() === "lunar" ? "lunar" : "solar"

if (config.runsInWidget) {
  // Rendering on home screen
  const family = config.widgetFamily ?? "medium"
  const widget = await buildWidget(day, family, MODE)
  Script.setWidget(widget)

} else {
  // Opened via tap (or manual run in Scriptable app) → show detail
  await showDetail(day, MODE)
}

Script.complete()
