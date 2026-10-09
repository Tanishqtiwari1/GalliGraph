"""Generate a realistic synthetic complaint stream for Jaipur with planted ground truth.

* ~N real-world issues, each reported by 1..15 citizens (heavy-tailed, like real 311 data)
* English / Hindi / Hinglish, typos, vague landmarks, some with GPS and some text-only
* Hard negatives: different issues of the same type in the same locality
* One planted spike: a drainage surge in Malviya Nagar in the last 2 days

Output: data/synthetic_complaints.csv  (gt_issue / gt_category columns are ground truth for evaluation)

Usage: python scripts/generate_synthetic.py [--issues 260] [--seed 7]
"""
import argparse
import csv
import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALITIES = json.loads((ROOT / "data" / "jaipur_localities.json").read_text(encoding="utf-8"))["localities"]

LANDMARKS = [("Shiv mandir", "शिव मंदिर"), ("Gurudwara", "गुरुद्वारा"), ("SBI ATM", "SBI ATM"),
             ("petrol pump", "पेट्रोल पंप"), ("govt school", "सरकारी स्कूल"), ("park gate", "पार्क गेट"),
             ("water tank", "पानी की टंकी"), ("Hanuman temple", "हनुमान मंदिर"), ("bus stop", "बस स्टॉप"),
             ("community hall", "सामुदायिक भवन"), ("Reliance Fresh", "Reliance Fresh"), ("masjid", "मस्जिद")]

DURATIONS = [("3 days", "3 din", "3 दिन"), ("a week", "ek hafte", "एक हफ्ते"), ("2 weeks", "2 hafte", "2 हफ्ते"),
             ("10 days", "10 din", "10 दिन"), ("a month", "1 mahine", "एक महीने"), ("5 days", "5 din", "5 दिन")]

SAFETY_EXTRAS = {
    "en": ["A scooter rider fell here yesterday.", "Kids walk to school through this road, it is dangerous.",
           "An old man got injured last night.", "Accident can happen any time."],
    "hinglish": ["kal ek scooty wala gir gaya.", "school ke bachche yahi se jaate hain, bahut khatarnak hai.",
                 "raat ko accident hone ka dar hai.", "ek uncle ko chot lag gayi."],
    "hi": ["कल एक स्कूटी वाला गिर गया।", "बच्चे यहीं से स्कूल जाते हैं, खतरनाक है।"],
}
MILD_EXTRAS = {
    "en": ["Please fix it soon.", "Complained earlier also, no action.", "Very inconvenient for residents.", ""],
    "hinglish": ["jaldi theek karo please.", "pehle bhi complaint ki thi.", "koi sunwai nahi ho rahi.", ""],
    "hi": ["कृपया जल्दी ठीक करें।", "पहले भी शिकायत की थी।", ""],
}

