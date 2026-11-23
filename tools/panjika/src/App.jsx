import { useState, useMemo } from 'react';
import data2026 from './data/panchanga_2026.json';
import data2027 from './data/panchanga_2027.json';
import CalendarGrid from './components/CalendarGrid';
import DayDetail from './components/DayDetail';
import { toEnShortDate } from './utils/odia';

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

const MONTH_GROUPS = buildMonthGroups(ALL_DAYS);

function initialGroupIdx() {
  const today = new Date().toISOString().slice(0, 10);
  const idx = MONTH_GROUPS.findIndex(g => g.days.some(d => d.date === today));
  // Fall back to Baishakha 2027 if today is outside both years
  return idx >= 0 ? idx : MONTH_GROUPS.findIndex(
    g => g.odiaMonthIndex === 0 && g.days[0].date.startsWith('2027'),
  );
}

export default function App() {
  const [groupIdx, setGroupIdx] = useState(initialGroupIdx);
  const [selected, setSelected] = useState(null);

  const group = MONTH_GROUPS[groupIdx];
  const firstDay = group.days[0];
  const lastDay = group.days[group.days.length - 1];
  const rangeLabel = `${toEnShortDate(firstDay.date)} – ${toEnShortDate(lastDay.date)}, ${lastDay.date.slice(0, 4)}`;

  function prev() { setGroupIdx(i => Math.max(0, i - 1)); setSelected(null); }
  function next() { setGroupIdx(i => Math.min(MONTH_GROUPS.length - 1, i + 1)); setSelected(null); }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-title">
          <span className="title-odia">ଓଡ଼ିଆ ପଞ୍ଜିକା</span>
        </div>
        <div className="header-sub">ସୂର୍ଯ୍ୟ ସିଦ୍ଧାନ୍ତ · Lahiri Ayanamsa</div>
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

          <CalendarGrid days={group.days} selected={selected} onSelect={setSelected} />
        </div>

        {selected && (
          <aside className="detail-pane">
            <DayDetail day={selected} onClose={() => setSelected(null)} />
          </aside>
        )}
      </div>

      <footer className="app-footer">
        <span>ନିରାୟଣ ପଦ୍ଧତି · Nirayana System</span>
      </footer>
    </div>
  );
}
