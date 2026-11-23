"""
Generate panji-specific festival overlays for 2026 and 2027.

Outputs: src/data/festivals_jagannatha.json
         src/data/festivals_biraja.json

Each file is { "YYYY-MM-DD": ["festival name", ...] }
Sources: Wikipedia (Jagannatha Temple festival list), tirthayatra.org,
         drikpanchang.com 2027, incredibleindia.gov.in (Sitalsasthi).
"""

import json
from datetime import date, timedelta
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "src" / "data"

# ── Load base panchanga ───────────────────────────────────────────────────────
def load_all():
    days = []
    for year in (2026, 2027):
        with open(DATA_DIR / f"panchanga_{year}.json") as f:
            days.extend(json.load(f)["days"])
    return days

# ── Lookup helpers ────────────────────────────────────────────────────────────
def find(days, month_idx, tithi_idx):
    return [d for d in days
            if d["odiaMonthIndex"] == month_idx and d["tithiIndex"] == tithi_idx]

def find_tithi(days, tithi_idx):
    return [d for d in days if d["tithiIndex"] == tithi_idx]

def find_tithi_weekday(days, tithi_idx, weekday):
    return [d for d in days
            if d["tithiIndex"] == tithi_idx and d["weekday"] == weekday]

def offset(date_str, n):
    return (date.fromisoformat(date_str) + timedelta(days=n)).isoformat()

def add(overlay, date_str, name):
    overlay.setdefault(date_str, [])
    if name not in overlay[date_str]:
        overlay[date_str].append(name)

# ── Odia month indices ────────────────────────────────────────────────────────
# 0=Baishakha 1=Jyeshtha  2=Ashadha    3=Shravana  4=Bhadra
# 5=Ashwina   6=Kartika   7=Margashira 8=Pousha    9=Magha
# 10=Phalguna 11=Chaitra
M = dict(bai=0,jye=1,ash=2,shr=3,bha=4,asw=5,kar=6,mar=7,pau=8,mag=9,pha=10,cha=11)

# Shukla: tithi_number - 1  (Pratipada=0 … Purnima=14)
# Krishna: 14 + tithi_number  (K.Pratipada=15 … Amavasya=29)
S = lambda n: n - 1
K = lambda n: 14 + n
PURNIMA  = 14
AMAVASYA = 29
TUE = 1  # Python Mon=0 … Sun=6

# Deduplicate: when a tithi spans midnight it appears on two civil days.
# Keep only the first occurrence per calendar month.
def first_per_month(matches):
    seen = set()
    result = []
    for d in sorted(matches, key=lambda x: x["date"]):
        key = d["date"][:7]   # YYYY-MM
        if key not in seen:
            seen.add(key)
            result.append(d)
    return result