# {loc} locality, {det} detail (lane / landmark), {dur} duration, {x} extra sentence
T = {
    ("road_damage", "pothole"): {
        "en": ["Big pothole on the road at {det}, {loc}. {x}", "There is a deep pothole {det} in {loc} for {dur}. {x}",
               "Huge potholes near {det}, {loc} - vehicles getting damaged. {x}", "Pothole at {loc} {det} still not repaired after {dur}. {x}"],
        "hinglish": ["{loc} {det} me sadak pe bada gaddha hai {dur} se. {x}", "bhai {det} {loc} wala gaddha abhi tak nahi bhara. {x}",
                     "{loc} me {det} gadda ho gaya hai, raat ko dikhta nahi. {x}", "{det} {loc} road pe bahut bade gaddhe hain. {x}"],
        "hi": ["{loc} {det} में सड़क पर बड़ा गड्ढा है, {dur} से। {x}", "{det}, {loc} में गड्ढे की वजह से बहुत परेशानी है। {x}"],
    },
    ("road_damage", "broken_road"): {
        "en": ["Road completely broken at {det}, {loc} for {dur}. {x}", "The road near {det} in {loc} is damaged and uneven. {x}"],
        "hinglish": ["{loc} {det} ki sadak tooti hui hai {dur} se. {x}", "{det} {loc} me road kharab hai, chalna mushkil. {x}"],
        "hi": ["{loc} {det} की सड़क टूटी हुई है। {x}"],
    },
    ("water_supply", "no_supply"): {
        "en": ["No water supply in {loc} {det} for {dur}. {x}", "Water not coming in taps at {det}, {loc} since {dur}. {x}"],
        "hinglish": ["{loc} {det} me {dur} se paani nahi aa raha. {x}", "{det} {loc} me water supply band hai, nal me paani nahi. {x}"],
        "hi": ["{loc} {det} में {dur} से पानी नहीं आ रहा है। {x}"],
    },
    ("water_supply", "pipeline_leak"): {
        "en": ["Water pipeline leaking at {det}, {loc}, lots of water wastage. {x}", "Pipe burst near {det} in {loc}, water flowing on road for {dur}. {x}"],
        "hinglish": ["{loc} {det} pe pipeline leak ho rahi hai, paani beh raha hai. {x}", "{det} {loc} me pipe phat gaya, {dur} se paani beh raha. {x}"],
        "hi": ["{loc} {det} पर पाइपलाइन लीक हो रही है। {x}"],
    },
    ("water_supply", "contaminated_water"): {
        "en": ["Dirty smelly water coming in taps at {det}, {loc}. {x}", "Contaminated muddy water supply in {loc} {det} for {dur}. {x}"],
        "hinglish": ["{loc} {det} me ganda paani aa raha hai nal me, bimari ka dar. {x}", "{det} {loc} me peene ka paani ganda aa raha hai. {x}"],
        "hi": ["{loc} {det} में नल में गंदा पानी आ रहा है। {x}"],
    },
    ("drainage", "blocked_drain"): {
        "en": ["Drain blocked at {det}, {loc} for {dur}, bad smell. {x}", "The nali near {det} in {loc} is clogged and overflowing. {x}"],
        "hinglish": ["{loc} {det} ki naali jam ho gayi hai {dur} se. {x}", "{det} {loc} me nali band hai, gandagi fail rahi hai. {x}"],
        "hi": ["{loc} {det} की नाली जाम हो गई है। {x}"],
    },
    ("drainage", "sewage_overflow"): {
        "en": ["Sewage overflowing on the street at {det}, {loc}. {x}", "Sewer line overflow near {det} in {loc} for {dur}. {x}"],
        "hinglish": ["{loc} {det} pe sewer ka paani road pe aa gaya hai. {x}", "{det} {loc} me gutter overflow ho raha hai {dur} se. {x}"],
        "hi": ["{loc} {det} पर सीवर का पानी सड़क पर बह रहा है। {x}"],
    },
    ("drainage", "open_manhole"): {
        "en": ["Open manhole without cover at {det}, {loc}. {x}", "Manhole lid missing near {det} in {loc}, very risky. {x}"],
        "hinglish": ["{loc} {det} pe manhole khula pada hai, dhakkan nahi hai. {x}", "{det} {loc} me manhole open hai {dur} se. {x}"],
        "hi": ["{loc} {det} पर मैनहोल का ढक्कन नहीं है। {x}"],
    },
    ("drainage", "waterlogging"): {
        "en": ["Severe waterlogging at {det}, {loc} after rain. {x}", "Water logged street near {det} in {loc} for {dur}. {x}"],
        "hinglish": ["{loc} {det} me baarish ke baad paani bhara hua hai. {x}", "{det} {loc} pe jalbharav ho gaya hai. {x}"],
        "hi": ["{loc} {det} में जलभराव हो गया है। {x}"],
    },
    ("garbage", "garbage_dump"): {
        "en": ["Huge garbage dump at {det}, {loc}, not cleared for {dur}. {x}", "Garbage piled up near {det} in {loc}, stray animals everywhere. {x}"],
        "hinglish": ["{loc} {det} pe kachra ka dher laga hai {dur} se. {x}", "{det} {loc} me kooda pada hai, badbu aa rahi hai. {x}"],
        "hi": ["{loc} {det} पर कचरे का ढेर लगा है। {x}"],
    },
    ("garbage", "missed_collection"): {
        "en": ["Garbage collection van has not come to {det}, {loc} for {dur}. {x}", "Door to door garbage not collected in {loc} {det}. {x}"],
        "hinglish": ["{loc} {det} me {dur} se kachra gaadi nahi aayi. {x}", "{det} {loc} me safai wala nahi aa raha. {x}"],
        "hi": ["{loc} {det} में {dur} से कचरा गाड़ी नहीं आई। {x}"],
    },
    ("garbage", "overflowing_bin"): {
        "en": ["Dustbin overflowing at {det}, {loc}. {x}", "Public dustbin near {det} in {loc} full for {dur}. {x}"],
        "hinglish": ["{loc} {det} ka dustbin bhar ke overflow ho raha hai. {x}"],
        "hi": ["{loc} {det} का डस्टबिन भरकर बह रहा है। {x}"],
    },
    ("streetlight", "not_working"): {
        "en": ["Street light not working at {det}, {loc} for {dur}. {x}", "Streetlights off near {det} in {loc}, very dark at night. {x}"],
        "hinglish": ["{loc} {det} ki street light {dur} se band hai, andhera rehta hai. {x}", "{det} {loc} me light nahi jal rahi raat ko. {x}"],
        "hi": ["{loc} {det} की स्ट्रीट लाइट {dur} से बंद है, अंधेरा रहता है। {x}"],
    },
    ("streetlight", "exposed_wires"): {
        "en": ["Exposed electric wires at streetlight pole near {det}, {loc}. {x}", "Live wires hanging from light pole at {det}, {loc}. {x}"],
        "hinglish": ["{loc} {det} pe light ke khambe se taar latak rahe hain, current ka dar. {x}"],
        "hi": ["{loc} {det} पर खंभे से तार लटक रहे हैं। {x}"],
    },
}
INHERENTLY_SAFETY = {"open_manhole", "exposed_wires", "contaminated_water", "sewage_overflow"}
CAT_WEIGHTS = {"road_damage": 0.27, "garbage": 0.24, "drainage": 0.2, "water_supply": 0.17, "streetlight": 0.12}


