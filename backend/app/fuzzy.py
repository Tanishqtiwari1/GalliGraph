"""Typo-tolerant phrase matching for the offline extractor and gazetteer ("pothle" ~ "pothole")."""
import re
from difflib import SequenceMatcher
from functools import lru_cache

_TOKEN = re.compile(r"[a-z0-9ऀ-ॿ]+")


def tokens(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


@lru_cache(maxsize=100_000)
def _sim(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if abs(len(a) - len(b)) > 2:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _word_ok(tok: str, word: str) -> bool:
    if tok == word:
        return True
    if len(word) < 5 or not word.isascii():
        return False  # short words ("nal" tap vs "nali" drain) and Devanagari must match exactly
    return _sim(tok, word) >= (0.8 if len(word) < 7 else 0.75)


def phrase_in(phrase: str, toks: list[str]) -> bool:
    """True if every word of `phrase` appears consecutively in `toks` (fuzzily)."""
    words = tokens(phrase)
    if not words:
        return False
    n = len(words)
    for i in range(len(toks) - n + 1):
        if all(_word_ok(toks[i + j], words[j]) for j in range(n)):
            return True
    # Tolerate a split/merged word: "raja park" vs "rajapark", "pot hole" vs "pothole"
    if n <= 2:
        joined = "".join(words)
        for i in range(len(toks)):
            for span in (1, 2):
                if i + span <= len(toks) and len(joined) >= 6 and _sim("".join(toks[i:i + span]), joined) >= 0.85:
                    return True
    return False


def count_phrases(phrases: list[str], toks: list[str]) -> int:
    return sum(phrase_in(p, toks) for p in phrases)
