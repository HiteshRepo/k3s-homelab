# Odia Panjika — ଓଡ଼ିଆ ପଞ୍ଜିକା

A lunisolar calendar for 2026–2027 based on the traditional Odia Panjika system.

---

## How the calendar is generated

**Start with a place and a year.**
Puri, Odisha. 2026–2027. That's the anchor.

**For every single day:**

1. **Find sunrise** — astronomy library (`ephem`) calculates the exact moment the sun crosses the horizon at Puri's coordinates. This is the reference moment for everything else that day.

2. **Where is the Sun? → Solar month** — measure the sun's angle around the ecliptic (0°–360°). Subtract the Lahiri Ayanamsa (~24.1°) to shift from Western tropical to Indian sidereal zodiac. Divide by 30. That gives the sign (0–11) → the Odia solar month name.

3. **How far is the Moon from the Sun? → Tithi** — Moon's sidereal longitude minus Sun's sidereal longitude = a gap in degrees. Divide by 12. That gives the tithi number (0–29). Whatever tithi is active *at sunrise* is "today's tithi."

4. **Write one JSON record per day** — date, solar month, tithi, sunrise, sunset, weekday, Rahu Kala. Repeat 730 times.

**Then build the UI:**

5. **Load the JSON** — React loads both year files and merges into one flat list.

