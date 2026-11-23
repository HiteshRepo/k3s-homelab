#!/usr/bin/env python3
"""
Odia Panjika 2027 generator.
Outputs src/data/panchanga_2027.json relative to this script's parent directory.
Location: Bhubaneswar, Odisha (20.2961°N, 85.8245°E)
"""

import json
import pathlib
import sys
import zoneinfo
from datetime import date, timedelta

import swisseph as swe
from astral import LocationInfo
from astral.sun import sunrise as astral_sunrise, sunset as astral_sunset

# ── constants ────────────────────────────────────────────────────────────────

LAT = 20.2961
LON = 85.8245
IST = zoneinfo.ZoneInfo("Asia/Kolkata")
LOCATION = LocationInfo("Bhubaneswar", "India", "Asia/Kolkata", LAT, LON)

ODIA_MONTHS = [
    "ବୈଶାଖ",    # 0  Mesha   (Aries)
    "ଜ୍ୟେଷ୍ଠ",   # 1  Vrishabha
    "ଆଷାଢ଼",    # 2  Mithuna
    "ଶ୍ରାବଣ",   # 3  Karka
    "ଭାଦ୍ରବ",   # 4  Simha
    "ଆଶ୍ୱିନ",   # 5  Kanya
    "କାର୍ତ୍ତିକ", # 6  Tula
    "ମାର୍ଗଶୀର", # 7  Vrischika
    "ପୌଷ",      # 8  Dhanu
    "ମାଘ",      # 9  Makara
    "ଫାଲ୍ଗୁନ",  # 10 Kumbha
    "ଚୈତ୍ର",    # 11 Meena
]

TITHIS = [
    "ପ୍ରଥମା", "ଦ୍ୱିତୀୟା", "ତୃତୀୟା", "ଚତୁର୍ଥୀ", "ପଞ୍ଚମୀ",
    "ଷଷ୍ଠୀ", "ସପ୍ତମୀ", "ଅଷ୍ଟମୀ", "ନବମୀ", "ଦଶମୀ",
    "ଏକାଦଶୀ", "ଦ୍ୱାଦଶୀ", "ତ୍ରୟୋଦଶୀ", "ଚତୁର୍ଦ୍ଦଶୀ", "ପୂର୍ଣ୍ଣିମା",  # Shukla 0–14
    "ପ୍ରଥମା", "ଦ୍ୱିତୀୟା", "ତୃତୀୟା", "ଚତୁର୍ଥୀ", "ପଞ୍ଚମୀ",
    "ଷଷ୍ଠୀ", "ସପ୍ତମୀ", "ଅଷ୍ଟମୀ", "ନବମୀ", "ଦଶମୀ",
    "ଏକାଦଶୀ", "ଦ୍ୱାଦଶୀ", "ତ୍ରୟୋଦଶୀ", "ଚତୁର୍ଦ୍ଦଶୀ", "ଅମାବାସ୍ୟା",  # Krishna 15–29
]

PAKSHA = (["ଶୁ"] * 14 + [""] + ["କୃ"] * 14 + [""])

NAKSHATRAS = [
    "ଅଶ୍ୱିନୀ", "ଭରଣୀ", "କୃତ୍ତିକା", "ରୋହିଣୀ", "ମୃଗଶିର",
    "ଆର୍ଦ୍ରା", "ପୁନର୍ବସୁ", "ପୁଷ୍ୟ", "ଆଶ୍ଲେଷ", "ମଘା",
    "ପୂ.ଫାଲ୍ଗୁ", "ଉ.ଫାଲ୍ଗୁ", "ହସ୍ତ", "ଚିତ୍ରା", "ସ୍ୱାତୀ",
    "ବିଶାଖା", "ଅନୁରାଧା", "ଜ୍ୟେଷ୍ଠ", "ମୂଳ", "ପୂ.ଆଷାଢ଼",
    "ଉ.ଆଷାଢ଼", "ଶ୍ରବଣ", "ଧନିଷ୍ଠା", "ଶତଭିଷ", "ପୂ.ଭାଦ୍ର",
    "ଉ.ଭାଦ୍ର", "ରେବତୀ",
]

