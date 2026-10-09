"""Stage 1: turn a messy free-text (and optional photo) complaint into a structured record.

Two interchangeable extractors:
  * ClaudeExtractor  - Claude structured outputs; multilingual, reads photos.
  * RuleExtractor    - offline keyword/regex fallback so the system never stops working.
"""
import logging
import re
from functools import lru_cache
from typing import Literal

import anthropic
from pydantic import BaseModel, Field

from . import config
from .fuzzy import count_phrases, tokens
from .taxonomy import CATEGORIES

log = logging.getLogger(__name__)

Category = Literal["road_damage", "water_supply", "drainage", "garbage", "streetlight", "stray_animals", "traffic",
                   "electricity", "other"]


class Extraction(BaseModel):
    category: Category
    sub_type: str = Field(description="One of the sub-types listed for the chosen category")
    location_text: str | None = Field(description="Locality / area name as written, e.g. 'Raja Park'")
    location_detail: str | None = Field(description="Finer pointer: lane/gali no., sector, house no., landmark")
    duration_days: int | None = Field(description="How long the problem has existed, in days, if stated")
    severity: int = Field(description="1 (cosmetic) to 5 (immediate danger to life/health)")
    severity_reason: str
    safety_risk: bool = Field(description="True if risk of accident, injury, electrocution, disease or flooding")
    language: str = Field(description="english | hindi | hinglish | other")
    summary_en: str = Field(description="One neutral English sentence describing the problem and where it is")
    secondary_category: Category | None = Field(
        default=None,
        description="A second category ONLY if the complaint clearly also needs another department, "
                    "e.g. a road broken by a leaking water pipe -> water_supply; otherwise null")


SYSTEM_PROMPT = """You triage civic complaints for an Indian city municipal corporation (Jaipur).
Complaints arrive in English, Hindi (Devanagari) or Hinglish, often with typos and no fixed format.
Extract a structured record.

Categories and sub-types:
{taxonomy}

Severity rubric:
1 = cosmetic / minor inconvenience
2 = inconvenience to a few households
3 = affects a street or many people, or has lasted weeks
4 = likely to cause injury, illness or property damage; an accident has already happened
5 = immediate danger to life (open manhole, live wires, sewage in drinking water, cave-in)

Rules:
- If the complaint contains a photo, use it to confirm the category and judge severity.
- Convert durations to days (1 hafta/week = 7, 1 mahina/month = 30).
- Do not invent locations; use null when none is given.
- summary_en must be in English even if the complaint is not.
- secondary_category is rare: set it only when two different departments must act."""


def _taxonomy_text() -> str:
    return "\n".join(f"- {k}: {', '.join(v['sub_types'])}" for k, v in CATEGORIES.items())


class ClaudeExtractor:
    name = "claude"

    def __init__(self) -> None:
        self.client = anthropic.Anthropic()
        self.system = SYSTEM_PROMPT.format(taxonomy=_taxonomy_text())

    def extract(self, text: str, image_b64: str | None = None, image_media_type: str | None = None) -> Extraction:
        content: list[dict] = []
        if image_b64:
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": image_media_type or "image/jpeg", "data": image_b64},
            })
        content.append({"type": "text", "text": f"Complaint:\n{text}"})

        response = self.client.messages.parse(
            model=config.LLM_MODEL,
            max_tokens=1024,
            system=self.system,
            messages=[{"role": "user", "content": content}],
            output_format=Extraction,
        )
        if response.stop_reason == "refusal" or response.parsed_output is None:
            raise RuntimeError(f"extraction unavailable (stop_reason={response.stop_reason})")
        return _clean(response.parsed_output)


class OllamaExtractor:
    """Free local models via Ollama. Text complaints use the text model; complaints with a photo
    use the vision model (falls back to text-only if the vision model is not installed)."""
    name = "ollama"

    def __init__(self) -> None:
        self.system = SYSTEM_PROMPT.format(taxonomy=_taxonomy_text()) + "\nReply with the JSON record only."

    def extract(self, text: str, image_b64: str | None = None, image_media_type: str | None = None) -> Extraction:
        from .ollama import ModelMissing, chat_json  # local import keeps Claude-only setups dependency-free

        prompt = f"Complaint:\n{text}"
        result = None
        if image_b64:
            try:
                result = chat_json(config.OLLAMA_VISION_MODEL, self.system,
                                   prompt + "\n(A photo from the citizen is attached.)", Extraction, [image_b64])
            except ModelMissing as exc:
                log.warning("%s - reading the text only", exc)
        if result is None:
            result = chat_json(config.OLLAMA_TEXT_MODEL, self.system, prompt, Extraction)
        return _guardrail(_clean(result), RuleExtractor().extract(text), text)


