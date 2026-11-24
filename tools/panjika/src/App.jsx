import { useState, useMemo } from 'react';
import data2026 from './data/panchanga_2026.json';
import data2027 from './data/panchanga_2027.json';
import festivalsJagannatha from './data/festivals_jagannatha.json';
import festivalsBiraja from './data/festivals_biraja.json';
import CalendarGrid from './components/CalendarGrid';
import DayDetail from './components/DayDetail';
import { toEnShortDate } from './utils/odia';

const OVERLAYS = {
  generic: {},
  jagannatha: festivalsJagannatha,
  biraja: festivalsBiraja,
};

const PANJI_OPTIONS = [
  { key: 'generic',     odia: 'ସାଧାରଣ',   en: 'Generic'     },
  { key: 'jagannatha',  odia: 'ଜଗନ୍ନାଥ',   en: 'Jagannatha'  },
  { key: 'biraja',      odia: 'ବିରଜା',      en: 'Biraja'      },
];

const ALL_DAYS = [...data2026.days, ...data2027.days].sort((a, b) =>
  a.date.localeCompare(b.date),
);

function buildMonthGroups(allDays) {
  const groups = [];
  let current = null;
  for (const day of allDays) {
    if (!current || day.odiaMonthIndex !== current.odiaMonthIndex) {
      current = { odiaMonthIndex: day.odiaMonthIndex, odiaMonth: day.odiaMonth, days: [] };
      groups.push(current);
    }
    current.days.push(day);
  }
  return groups;
}

// Purnimanta: new month starts the day after Purnima (Shukla→Krishna transition).
// Named by the solar month of its Amavasya (new moon), which falls squarely in
// the same-named solar month in almost all cases — more reliable than using the
// starting day, which can be the last day of the previous solar month.
function buildLunarMonthGroups(allDays) {
  const groups = [];
  let current = null;
  let prevTithi = -1;
  for (const day of allDays) {
    // Boundary: Shukla→Krishna transition handles normal, kshaya K1, kshaya Purnima.
    // Purnima spanning two civil days (both 14): 14>=15 is false, no spurious split.
    if (!current || (prevTithi < 15 && day.tithiIndex >= 15)) {
      // Initial name from starting day; overwritten when Amavasya is seen.
      current = { odiaMonthIndex: day.odiaMonthIndex, odiaMonth: day.odiaMonth, days: [] };
      groups.push(current);
    }
    current.days.push(day);
    // Update group name to the solar month of its Amavasya (the definitive name).
    if (day.tithiIndex === 29) {
      current.odiaMonthIndex = day.odiaMonthIndex;
      current.odiaMonth = day.odiaMonth;
    }
    prevTithi = day.tithiIndex;
  }
  return groups;
}

const MONTH_GROUPS = buildMonthGroups(ALL_DAYS);
const LUNAR_MONTH_GROUPS = buildLunarMonthGroups(ALL_DAYS);

function initialGroupIdx(groups = MONTH_GROUPS) {
  const today = new Date().toISOString().slice(0, 10);
  const idx = groups.findIndex(g => g.days.some(d => d.date === today));
  return idx >= 0 ? idx : groups.findIndex(
    g => g.odiaMonthIndex === 0 && g.days[0].date.startsWith('2027'),
  );
}

export default function App() {
  const [calMode, setCalMode] = useState('solar');
  const [solarIdx, setSolarIdx] = useState(() => initialGroupIdx(MONTH_GROUPS));
  const [lunarIdx, setLunarIdx] = useState(() => initialGroupIdx(LUNAR_MONTH_GROUPS));
  const [selected, setSelected] = useState(null);
  const [panji, setPanji] = useState('generic');

  const groups = calMode === 'solar' ? MONTH_GROUPS : LUNAR_MONTH_GROUPS;
  const groupIdx = calMode === 'solar' ? solarIdx : lunarIdx;
  const setGroupIdx = calMode === 'solar' ? setSolarIdx : setLunarIdx;

  const group = groups[groupIdx];
  const firstDay = group.days[0];
  const lastDay = group.days[group.days.length - 1];
  const rangeLabel = `${toEnShortDate(firstDay.date)} – ${toEnShortDate(lastDay.date)}, ${lastDay.date.slice(0, 4)}`;

  const overlaidDays = useMemo(() => {
    const ov = OVERLAYS[panji];
    if (!Object.keys(ov).length) return group.days;
    return group.days.map(day => {
      const extra = ov[day.date];
      if (!extra?.length) return day;
      return { ...day, festivals: [...(day.festivals ?? []), ...extra] };
    });
  }, [group.days, panji]);

  const overlaidSelected = useMemo(() => {
    if (!selected) return null;
    return overlaidDays.find(d => d.date === selected.date) ?? selected;
  }, [selected, overlaidDays]);

  function prev() { setGroupIdx(i => Math.max(0, i - 1)); setSelected(null); }
  function next() { setGroupIdx(i => Math.min(groups.length - 1, i + 1)); setSelected(null); }

  function toggleCalMode(mode) {
    setCalMode(mode);
    setSelected(null);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-title">
          <span className="title-odia">ଓଡ଼ିଆ ପଞ୍ଜିକା</span>
        </div>
        <div className="header-sub">ସୂର୍ଯ୍ୟ ସିଦ୍ଧାନ୍ତ · Lahiri Ayanamsa</div>
        <div className="header-controls">
          <div className="cal-mode-toggle" role="group" aria-label="Calendar mode">
            <button
              className={`mode-btn${calMode === 'solar' ? ' active' : ''}`}
              onClick={() => toggleCalMode('solar')}
              aria-pressed={calMode === 'solar'}
            >☀ ସୌର</button>
            <button
              className={`mode-btn${calMode === 'lunar' ? ' active' : ''}`}
              onClick={() => toggleCalMode('lunar')}
              aria-pressed={calMode === 'lunar'}
            >☽ ଚାନ୍ଦ୍ର</button>
          </div>
          <div className="panji-selector" role="group" aria-label="Panji tradition">
            {PANJI_OPTIONS.map(opt => (
              <button
                key={opt.key}
                className={`panji-btn${panji === opt.key ? ' active' : ''}`}
                onClick={() => setPanji(opt.key)}
                aria-pressed={panji === opt.key}
              >
                <span className="panji-odia">{opt.odia}</span>
                <span className="panji-en">{opt.en}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="app-body">
        <div className="calendar-pane">
          <nav className="month-nav" aria-label="Month navigation">
            <button className="nav-btn" onClick={prev} disabled={groupIdx === 0} aria-label="Previous month">‹</button>
            <div className="month-label">
              <div className="month-odia-main">{group.odiaMonth}</div>
              <div className="month-en-range">{rangeLabel}</div>
            </div>
            <button className="nav-btn" onClick={next} disabled={groupIdx === MONTH_GROUPS.length - 1} aria-label="Next month">›</button>
          </nav>

          <CalendarGrid days={overlaidDays} selected={overlaidSelected} onSelect={setSelected} mode={calMode} />
        </div>

        {overlaidSelected && (
          <aside className="detail-pane">
            <DayDetail day={overlaidSelected} onClose={() => setSelected(null)} />
          </aside>
        )}
      </div>

      <footer className="app-footer">
        <span>ନିରାୟଣ ପଦ୍ଧତି · Nirayana System</span>
      </footer>
    </div>
  );
}