YOGAS = [
    "ବିଷ୍କମ୍ଭ", "ପ୍ରୀତି", "ଆୟୁଷ୍ମାନ", "ସୌଭାଗ୍ୟ", "ଶୋଭନ",
    "ଅତିଗଣ୍ଡ", "ସୁକର୍ମ", "ଧ୍ରୁତି", "ଶୂଳ", "ଗଣ୍ଡ",
    "ବୃଦ୍ଧି", "ଧ୍ରୁବ", "ବ୍ୟାଘାତ", "ହର୍ଷଣ", "ବଜ୍ର",
    "ସିଦ୍ଧି", "ବ୍ୟତୀପାତ", "ବରୀୟାନ", "ପରିଘ", "ଶିବ",
    "ସିଦ୍ଧ", "ସାଧ୍ୟ", "ଶୁଭ", "ଶୁକ୍ଳ", "ବ୍ରହ୍ମ",
    "ମାହେନ୍ଦ୍ର", "ବୈଧୃତି",
]

KARANAS = [
    "ବବ", "ବାଳବ", "କୌଳବ", "ତୈତିଳ", "ଗରଜ", "ବଣିଜ", "ବିଷ୍ଟି",
    "ଶକୁନି", "ଚତୁଷ୍ପଦ", "ନାଗ", "କିଂସ୍ତୁଘ୍ନ",
]

# Rahu Kalam part# by Python weekday (Mon=0 … Sun=6)
RAHU_PART = {0: 2, 1: 7, 2: 5, 3: 6, 4: 4, 5: 3, 6: 8}

# Sankranti festival names by odia_month_index (day 1 of that solar month)
SANKRANTI = {
    0:  ("ପଣ ସଂକ୍ରାନ୍ତି",    "Odia New Year — Sun enters sidereal Mesha"),
    1:  ("ବୃଷ ସଂକ୍ରାନ୍ତି",   "Sun enters Vrishabha"),
    2:  ("ମିଥୁନ ସଂକ୍ରାନ୍ତି", "Sun enters Mithuna — Raja festival begins"),
    3:  ("କର୍କ ସଂକ୍ରାନ୍ତି",  "Sun enters Karka"),
    4:  ("ସିଂହ ସଂକ୍ରାନ୍ତି",  "Sun enters Simha"),
    5:  ("କନ୍ୟା ସଂକ୍ରାନ୍ତି",  "Sun enters Kanya"),
    6:  ("ତୁଳ ସଂକ୍ରାନ୍ତି",   "Sun enters Tula"),
    7:  ("ବୃଶ୍ଚିକ ସଂକ୍ରାନ୍ତି","Sun enters Vrischika"),
    8:  ("ଧନୁ ସଂକ୍ରାନ୍ତି",   "Sun enters Dhanu"),
    9:  ("ମକର ସଂକ୍ରାନ୍ତି",   "Sun enters Makara — Pongal / auspicious bathing"),
    10: ("କୁମ୍ଭ ସଂକ୍ରାନ୍ତି",  "Sun enters Kumbha"),
    11: ("ମୀନ ସଂକ୍ରାନ୍ତି",   "Sun enters Meena"),
}

# Tithi-based festivals: (odia_month_index, tithi_index) → (name, desc)
TITHI_FESTS = {
    (9,  1):  ("ଶ୍ରୀ ପଞ୍ଚମୀ",      "Saraswati Puja — Maagha Shukla Panchami"),
    (11, 28): ("ମହାଶିବରାତ୍ରି",      "Night of Shiva — Phalguna Krishna Chaturdashi"),
    (11, 14): ("ଦୋଳ ଯାତ୍ରା",        "Holi / Dol Jatra — Phalguna Purnima"),
    (0,   8): ("ଶ୍ରୀ ରାମ ନବମୀ",     "Birthday of Lord Rama — Baishakha Shukla Navami"),
    (0,  14): ("ହନୁମାନ ଜୟନ୍ତୀ",    "Birthday of Lord Hanuman — Baishakha Purnima"),
    (2,   1): ("ରଥ ଯାତ୍ରା",         "Lord Jagannath's chariot festival — Ashadha Shukla Dwitiya"),
    (5,  14): ("କୁମାର ପୂର୍ଣ୍ଣିମା",  "Kumar Purnima — Ashvina Purnima, women's moon worship"),
    (6,  28): ("ନରକ ଚତୁର୍ଦ୍ଦଶୀ",   "Kartika Krishna Chaturdashi — Diwali eve"),
    (6,  29): ("ଦୀପାବଳି",            "Festival of lights — Kartika Amavasya"),
    (6,   0): ("ଗୋଵର୍ଦ୍ଧନ ପୂଜା",    "Kartika Shukla Prathama"),
    (6,   1): ("ଭାଇ ଦ୍ୱିତୀୟା",      "Kartika Shukla Dwitiya — siblings' bond"),
    (6,  14): ("କାର୍ତ୍ତିକ ପୂର୍ଣ୍ଣିମା", "Kartika Purnima — Boita Bandana"),
}