def _guardrail(llm: Extraction, rules: Extraction, raw_text: str) -> Extraction:
    """Small local models understand language well but under-call danger ("a scooter fell" -> severity 2).
    Combine with the deterministic keyword signals: never lower severity or drop a safety flag the rules found,
    and prefer an explicitly stated duration parsed by the rules."""
    llm.safety_risk = llm.safety_risk or rules.safety_risk
    if rules.severity > llm.severity and rules.safety_risk:
        llm.severity_reason += f" (raised to {rules.severity}: safety keywords in complaint)"
        llm.severity = rules.severity
    if rules.duration_days:
        llm.duration_days = rules.duration_days
    elif not _DURATION_WORDS.search(raw_text):
        llm.duration_days = None  # the complaint never said how long; don't trust an invented number
    if not llm.secondary_category and rules.secondary_category:
        llm.secondary_category = rules.secondary_category
    if not llm.location_detail and rules.location_detail:
        llm.location_detail = rules.location_detail
    return _clean(llm)


# ----------------------------------------------------------------------------- offline fallback

_KEYWORDS: dict[str, dict[str, list[str]]] = {
    "road_damage": {
        "pothole": ["pothole", "potholes", "gaddha", "gadda", "gadhha", "gaddhe", "गड्ढा", "गड्ढे"],
        "road_cave_in": ["cave in", "caved", "dhans", "धंस", "sinkhole"],
        "broken_road": ["road broken", "broken road", "damaged road", "sadak tooti", "sadak tuti", "road toot",
                        "toot gayi", "tooti hui", "road damaged", "सड़क टूटी", "टूटी हुई", "road kharab", "sadak kharab",
                        "uneven", "damaged and", "is damaged", "road is", "completely broken", "road broken"],
        "damaged_footpath": ["footpath", "pavement", "sidewalk"],
    },
    "water_supply": {
        "pipeline_leak": ["leak", "leaking", "pipeline burst", "pipe burst", "pipe phat", "pipe toota", "paani beh",
                          "pani beh", "water wastage", "लीक"],
        "contaminated_water": ["dirty water", "ganda paani", "ganda pani", "contaminated", "smelly water",
                               "muddy water", "गंदा पानी", "yellow water", "dirty", "smelly water", "peene ka paani"],
        "low_pressure": ["low pressure", "pressure kam", "slow supply", "dhire aata"],
        "no_supply": ["no water", "paani nahi", "pani nahi", "water not coming", "no supply", "supply band",
                      "पानी नहीं", "water supply", "nal me paani", "tap dry", "taps are dry", "water not coming",
                      "paani nahi aa", "पानी नहीं आ"],
    },
    "drainage": {
        "open_manhole": ["manhole", "open chamber", "dhakkan", "ढक्कन"],
        "sewage_overflow": ["sewage", "sewer", "gutter overflow", "gutter ka paani", "naali ka paani", "सीवर"],
        "waterlogging": ["waterlogging", "water logging", "water logged", "paani bhara", "pani bhar", "jalbharav",
                         "जलभराव", "flooded street"],
        "blocked_drain": ["drain", "drainage", "nali", "naali", "naala", "nala", "clogged", "नाली", "jam ho gayi", "जाम"],
    },
    "garbage": {
        "dead_animal": ["dead animal", "dead dog", "dead cow", "mara hua", "मरा हुआ"],
        "overflowing_bin": ["dustbin", "bin overflowing", "overflowing bin", "kooda daan", "डस्टबिन"],
        "public_urination": ["urination", "urinating", "peshab", "yellow spot", "पेशाब"],
        "public_toilet": ["public toilet", "toilet", "sulabh", "शौचालय"],
        "missed_collection": ["garbage van", "collection", "kachra gaadi", "safai wala", "not collected",
                              "nahi aayi", "hoopers", "कचरा गाड़ी", "door to door"],
        "garbage_dump": ["garbage", "kachra", "kachara", "kooda", "kuda", "trash", "rubbish", "कचरा", "कचरे", "कूड़ा",
                         "dher", "ढेर", "dump"],
    },
    "stray_animals": {
        "stray_dogs": ["stray dog", "stray dogs", "dogs", "dog bite", "kutte", "kutta", "kutton", "कुत्ते", "कुत्ता"],
        "stray_cattle": ["stray cattle", "cows", "cattle", "bull", "gaay", "gaaye", "saand", "आवारा पशु", "गाय", "सांड"],
        "stray_pigs": ["pigs", "suar", "सूअर"],
    },
    "traffic": {
        "congestion": ["traffic jam", "congestion", "traffic", "bottleneck", "जाम लग"],
        "illegal_parking": ["parking", "parked", "wrong parking", "no parking", "पार्किंग"],
        "signal_fault": ["traffic signal", "signal not working", "traffic light", "pedestrian light"],
        "rule_violation": ["helmet", "wrong side", "one way", "no entry", "triple riding", "zebra", "jumping signal"],
    },
    "electricity": {
        "power_outage": ["power cut", "power outage", "no electricity", "electricity", "bijli", "light gayi",
                         "light chali", "बिजली", "voltage", "power supply"],
        "transformer_pole": ["transformer", "electric pole", "बिजली का खंभा"],
    },
    "streetlight": {
        "exposed_wires": ["wire", "wires", "taar", "तार", "current", "shock"],
        "flickering": ["flicker", "blinking", "jalti bujhti"],
        "damaged_pole": ["pole", "khamba", "खंभा"],
        "not_working": ["streetlight", "street light", "street lights", "light nahi", "light band", "andhera",
                        "dark street", "batti", "lamp", "स्ट्रीट लाइट", "अंधेरा", "lights off", "light not working",
                        "nahi jal", "very dark"],
    },
}

