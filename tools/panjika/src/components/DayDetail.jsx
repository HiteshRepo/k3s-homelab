import { useState } from 'react';
import { toOdiaNum } from '../utils/odia';

const WEEKDAY_ODIA = [
  'ରବିବାର', 'ସୋମବାର', 'ମଙ୍ଗଳବାର', 'ବୁଧବାର',
  'ଗୁରୁବାର', 'ଶୁକ୍ରବାର', 'ଶନିବାର',
];
const MONTHS_EN = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const RAHU_PART = [2, 7, 5, 6, 4, 3, 8]; // Mon=0…Sun=6

function parseMinutes(t) {
  const [h, min] = t.split(':').map(Number);
  return h * 60 + min;
}

function addMinutes(base, mins) {
  const total = base + mins;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function DayDetail({ day, onClose, mode = 'solar' }) {
  const [showMath, setShowMath] = useState(false);
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

      {day.sunLon != null && (
        <div className="detail-math">
          <button
            className="math-toggle"
            onClick={() => setShowMath(v => !v)}
            aria-expanded={showMath}
          >
            {showMath ? '▾' : '▸'} ଗଣନା ଦେଖନ୍ତୁ
          </button>

          {showMath && (
            <div className="math-body">
              <MathRow icon="📍">
                Bhubaneswar · 20.3°N 85.8°E · Lahiri ayanamsa {day.ayanamsa}°
              </MathRow>

              <MathRow icon="☀">
                Sun has traveled {day.sunLon}° of its annual circuit.{' '}
                {day.sunLon.toFixed(0)}° ÷ 30° per sign = sign {Math.floor(day.sunLon / 30) + 1} of 12 → solar month <strong>{day.odiaMonth}</strong>.
              </MathRow>

              <MathRow icon="☽">
                Moon is <strong>{day.elongation}°</strong> ahead of Sun at sunrise ({day.sunrise}).{' '}
                Moon at {day.moonLon}°, Sun at {day.sunLon}°.{' '}
                {day.elongation.toFixed(1)}° ÷ 12° per tithi = {(day.elongation / 12).toFixed(1)} → tithi {day.tithiIndex + 1} → <strong>{day.tithi}</strong>.{' '}
                Moon moves ~13°/day — this snapshot is locked at sunrise.
              </MathRow>

              <MathRow icon="✦">
                Moon at {day.moonLon}° ÷ 13.3° per nakshatra = {(day.moonLon / (360 / 27)).toFixed(1)} → nakshatra {Math.floor(day.moonLon / (360 / 27)) % 27 + 1} of 27 → <strong>{day.nakshatra}</strong>.{' '}
                27 nakshatras × 13°20′ = 360°.
              </MathRow>

              {(() => {
                const srMin = parseMinutes(day.sunrise);
                const ssMin = parseMinutes(day.sunset);
                const seg = Math.round((ssMin - srMin) / 8);
                const part = RAHU_PART[day.weekday % 7];
                const start = addMinutes(srMin, seg * (part - 1));
                const end   = addMinutes(srMin, seg * part);
                return (
                  <MathRow icon="🌅">
                    Daylight: {day.sunrise}–{day.sunset} = {ssMin - srMin} min ÷ 8 segments = {seg} min each.{' '}
                    Weekday slot {part} → Rahu Kala <strong>{start}–{end}</strong>.{' '}
                    Location sets sunrise/sunset; weekday sets the slot.
                  </MathRow>
                );
              })()}
            </div>
          )}
        </div>
      )}
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

function MathRow({ icon, children }) {
  return (
    <div className="math-row">
      <span className="math-icon" aria-hidden="true">{icon}</span>
      <span className="math-text">{children}</span>
    </div>
  );
}