6. **Group into months** — solar mode groups by Sankranti; lunar mode groups by the day after Purnima (named by the Amavasya's solar month).

7. **Apply festival overlay** — user picks a tradition (Generic / Jagannatha / Biraja). A hand-researched JSON maps dates to festival names, merged on top of the base panchanga.

8. **Render** — month grid. Click a day to see full panchanga details.

```
ephem (astronomy)
    ↓
generate/panchanga.py → src/data/panchanga_2026.json
                      → src/data/panchanga_2027.json
    ↓
generate/festivals.py → src/data/festivals_jagannatha.json
                      → src/data/festivals_biraja.json
    ↓
React app (src/) — groups, overlays, renders
```

---

## Key concepts

### Solar month (Saura Masa)

The sun takes ~365 days to complete one full revolution of the ecliptic (360°). That journey is divided into 12 zodiac signs of 30° each. The moment the sun crosses into a new sign is called a **Sankranti**. The period from one Sankranti to the next is one solar month.

The 12 Odia solar months and their zodiac signs:

| Odia Month | Zodiac (Rashi) | Approx. Gregorian |
|---|---|---|
| ବୈଶାଖ Baishakha | Mesha (Aries) | Apr 14 – May 14 |
| ଜ୍ୟେଷ୍ଠ Jyeshtha | Vrishabha (Taurus) | May 15 – Jun 14 |
| ଆଷାଢ଼ Ashadha | Mithuna (Gemini) | Jun 15 – Jul 16 |
| ଶ୍ରାବଣ Sravana | Karka (Cancer) | Jul 17 – Aug 16 |
| ଭାଦ୍ରବ Bhadrava | Simha (Leo) | Aug 17 – Sep 16 |
| ଆଶ୍ୱିନ Ashwina | Kanya (Virgo) | Sep 17 – Oct 17 |
| କାର୍ତ୍ତିକ Kartika | Tula (Libra) | Oct 18 – Nov 16 |
| ମାର୍ଗଶୀର Margashira | Vrishchika (Scorpio) | Nov 17 – Dec 15 |
| ପୌଷ Pousha | Dhanu (Sagittarius) | Dec 16 – Jan 13 |
| ମାଘ Magha | Makara (Capricorn) | Jan 14 – Feb 12 |
| ଫାଲ୍ଗୁନ Phalguna | Kumbha (Aquarius) | Feb 13 – Mar 14 |
| ଚୈତ୍ର Chaitra | Meena (Pisces) | Mar 15 – Apr 13 |

Solar months are unequal in length (29–32 days) because Earth's orbit around the sun is elliptical — the sun appears to move faster when Earth is closer to it.

### Tithi (lunar day)

The Moon orbits Earth faster than the Sun moves through the zodiac. Each day the Moon pulls ~12° further ahead of the Sun. That 12° arc is one **tithi**.

```
Tithi number = floor((Moon longitude − Sun longitude) / 12°)
```

There are 30 tithis in a lunar month:

- **Shukla Paksha (bright fortnight)** — Shukla 1 through Purnima (Full Moon): Moon grows from new to full (gap 0°–180°)
- **Krishna Paksha (dark fortnight)** — Krishna 1 through Amavasya (New Moon): Moon shrinks from full to new (gap 180°–360°)

The **sunrise rule**: whatever tithi is active at the moment of sunrise is recorded as that day's tithi. This is what the panchanga stores.

### Kshaya Tithi (skipped lunar day)

A tithi lasts ~23.5 to ~26.5 hours depending on the Moon's orbital speed (the Moon speeds up when closer to Earth). When a tithi is very short, it can start *and end* between two consecutive sunrises. Neither day "sees" it at sunrise — the panchanga jumps from tithi N-1 to tithi N+1. That skipped tithi is called a **kshaya tithi** (Sanskrit: *kshaya* = decay/loss).

This calendar handles two kinds:
- **Kshaya Krishna Pratipada** — the first day of the dark fortnight is skipped; the panchanga goes straight from Purnima (14) to Krishna 2 (16)
- **Kshaya Purnima** — the full moon tithi itself is skipped; the panchanga goes from Chaturdashi (13) to Krishna 1 (15)

Both are detected by the boundary trigger `prevTithi < 15 && day.tithiIndex >= 15`.

### Tropical vs Sidereal zodiac (Ayanamsa)

There are two ways to measure the Sun's position:

- **Tropical zodiac** (Western astrology): 0° Aries = March equinox. Tied to Earth's seasons.
- **Sidereal zodiac** (Indian astronomy): 0° Aries = the actual star background (Ashwini nakshatra). Tied to the fixed stars.

Due to **precession of the equinoxes** (a slow wobble in Earth's axis completing one cycle every ~26,000 years), the two zodiacs have drifted apart by about 24° since the system was established ~2000 years ago. That drift is called the **Ayanamsa**.

The Odia Panjika uses the **Lahiri Ayanamsa** (~24.1° in 2026), the standard adopted by the Government of India's National Calendar. The script subtracts this value from the Sun's tropical longitude before computing the solar month:

```python
sidereal_lon = tropical_lon - ayanamsa  # ~24.1°
month_index = int(sidereal_lon / 30)
```

### Purnimanta vs Amanta lunar months

There are two systems for defining where a lunar month begins:

- **Amanta** (South India): month starts at Shukla Pratipada (day after Amavasya/New Moon) and ends at Amavasya. The new moon is the boundary.
- **Purnimanta** (North and East India, including Odisha): month starts at Krishna Pratipada (day after Purnima/Full Moon) and ends at Purnima. The full moon is the boundary.

The Odia Panjika uses **Purnimanta**. This is why Margashira starts on Nov 25, 2026 (the day after Kartika Purnima) even though the solar month of Margashira starts Nov 16.

Lunar months are named by the solar month in which their **Amavasya** falls. The Amavasya (new moon) always falls squarely within the same-named solar month, making it the most reliable naming anchor.

### Adhika Masa (intercalary/leap month)

A solar year is ~365 days. Twelve lunar months are only ~354 days. The gap is ~11 days per year.

Left uncorrected, lunar festivals would drift through all seasons in ~32 years. The fix: approximately every 2–3 years, an **extra lunar month** (Adhika Masa) is inserted.

An Adhika Masa occurs when a solar month contains two Amavasyas — meaning two Purnimanta months both have their new moons within the same solar month. The first of the two shares the solar month's name but is prefixed "Adhika" (extra). The second is the regular "Nija" (real) month.

This resynchronises the lunar and solar calendars, keeping festivals in their correct seasons.

### Rahu Kala

An inauspicious period of ~90 minutes each day, calculated as a fixed fraction of daylight hours based on the weekday. Traditionally avoided for starting new ventures. Stored in the panchanga per day and shown in the detail panel.

---

## Festival traditions

The base panchanga (Generic) contains only astronomical data. Two tradition-specific overlays are available:

**Jagannatha** (`festivals_jagannatha.json`) — the Puri Jagannatha temple calendar. The most widely observed panjika across Odisha. Centers on Vaishnava festivals: Rath Yatra, Snana Purnima, Chandan Yatra, Jhulan Yatra, Navaratri, and the full cycle of Jagannatha's annual rituals. ~106 festival days.

**Biraja** (`festivals_biraja.json`) — the Jajpur Biraja temple calendar. Followed by Shakta households and families from the Jajpur region. Centers on the Goddess Biraja (one of the 51 Shakti Peethas): Mula Ashtami, Sunia Osha, Chandan Purnima, Lalita Panchami, and Navaratri Durgashtami. ~93 festival days.

Both overlays are keyed by `YYYY-MM-DD` and merged onto the base panchanga in the UI when that tradition is selected.

---

## Repository layout

```
tools/panjika/
├── generate/
│   ├── panchanga.py        # Astronomical calculations → JSON
│   ├── festivals.py        # Festival rules → overlay JSONs
│   └── requirements.txt    # ephem, pytz
├── src/
│   ├── data/
│   │   ├── panchanga_2026.json
│   │   ├── panchanga_2027.json
│   │   ├── festivals_jagannatha.json
│   │   └── festivals_biraja.json
│   ├── components/
│   │   ├── CalendarGrid.jsx
│   │   └── DayDetail.jsx
│   ├── utils/
│   │   └── odia.js         # Odia numeral conversion, tithi labels
│   ├── styles/
│   │   └── app.css
│   └── App.jsx             # Month grouping, solar/lunar toggle, festival overlay
├── Dockerfile
└── README.md
```

## Regenerating the data

```bash
cd generate
pip install -r requirements.txt
python panchanga.py        # writes src/data/panchanga_2026.json + panchanga_2027.json
python festivals.py        # writes src/data/festivals_jagannatha.json + festivals_biraja.json
```

## Running locally

```bash
npm install
npm run dev
```