_SAFETY = ["accident", "gir gaya", "gir gayi", "gire", "fell", "injur", "chot", "hurt", "electrocut", "shock",
           "current", "dengue", "malaria", "disease", "bimari", "kids", "bachche", "children", "school",
           "hospital", "dangerous", "khatarnak", "danger", "open manhole", "live wire", "drinking",
           "बच्चे", "स्कूल", "दुर्घटना", "गिर", "खतरनाक", "चोट", "करंट", "बीमारी", "अस्पताल",
           "smoke", "dhuan", "dhua", "spark", "fire", "aag", "dog bite", "biting", "chasing", "धुआं", "आग"]
_SAFETY_FUZZY = ["accident", "dangerous", "khatarnak", "injured", "school", "children", "bachche", "electric"]
_SEVERE = ["accident", "injur", "electrocut", "live wire", "open manhole", "cave", "dhans", "sewage in drinking",
           "died", "death", "fell", "gir gay", "khatarnak", "dangerous", "smoke", "dhuan", "spark", "fire", "aag", "bite", "दुर्घटना", "गिर गया", "गिर गई", "खतरनाक"]
_DURATION_WORDS = re.compile(r"\b(din|dino|day|days|hafte|hafta|week|weeks|mahina|mahine|month|months|saal|year|"
                             r"kal|yesterday)\b|दिन|हफ्ते|हफ़्ते|महीने|साल|कल", re.IGNORECASE)
_UNIT_DAYS = {"din": 1, "day": 1, "days": 1, "dino": 1, "hafte": 7, "hafta": 7, "week": 7, "weeks": 7,
              "mahina": 30, "mahine": 30, "month": 30, "months": 30, "saal": 365, "year": 365}
_NUM_WORDS = {"ek": 1, "one": 1, "a": 1, "do": 2, "two": 2, "teen": 3, "three": 3, "char": 4, "four": 4,
              "paanch": 5, "five": 5, "das": 10, "ten": 10}


