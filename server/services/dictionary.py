from __future__ import annotations

import logging
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

_word_sets: dict[str, set] = {}


def load_dictionaries() -> None:
    data_dir = Path(__file__).parent.parent / "data"
    for name in ["TWL06", "SOWPODS"]:
        path = data_dir / f"{name}.txt"
        if path.exists():
            _word_sets[name] = {w.strip().upper() for w in path.read_text().splitlines() if w.strip()}
        else:
            logger.warning("Dictionary file not found: %s — word validation disabled for %s", path, name)


def validate_words(words: List[str], dictionary: str = "TWL06") -> bool:
    word_set = _word_sets.get(dictionary) or _word_sets.get("TWL06", set())
    if not word_set:
        return True  # If no dictionary loaded, don't block
    return all(w.upper() in word_set for w in words)