# ── Jagannatha Panji ──────────────────────────────────────────────────────────
def build_jagannatha(days):
    ov = {}

    # Pana Sankranti / Odia New Year — Baishakha day 1 (Mesha Sankranti)
    for d in days:
        if d["odiaMonthIndex"] == M["bai"] and d["odiaDate"] == 1:
            add(ov, d["date"], "ପଣ ସଂକ୍ରାନ୍ତି · Pana Sankranti")

    # Akshaya Tritiya + Chandan Yatra — Baishakha Shukla 3 (21-day festival)
    for d in find(days, M["bai"], S(3)):
        add(ov, d["date"], "ଅକ୍ଷୟ ତୃତୀୟା · Akshaya Tritiya")
        add(ov, d["date"], "ଚନ୍ଦନ ଯାତ୍ରା ଆରମ୍ଭ · Chandan Yatra begins")
        for i in range(1, 21):
            add(ov, offset(d["date"], i), "ଚନ୍ଦନ ଯାତ୍ରା · Chandan Yatra")
        add(ov, offset(d["date"], 21), "ଚନ୍ଦନ ଯାତ୍ରା ସମାପ୍ତ · Chandan Yatra ends")

    # Savitri Amavasya — Jyeshtha Amavasya (Vat Savitri Vrat)
    for d in find(days, M["jye"], AMAVASYA):
        add(ov, d["date"], "ସାବିତ୍ରୀ ଅମାବାସ୍ୟା · Savitri Amavasya")

    # Snana Yatra — Jyeshtha Purnima; Anavasara: 15-day seclusion after
    for d in find(days, M["jye"], PURNIMA):
        add(ov, d["date"], "ସ୍ନାନ ଯାତ୍ରା · Snana Yatra")
        for i in range(1, 16):
            add(ov, offset(d["date"], i), "ଅନଵସର · Anavasara")

    # Naba Yauvana — Ashadha Shukla 1 (deities emerge from seclusion)
    for d in find(days, M["ash"], S(1)):
        add(ov, d["date"], "ନବ ଯୌବନ · Naba Yauvana")

    # Rath Yatra — Ashadha Shukla 2
    for d in find(days, M["ash"], S(2)):
        add(ov, d["date"], "ରଥ ଯାତ୍ରା · Rath Yatra")

    # Hera Panchami — Ashadha Shukla 5
    for d in find(days, M["ash"], S(5)):
        add(ov, d["date"], "ହେର ପଞ୍ଚମୀ · Hera Panchami")

    # Bahuda Yatra — Ashadha Shukla 10
    for d in find(days, M["ash"], S(10)):
        add(ov, d["date"], "ବାହୁଡ଼ା ଯାତ୍ରା · Bahuda Yatra")

    # Suna Besha + Shayani Ekadashi — Ashadha Shukla 11
    for d in find(days, M["ash"], S(11)):
        add(ov, d["date"], "ସୁନ ବେଷ · Suna Besha")
        add(ov, d["date"], "ଶୟନ ଏକାଦଶୀ · Shayani Ekadashi")

    # Niladri Bije — Ashadha Shukla 13 (Trayodashi)
    for d in find(days, M["ash"], S(13)):
        add(ov, d["date"], "ନୀଳାଦ୍ରି ବିଜେ · Niladri Bije")

    # Jhulan Yatra — Shravana Shukla 11 to Purnima (5 days)
    for d in find(days, M["shr"], S(11)):
        add(ov, d["date"], "ଝୁଲଣ ଯାତ୍ରା ଆରମ୍ଭ · Jhulan Yatra begins")
        for i in range(1, 4):
            add(ov, offset(d["date"], i), "ଝୁଲଣ ଯାତ୍ରା · Jhulan Yatra")
    for d in find(days, M["shr"], PURNIMA):
        add(ov, d["date"], "ଝୁଲଣ ଯାତ୍ରା ସମାପ୍ତ · Jhulan Yatra ends")

    # Chitalagi Amavasya — Shravana Amavasya
    for d in find(days, M["shr"], AMAVASYA):
        add(ov, d["date"], "ଚିତଲଗି ଅମାବାସ୍ୟା · Chitalagi Amavasya")

    # Gamha Purnima — Shravana Purnima
    for d in find(days, M["shr"], PURNIMA):
        add(ov, d["date"], "ଗମ୍ଭ ପୂର୍ଣ୍ଣିମା · Gamha Purnima")

    # Panchaka Besha — Kartika Shukla 11 to Purnima (5 days)
    for d in find(days, M["kar"], S(11)):
        add(ov, d["date"], "ପଞ୍ଚକ ବେଶ ଆରମ୍ଭ · Panchaka begins")

    # Kartika Purnima — Rajarajeswara Besha; Panchaka ends
    for d in find(days, M["kar"], PURNIMA):
        add(ov, d["date"], "କାର୍ତ୍ତିକ ପୂର୍ଣ୍ଣିମା · Kartika Purnima")
        add(ov, d["date"], "ରାଜରାଜେଶ୍ୱର ବେଷ · Rajarajeswara Besha")

    # Deba Deepabali — Margashira Krishna 14
    for d in find(days, M["mar"], K(14)):
        add(ov, d["date"], "ଦେବ ଦୀପାବଳି · Deba Deepabali")

    # Pushyabhisheka — Pausha Purnima
    for d in find(days, M["pau"], PURNIMA):
        add(ov, d["date"], "ପୁଷ୍ୟଭିଷେକ · Pushyabhisheka")

    # Magha Purnima
    for d in find(days, M["mag"], PURNIMA):
        add(ov, d["date"], "ମାଘ ପୂର୍ଣ୍ଣିମା · Magha Purnima")

    # Dola Yatra — Phalguna Shukla 10 start, Purnima peak
    for d in find(days, M["pha"], S(10)):
        add(ov, d["date"], "ଡୋଲ ଯାତ୍ରା ଆରମ୍ଭ · Dola Yatra begins")
    for d in find(days, M["pha"], PURNIMA):
        add(ov, d["date"], "ଡୋଲ ପୂର୍ଣ୍ଣିମା · Dola Purnima")

    # Damanaka Chaturdashi — Chaitra Shukla 14
    for d in find(days, M["cha"], S(14)):
        add(ov, d["date"], "ଦାମନକ ଚତୁର୍ଦ୍ଦଶୀ · Damanaka Chaturdashi")

    return ov


