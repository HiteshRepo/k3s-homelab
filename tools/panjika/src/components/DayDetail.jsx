import { toOdiaNum } from '../utils/odia';

const WEEKDAY_ODIA = [
  'ରବିବାର', 'ସୋମବାର', 'ମଙ୍ଗଳବାର', 'ବୁଧବାର',
  'ଗୁରୁବାର', 'ଶୁକ୍ରବାର', 'ଶନିବାର',
];
const MONTHS_EN = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function DayDetail({ day, onClose, mode = 'solar' }) {
  const [y, m, d] = day.date.split('-').map(Number);
  const weekdayOdia = WEEKDAY_ODIA[(day.weekday + 1) % 7];
  const tithiDisplay = day.paksha ? `${day.paksha}. ${day.tithi}` : day.tithi;

  return (
    <div className="day-detail" role="complementary" aria-label="Day detail">
      <button className="detail-close" onClick={onClose} aria-label="Close detail">✕</button>

      <div className="detail-date-block">
        <div className="detail-odia-date">
          {mode === 'lunar' ? tithiDisplay : `${toOdiaNum(day.odiaDate)} ${day.odiaMonth}`}
        </div>
        <div className="detail-en-date">{MONTHS_EN[m]} {d}, {y}</div>
        <div className="detail-weekday">{weekdayOdia}</div>
      </div>

      {day.festivals?.length > 0 && (
        <div className="detail-festivals">
          {day.festivals.map((name, i) => (
            <div key={i} className="festival-badge">
              <span className="festival-name">{name}</span>
              {day.festivalDescs?.[i] && (
                <span className="festival-desc">{day.festivalDescs[i]}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="detail-panchanga">
        <PanchaRow label="ତିଥି" value={tithiDisplay} />
        <PanchaRow label="ନକ୍ଷତ୍ର" value={day.nakshatra} />
        <PanchaRow label="ଯୋଗ" value={day.yoga} />
        <PanchaRow label="କରଣ" value={day.karana} />
      </div>

      <div className="detail-times">
        <TimeBlock icon="☀" label="ସୂର୍ଯ୍ୟୋଦୟ" time={day.sunrise} />
        <TimeBlock icon="🌅" label="ସୂର୍ଯ୍ୟାସ୍ତ" time={day.sunset} />
      </div>

      <div className="detail-rahu">
        <span className="rahu-label">ରାହୁ କାଳ</span>
        <span className="rahu-time">{day.rahuStart} – {day.rahuEnd}</span>
      </div>
    </div>
  );
}

function PanchaRow({ label, value }) {
  return (
    <div className="panchanga-row">
      <span className="p-label">{label}</span>
      <span className="p-value">{value}</span>
    </div>
  );
}

function TimeBlock({ icon, label, time }) {
  return (
    <div className="time-block">
      <span className="time-icon" aria-hidden="true">{icon}</span>
      <span className="time-label">{label}</span>
      <span className="time-val">{time}</span>
    </div>
  );
}