# Raja festival days relative to Mithuna Sankranti civil date offset (-1, 0, +1, +2)
RAJA_OFFSETS = {
    -1: ("ସଜ ବଢ଼ୁ",          "Raja Day 1 — Mithuna Sankranti eve"),
    0:  ("ମିଥୁନ ସଂକ୍ରାନ୍ତି / ରଜ", "Mithuna Sankranti — Raja Day 2"),
    1:  ("ଭୂ ଦାହ",            "Raja Day 3 — Bhu Daha"),
    2:  ("ବସୁ ମତ",            "Raja Day 4 — Vasumati bath"),
}

# ── Swiss Ephemeris setup ────────────────────────────────────────────────────

swe.set_ephe_path('')
swe.set_sid_mode(swe.SIDM_LAHIRI)
FLAGS = swe.FLG_MOSEPH | swe.FLG_SIDEREAL


def _jd(year: int, month: int, day: int, hour: float = 12.0) -> float:
    return swe.julday(year, month, day, hour)


def sun_lon(j: float) -> float:
    return swe.calc_ut(j, swe.SUN, FLAGS)[0][0]


def moon_lon(j: float) -> float:
    return swe.calc_ut(j, swe.MOON, FLAGS)[0][0]


def sign_of(lon: float) -> int:
    return int(lon / 30) % 12


def tithi_index(j: float) -> int:
    return int((moon_lon(j) - sun_lon(j)) % 360 / 12)


def nakshatra_index(j: float) -> int:
    return int(moon_lon(j) / (360 / 27)) % 27


def yoga_index(j: float) -> int:
    return int(((sun_lon(j) + moon_lon(j)) % 360) / (360 / 27)) % 27


def karana_index(j: float) -> int:
    k = int((moon_lon(j) - sun_lon(j)) % 360 / 6)
    if k == 0:
        return 10
    if 1 <= k <= 56:
        return (k - 1) % 7
    return {57: 7, 58: 8, 59: 9}[k]


def find_all_sign_entries(scan_start: float, scan_end: float) -> list:
    """Scan for all zodiac sign crossings (sidereal) between scan_start and scan_end JD."""
    entries = []
    j = scan_start
    prev_sign = sign_of(sun_lon(j))
    while j < scan_end:
        j += 1.0
        cur_sign = sign_of(sun_lon(j))
        if cur_sign != prev_sign:
            lo, hi = j - 1.0, j
            for _ in range(60):
                mid = (lo + hi) / 2
                sm = sign_of(sun_lon(mid))
                if sm != cur_sign:
                    lo = mid
                else:
                    hi = mid
            entries.append((cur_sign, (lo + hi) / 2))
        prev_sign = cur_sign
    return entries


def jd_to_ist_date(jd_val: float) -> date:
    """Convert a JD (UT) to IST civil date."""
    result = swe.revjul(jd_val)
    year, month = result[0], result[1]
    day_float = result[2]
    hour_ut = (day_float - int(day_float)) * 24
    day_int = int(day_float)
    hour_ist = hour_ut + 5.5
    if hour_ist >= 24:
        day_int += 1
        # Handle month overflow naively (swe.revjul gives exact year/month)
    return date(year, month, day_int)


def rahu_kalam(d: date, sr_dt, ss_dt) -> tuple:
    part_num = RAHU_PART[d.weekday()]
    total = (ss_dt - sr_dt).total_seconds()
    part = total / 8
    start = sr_dt + timedelta(seconds=(part_num - 1) * part)
    end = start + timedelta(seconds=part)
    return start.strftime("%H:%M"), end.strftime("%H:%M")


def get_sunrise_sunset(d: date):
    try:
        sr = astral_sunrise(LOCATION.observer, date=d, tzinfo=IST)
        ss = astral_sunset(LOCATION.observer, date=d, tzinfo=IST)
        return sr, ss
    except ValueError:
        prev, nxt = d - timedelta(days=1), d + timedelta(days=1)
        sr_p = astral_sunrise(LOCATION.observer, date=prev, tzinfo=IST)
        ss_p = astral_sunset(LOCATION.observer, date=prev, tzinfo=IST)
        sr_n = astral_sunrise(LOCATION.observer, date=nxt, tzinfo=IST)
        ss_n = astral_sunset(LOCATION.observer, date=nxt, tzinfo=IST)
        return (sr_p + (sr_n - sr_p) / 2, ss_p + (ss_n - ss_p) / 2)