def typo(s: str, rng: random.Random, p: float = 0.04) -> str:
    out, chars = [], list(s)
    for i, ch in enumerate(chars):
        if ch.isalpha() and ch.isascii() and rng.random() < p:
            op = rng.random()
            if op < 0.4:
                continue  # drop
            if op < 0.7 and i + 1 < len(chars):
                out.append(chars[i + 1]); chars[i + 1] = ch; continue  # swap
            out.append(ch + ch); continue  # double
        out.append(ch)
    return "".join(out)


def jitter(lat: float, lng: float, meters: float, rng: random.Random) -> tuple[float, float]:
    r, th = meters * math.sqrt(rng.random()), rng.random() * 2 * math.pi
    return lat + r * math.cos(th) / 111_320, lng + r * math.sin(th) / (111_320 * math.cos(math.radians(lat)))


def detail_variants(gali: int | None, lm: tuple[str, str] | None, lang: str, rng: random.Random) -> str:
    if lang == "hi":
        opts = ([f"गली {gali}", f"गली नंबर {gali}"] if gali else []) + ([f"{lm[1]} के पास"] if lm else [])
    elif lang == "hinglish":
        opts = ([f"gali no {gali}", f"gali {gali}", f"gali number {gali}"] if gali else []) + \
               ([f"{lm[0]} ke paas", f"{lm[0]} ke samne"] if lm else [])
    else:
        opts = ([f"lane {gali}", f"street no. {gali}", f"gali no. {gali}"] if gali else []) + \
               ([f"near {lm[0]}", f"opposite {lm[0]}"] if lm else [])
    return rng.choice(opts)