# ── Biraja / Shakta Panji ─────────────────────────────────────────────────────
def build_biraja(days):
    ov = {}

    # Triveni Amavasya (Biraja Jayanti) — Magha Amavasya
    for d in find(days, M["mag"], AMAVASYA):
        add(ov, d["date"], "ତ୍ରିବେଣୀ ଅମାବାସ୍ୟା · Biraja Jayanti")

    # Dola Purnima — Phalguna Purnima (new almanac read at Biraja temple)
    for d in find(days, M["pha"], PURNIMA):
        add(ov, d["date"], "ଡୋଲ ପୂର୍ଣ୍ଣିମା · Dola Purnima")

    # Varuni — Chaitra Krishna 13 conjunct Shatabhisha nakshatra
    for d in find(days, M["cha"], K(13)):
        if d.get("nakshatra") in ("ଶତଭିଷ", "ଶତଭିଷା"):
            add(ov, d["date"], "ବାରୁଣୀ · Varuni")

    # Basanti Navaratri — Chaitra Shukla 1–9
    basanti = [
        "ଶୈଳପୁତ୍ରୀ", "ବ୍ରହ୍ମଚାରିଣୀ", "ଚନ୍ଦ୍ରଘଣ୍ଟା", "କୁଷ୍ମାଣ୍ଡା",
        "ସ୍କନ୍ଦମାତା", "କାତ୍ୟାୟନୀ", "କାଳରାତ୍ରି",
        "ବସନ୍ତ ଅଷ୍ଟମୀ", "ବସନ୍ତ ମହାନବମୀ",
    ]
    for i, name in enumerate(basanti):
        for d in find(days, M["cha"], S(i + 1)):
            add(ov, d["date"], f"ବସନ୍ତ ନବରାତ୍ରି · {name}")

    # Pana Sankranti — shared
    for d in days:
        if d["odiaMonthIndex"] == M["bai"] and d["odiaDate"] == 1:
            add(ov, d["date"], "ପଣ ସଂକ୍ରାନ୍ତି · Pana Sankranti")

    # Chandan Purnima — Jyeshtha Purnima (Biraja smeared with sandalwood)
    for d in find(days, M["jye"], PURNIMA):
        add(ov, d["date"], "ଚନ୍ଦନ ପୂର୍ଣ୍ଣିମା · Chandan Purnima")

    # Savitri Amavasya — Jyeshtha Amavasya
    for d in find(days, M["jye"], AMAVASYA):
        add(ov, d["date"], "ସାବିତ୍ରୀ ଅମାବାସ୍ୟା · Savitri Amavasya")

    # Phagu Dasami — Phalguna Shukla 10
    for d in find(days, M["pha"], S(10)):
        add(ov, d["date"], "ଫାଗୁ ଦଶମୀ · Phagu Dasami")

    # Sitalsasthi — Jyeshtha Shukla 5 (procession) + 6 (wedding)
    for d in find(days, M["jye"], S(5)):
        add(ov, d["date"], "ଶୀତଳ ଷଷ୍ଠୀ ଶୋଭାଯାତ୍ରା · Sitalsasthi procession")
    for d in find(days, M["jye"], S(6)):
        add(ov, d["date"], "ଶୀତଳ ଷଷ୍ଠୀ · Sitalsasthi")

    # Chitalagi Amavasya — Shravana Amavasya
    for d in find(days, M["shr"], AMAVASYA):
        add(ov, d["date"], "ଚିତଲଗି ଅମାବାସ୍ୟା · Chitalagi Amavasya")

    # Gamha Purnima — Shravana Purnima
    for d in find(days, M["shr"], PURNIMA):
        add(ov, d["date"], "ଗହ୍ମ ପୂର୍ଣ୍ଣିମା · Gamha Purnima")

    # Sunia (Bilwa worship / Durga Puja prep) — Bhadra Shukla 12
    for d in find(days, M["bha"], S(12)):
        add(ov, d["date"], "ସୁନିଆ · Sunia")

    # Mahalaya — Bhadra Amavasya
    for d in find(days, M["bha"], AMAVASYA):
        add(ov, d["date"], "ମହାଳୟ · Mahalaya")

    # Mula Ashtami — Ashwina Krishna 8 (16-day Biraja Durga Puja starts)
    for d in find(days, M["asw"], K(8)):
        add(ov, d["date"], "ମୂଳ ଅଷ୍ଟମୀ · Mula Ashtami")

    # Biraja Ratha Yatra — Ashwina Shukla 1
    for d in find(days, M["asw"], S(1)):
        add(ov, d["date"], "ବିରଜା ରଥ ଯାତ୍ରା · Biraja Ratha Yatra")

    # Sharada Navaratri — Ashwina Shukla 1–9
    sharada = [
        "ଶୈଳପୁତ୍ରୀ", "ବ୍ରହ୍ମଚାରିଣୀ", "ଚନ୍ଦ୍ରଘଣ୍ଟା", "କୁଷ୍ମାଣ୍ଡା",
        "ଲଳିତ ପଞ୍ଚମୀ · Lalita Panchami", "କାତ୍ୟାୟନୀ",
        "ମହା ସପ୍ତମୀ · Maha Saptami",
        "ମହା ଅଷ୍ଟମୀ · Maha Ashtami",
        "ମହା ନବମୀ · Maha Navami",
    ]
    for i, name in enumerate(sharada):
        for d in find(days, M["asw"], S(i + 1)):
            add(ov, d["date"], f"ଶାରଦ ନବରାତ୍ରି · {name}")

    # Vijayadashami — Ashwina Shukla 10
    for d in find(days, M["asw"], S(10)):
        add(ov, d["date"], "ବିଜୟ ଦଶମୀ · Vijayadashami")

    # Kumar Purnima — Ashwina Purnima
    for d in find(days, M["asw"], PURNIMA):
        add(ov, d["date"], "କୁମାର ପୂର୍ଣ୍ଣିମା · Kumar Purnima")

    # Kartika Purnima — shared
    for d in find(days, M["kar"], PURNIMA):
        add(ov, d["date"], "କାର୍ତ୍ତିକ ପୂର୍ଣ୍ଣିମା · Kartika Purnima")

    # Mangala Saptami — every Shukla Saptami falling on Tuesday
    for d in first_per_month(find_tithi_weekday(days, S(7), TUE)):
        add(ov, d["date"], "ମଙ୍ଗଳ ସପ୍ତମୀ · Mangala Saptami")

    # Masika Durgashtami — Krishna Ashtami every month (one per month)
    for d in first_per_month(find_tithi(days, K(8))):
        add(ov, d["date"], "ମାସିକ ଦୁର୍ଗାଷ୍ଟମୀ · Durgashtami")

    return ov


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    days = load_all()

    jag = build_jagannatha(days)
    bir = build_biraja(days)

    out_jag = DATA_DIR / "festivals_jagannatha.json"
    out_bir = DATA_DIR / "festivals_biraja.json"

    with open(out_jag, "w", encoding="utf-8") as f:
        json.dump(jag, f, ensure_ascii=False, indent=2, sort_keys=True)
    with open(out_bir, "w", encoding="utf-8") as f:
        json.dump(bir, f, ensure_ascii=False, indent=2, sort_keys=True)

    print(f"Jagannatha: {len(jag)} festival days → {out_jag.name}")
    print(f"Biraja:     {len(bir)} festival days → {out_bir.name}")

    # Sanity: print key 2027 dates
    for label, ov in [("Jagannatha", jag), ("Biraja", bir)]:
        print(f"\n── {label} 2027 highlights ──")
        for dt in sorted(k for k in ov if k.startswith("2027")):
            names = ", ".join(ov[dt])
            if any(x in names for x in ["ରଥ", "ସ୍ନାନ", "ଅଷ୍ଟମୀ", "ଦଶମୀ", "ପଣ", "ଅକ୍ଷୟ", "ପୁଷ୍ୟ"]):
                print(f"  {dt}: {names}")

if __name__ == "__main__":
    main()
