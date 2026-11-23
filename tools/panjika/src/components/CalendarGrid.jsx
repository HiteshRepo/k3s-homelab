import { toOdiaNum, toEnShortDate, toTithiLabel } from '../utils/odia';

const WEEKDAY_HEADERS = ['ରବି', 'ସୋମ', 'ମଙ୍ଗ', 'ବୁଧ', 'ଗୁ', 'ଶୁ', 'ଶନି'];
const TODAY = new Date().toISOString().slice(0, 10);

function cellClass(day, selected) {
  const cls = ['day-cell'];
  if (selected?.date === day.date) cls.push('selected');
  if (day.date === TODAY) cls.push('today');
  if (day.festivals?.length) cls.push('festival');
  if (day.tithiIndex === 14) cls.push('purnima');
  if (day.tithiIndex === 29) cls.push('amavasya');
  return cls.join(' ');
}

export default function CalendarGrid({ days, selected, onSelect, mode = 'solar' }) {
  if (!days.length) return null;

  // Python weekday: Mon=0…Sun=6. Grid is Sun-first (col 0 = Sun).
  const startCol = (days[0].weekday + 1) % 7;
  const cells = Array(startCol).fill(null).concat(days);

  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <div className="calendar-grid" role="grid">
      <div className="weekday-row" role="row">
        {WEEKDAY_HEADERS.map(w => (
          <div key={w} className="weekday-header" role="columnheader">{w}</div>
        ))}
      </div>

      {rows.map((row, ri) => (
        <div key={ri} className="week-row" role="row">
          {Array(7).fill(null).map((_, ci) => {
            const day = row[ci] ?? null;
            return day ? (
              <div
                key={day.date}
                className={cellClass(day, selected)}
                onClick={() => onSelect(day)}
                onKeyDown={e => e.key === 'Enter' && onSelect(day)}
                role="gridcell"
                tabIndex={0}
                aria-label={`${toEnShortDate(day.date)}, ${day.odiaDate} ${day.odiaMonth}`}
                aria-selected={selected?.date === day.date}
              >
                {mode === 'lunar' ? (
                  <>
                    <div className="cell-tithi-label">{toTithiLabel(day.tithiIndex)}</div>
                    <div className="cell-en-date">{toEnShortDate(day.date)}</div>
                  </>
                ) : (
                  <>
                    <div className="cell-odia-date">{toOdiaNum(day.odiaDate)}</div>
                    <div className="cell-en-date">{toEnShortDate(day.date)}</div>
                  </>
                )}
                {day.festivals?.length > 0 && (
                  <div className="cell-dot" aria-hidden="true" />
                )}
              </div>
            ) : (
              <div key={`e-${ri}-${ci}`} className="day-cell empty" role="gridcell" />
            );
          })}
        </div>
      ))}
    </div>
  );
}