# ── Main generation ──────────────────────────────────────────────────────────

def generate(year: int = 2027) -> dict:
    # 1. Find all zodiac sign entries in the year window (Nov prev yr → Feb next yr)
    print(f"Scanning sign crossings for {year}...", file=sys.stderr)
    scan_start = _jd(year - 1, 11, 1)
    scan_end = _jd(year + 1, 2, 1)
    all_entries = find_all_sign_entries(scan_start, scan_end)
    # Convert to (sign, jd, ist_date) sorted by jd
    sankrantis = sorted(
        [(sign, jd_val, jd_to_ist_date(jd_val)) for sign, jd_val in all_entries],
        key=lambda x: x[2],
    )
    for sign, jd_val, ist_dt in sankrantis:
        print(f"  {ODIA_MONTHS[sign]:12s} → {ist_dt} (JD {jd_val:.4f})", file=sys.stderr)

    # Find Mithuna (Ashadha) sankranti date for Raja
    mithuna_date = next(d for s, _, d in sankrantis if s == 2)

    output: dict = {"year": year, "location": "Bhubaneswar", "days": []}

    start_date = date(year, 1, 1)
    end_date = date(year, 12, 31)
    d = start_date

    while d <= end_date:
        # 2. Determine Odia solar month: most recent sankranti on or before today
        current = None
        for sign, jd_val, ist_dt in sankrantis:
            if ist_dt <= d:
                current = (sign, ist_dt)
        omi, sankranti_civil = current if current else (8, date(year - 1, 12, 16))
        odia_date = (d - sankranti_civil).days + 1

        # 3. Get sunrise/sunset
        sr_dt, ss_dt = get_sunrise_sunset(d)

        # 4. Panchanga at sunrise (JD in UT)
        ist_offset = 5.5 / 24.0
        sr_jd = swe.julday(d.year, d.month, d.day,
                           sr_dt.hour + sr_dt.minute / 60 + sr_dt.second / 3600) - ist_offset

        ti = tithi_index(sr_jd)
        ni = nakshatra_index(sr_jd)
        yi = yoga_index(sr_jd)
        ki = karana_index(sr_jd)

        # 5. Rahu Kalam
        rahu_start, rahu_end = rahu_kalam(d, sr_dt, ss_dt)

        # 6. Festivals
        festivals: list = []
        descs: list = []

        # Sankranti (day 1 of any Odia solar month)
        if odia_date == 1 and omi in SANKRANTI:
            fn, fd = SANKRANTI[omi]
            festivals.append(fn)
            descs.append(fd)

        # Tithi-based festivals
        if (omi, ti) in TITHI_FESTS:
            fn, fd = TITHI_FESTS[(omi, ti)]
            festivals.append(fn)
            descs.append(fd)

        # Raja (4-day festival around Mithuna Sankranti)
        offset = (d - mithuna_date).days
        if offset in RAJA_OFFSETS:
            fn, fd = RAJA_OFFSETS[offset]
            festivals.append(fn)
            descs.append(fd)

        output["days"].append({
            "date":          d.isoformat(),
            "weekday":       d.weekday(),       # 0=Mon … 6=Sun
            "odiaDate":      odia_date,
            "odiaMonth":     ODIA_MONTHS[omi],
            "odiaMonthIndex": omi,
            "tithi":         TITHIS[ti],
            "paksha":        PAKSHA[ti],
            "tithiIndex":    ti,
            "nakshatra":     NAKSHATRAS[ni],
            "yoga":          YOGAS[yi],
            "karana":        KARANAS[ki],
            "sunrise":       sr_dt.strftime("%H:%M"),
            "sunset":        ss_dt.strftime("%H:%M"),
            "rahuStart":     rahu_start,
            "rahuEnd":       rahu_end,
            "festivals":     festivals,
            "festivalDescs": descs,
        })

        d += timedelta(days=1)

    return output


if __name__ == "__main__":
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2027
    data = generate(year)
    out = pathlib.Path(__file__).parent.parent / "src" / "data" / f"panchanga_{year}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Written {len(data['days'])} days → {out}", file=sys.stderr)