class RuleExtractor:
    name = "rules"

    # How the trained model and the keyword rules are combined (see _choose_category). The model was trained
    # on English complaints, so on Hindi/Hinglish it must be far more certain before it overrides keywords.
    # (confident, fallback) per detected language - tuned on real 2022 complaints + synthetic Hinglish.
    THRESHOLDS = {"english": (0.5, 0.25), "hinglish": (0.8, 0.5), "hindi": (0.8, 0.5)}
    STRONG_KEYWORDS_OVERRIDE = 0.75

    def extract(self, text: str, image_b64: str | None = None, image_media_type: str | None = None,
                use_model: bool = True) -> Extraction:
        from .geo import locality_by_id, match_locality  # local import avoids a cycle

        low = text.lower()
        toks = tokens(text)
        scores: dict[str, tuple[int, str]] = {}
        for cat, subs in _KEYWORDS.items():
            hits = {sub: count_phrases(kws, toks) for sub, kws in subs.items()}
            scores[cat] = (sum(hits.values()), max(hits, key=hits.get))
        ranked = sorted(scores.items(), key=lambda kv: kv[1][0], reverse=True)
        category, sub_type = (ranked[0][0], ranked[0][1][1]) if ranked[0][1][0] > 0 else ("other", "other")
        lang = "hindi" if re.search(r"[ऀ-ॿ]", text) else (
            "hinglish" if re.search(r"\b(hai|nahi|ke|ki|me|mein|bhai|paani|sadak|kachra|gaya|gayi|raha|rahi)\b", low)
            else "english")
        if use_model:
            category, sub_type = self._choose_category(text, category, sub_type, ranked[0][1][0], lang)
        # A second department is involved only when its evidence is as strong as the main one's
        # ("road caved in because of a leaking pipe").
        runner_up = next((kv for kv in ranked if kv[0] != category), ranked[1])
        secondary = (runner_up[0] if category != "other" and runner_up[1][0] >= max(2, scores[category][0] / 2)
                     else None)

        duration = None
        m = re.search(r"(\d+|" + "|".join(_NUM_WORDS) + r")\s*(" + "|".join(_UNIT_DAYS) + r")\b", low)
        if m:
            n = int(m.group(1)) if m.group(1).isdigit() else _NUM_WORDS[m.group(1)]
            duration = n * _UNIT_DAYS[m.group(2)]

        safety = any(k in low for k in _SAFETY) or count_phrases(_SAFETY_FUZZY, toks) > 0
        severity = 2
        if duration and duration >= 7:
            severity += 1
        if safety:
            severity += 1
        if any(k in low for k in _SEVERE):
            severity += 1
        severity = min(severity, 5)

        loc_id = match_locality(text)
        detail = re.search(r"((gali|lane|street|sector|plot|house|block)\s*(no\.?|number)?\s*[-#]?\s*\w+|"
                           r"(near|opp\.?|opposite|ke paas|samne)\s+[\w ]{3,30})", low)
        loc_name = locality_by_id()[loc_id]["name"] if loc_id else None
        if detail:
            # "near opposite masjid in malviya nagar" -> "near opposite masjid"
            detail_text = re.split(r"\s+(?:in|at|me|mein|,)\s+|,", detail.group(0).strip())[0].strip()
        else:
            detail_text = None
        label = CATEGORIES[category]["label"].lower()
        summary = f"{sub_type.replace('_', ' ').capitalize()} ({label})" + (f" in {loc_name}" if loc_name else "")
        if detail_text:
            summary += f", {detail_text}"

        return _clean(Extraction(
            category=category, sub_type=sub_type, location_text=loc_name,
            location_detail=detail_text, duration_days=duration,
            severity=severity, severity_reason="Rule-based estimate from keywords and duration",
            safety_risk=safety, language=lang, summary_en=summary + ".", secondary_category=secondary,
        ))

    def _choose_category(self, text: str, kw_category: str, kw_sub: str, keyword_hits: int,
                         lang: str) -> tuple[str, str]:
        """The trained model knows how real citizens phrase complaints (English); the keyword rules cover
        Hindi/Hinglish. Trust the model when it is confident, else the keywords, else a weaker model guess."""
        from . import classifier

        pred = classifier.predict(text)
        if pred is None:
            return kw_category, kw_sub
        model_cat, p, _ = pred
        confident, fallback = self.THRESHOLDS.get(lang, self.THRESHOLDS["hinglish"])
        if keyword_hits >= 2:  # several specific keywords matched: only a near-certain model may disagree
            confident = max(confident, self.STRONG_KEYWORDS_OVERRIDE)
        if p >= confident or (keyword_hits == 0 and p >= fallback):
            if model_cat == kw_category:
                return kw_category, kw_sub  # agree: keep the keyword sub-type (it saw the exact phrase)
            return model_cat, classifier.predict_sub_type(text, model_cat) or "other"
        return kw_category, kw_sub


_NULLISH = {"", "null", "none", "n/a", "na", "unknown", "not specified", "not mentioned"}


def _clean(e: Extraction) -> Extraction:
    # Small models sometimes write the string "null" instead of null.
    for field in ("location_text", "location_detail"):
        if (getattr(e, field) or "").strip().lower() in _NULLISH:
            setattr(e, field, None)
    e.language = (e.language or "other").strip().lower()
    e.severity = max(1, min(5, int(e.severity)))
    if e.sub_type not in CATEGORIES[e.category]["sub_types"]:
        e.sub_type = "other"
    if e.duration_days is not None and e.duration_days < 0:
        e.duration_days = None
    if e.secondary_category in (e.category, "other"):
        e.secondary_category = None
    return e


# ----------------------------------------------------------------------------- selection

def claude_available() -> bool:
    import os
    return bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN") or os.getenv("ANTHROPIC_PROFILE"))


@lru_cache
def _extractors():
    rules = RuleExtractor()
    if config.EXTRACTOR == "ollama":
        return OllamaExtractor(), rules
    if config.EXTRACTOR == "rules" or (config.EXTRACTOR == "auto" and not claude_available()):
        return None, rules
    return ClaudeExtractor(), rules


def active_extractor_name() -> str:
    primary, _ = _extractors()
    return primary.name if primary else "rules"


def extract(text: str, image_b64: str | None = None, image_media_type: str | None = None) -> tuple[Extraction, str]:
    """Returns (extraction, extractor_used). Falls back to rules if the AI extractor errors."""
    primary, rules = _extractors()
    if primary:
        try:
            return primary.extract(text, image_b64, image_media_type), primary.name
        except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError, RuntimeError) as exc:
            if config.EXTRACTOR == "claude":
                raise
            log.warning("%s extraction failed (%s); using rule-based fallback", primary.name, exc)
    return rules.extract(text), rules.name