def make_issue_reports(issue_id: int, cat: str, sub: str, loc: dict, start: datetime, n_reports: int,
                       spread_days: float, rng: random.Random, used_slots: set) -> list[dict]:
    # A unique physical spot: (locality, lane) or (locality, landmark)
    for _ in range(50):
        gali = rng.randint(1, 30) if rng.random() < 0.75 else None
        lm = rng.choice(LANDMARKS) if (gali is None or rng.random() < 0.35) else None
        slot = (loc["id"], gali, lm[0] if lm else None, cat)
        if slot not in used_slots:
            used_slots.add(slot)
            break
    spot = jitter(loc["lat"], loc["lng"], 800, rng)  # true position inside the locality
    safety = sub in INHERENTLY_SAFETY or rng.random() < 0.25
    dur = rng.choice(DURATIONS)
    hi_name = loc["aliases"][-1]
    rows = []
    for k in range(n_reports):
        lang = rng.choices(["en", "hinglish", "hi"], [0.4, 0.45, 0.15])[0]
        tmpl = rng.choice(T[(cat, sub)][lang])
        extra_pool = SAFETY_EXTRAS[lang] if (safety and rng.random() < 0.6) else MILD_EXTRAS[lang]
        loc_name = hi_name if lang == "hi" else rng.choice([loc["name"], loc["aliases"][0], loc["aliases"][0].title()])
        text = tmpl.format(loc=loc_name, det=detail_variants(gali, lm, lang, rng),
                           dur={"en": dur[0], "hinglish": dur[1], "hi": dur[2]}[lang], x=rng.choice(extra_pool))
        text = " ".join(text.split())
        if lang != "hi":
            text = typo(text, rng)
            if rng.random() < 0.3:
                text = text.lower()
        t = start + timedelta(days=rng.random() * spread_days if k else 0, hours=rng.random() * 12)
        has_gps = rng.random() < 0.45
        lat, lng = jitter(*spot, 60, rng) if has_gps else (None, None)
        rows.append({"text": text, "lat": f"{lat:.6f}" if lat else "", "lng": f"{lng:.6f}" if lng else "",
                     "created_at": t.isoformat(timespec="seconds"),
                     "channel": rng.choices(["web", "whatsapp", "app", "email"], [0.35, 0.4, 0.15, 0.1])[0],
                     "gt_issue": issue_id, "gt_category": cat, "gt_sub_type": sub, "gt_locality": loc["id"]})
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--issues", type=int, default=260)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default=str(ROOT / "data" / "synthetic_complaints.csv"))
    args = ap.parse_args()
    rng = random.Random(args.seed)
    now = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)

    subs_by_cat = {}
    for (c, s) in T:
        subs_by_cat.setdefault(c, []).append(s)

    rows, used = [], set()
    for issue_id in range(1, args.issues + 1):
        cat = rng.choices(list(CAT_WEIGHTS), list(CAT_WEIGHTS.values()))[0]
        sub = rng.choice(subs_by_cat[cat])
        loc = rng.choices(LOCALITIES, [l["population"] for l in LOCALITIES])[0]
        n = min(15, max(1, int(rng.paretovariate(1.3))))  # heavy tail: most 1-2, a few 10+
        start = now - timedelta(days=rng.uniform(3, 45))
        spread = min(10.0, (now - start).total_seconds() / 86400 - 2.5)  # keep the last 2 days for the spike
        rows += make_issue_reports(issue_id, cat, sub, loc, start, n, spread, rng, used)

    # Planted spike: drainage surge in Malviya Nagar during the last 2 days (several distinct spots)
    malviya = next(l for l in LOCALITIES if l["id"] == "malviya_nagar")
    for j in range(4):
        sub = rng.choice(["blocked_drain", "sewage_overflow", "waterlogging"])
        start = now - timedelta(days=1.8 - j * 0.3)
        rows += make_issue_reports(args.issues + 1 + j, "drainage", sub, malviya, start, rng.randint(3, 6), 1.0, rng, used)

    rows = [r for r in rows if r["created_at"] <= now.isoformat()]
    rows.sort(key=lambda r: r["created_at"])
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} complaints describing {len({r['gt_issue'] for r in rows})} real issues -> {args.out}")


if __name__ == "__main__":
    main()
