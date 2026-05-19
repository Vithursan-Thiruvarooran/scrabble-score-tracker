from __future__ import annotations

from typing import Dict, FrozenSet, List, Optional, Tuple

TILE_VALUES: Dict[str, int] = {
    'A': 1, 'B': 3, 'C': 3, 'D': 2, 'E': 1, 'F': 4,
    'G': 2, 'H': 4, 'I': 1, 'J': 8, 'K': 5, 'L': 1,
    'M': 3, 'N': 1, 'O': 1, 'P': 3, 'Q': 10, 'R': 1,
    'S': 1, 'T': 1, 'U': 1, 'V': 4, 'W': 4, 'X': 8,
    'Y': 4, 'Z': 10, '?': 0,
}

_TW: FrozenSet[Tuple[int, int]] = frozenset({
    (0, 0), (0, 7), (0, 14),
    (7, 0),          (7, 14),
    (14, 0), (14, 7), (14, 14),
})

_DW: FrozenSet[Tuple[int, int]] = frozenset(
    {(7, 7)}
    | {(r, c) for r in range(1, 5) for c in (r, 14 - r)}
    | {(r, c) for r in range(10, 14) for c in (r, 14 - r)}
)

_TL: FrozenSet[Tuple[int, int]] = frozenset({
    (1, 5), (1, 9),
    (5, 1), (5, 5), (5, 9), (5, 13),
    (9, 1), (9, 5), (9, 9), (9, 13),
    (13, 5), (13, 9),
})

_DL: FrozenSet[Tuple[int, int]] = frozenset({
    (0, 3), (0, 11),
    (2, 6), (2, 8),
    (3, 0), (3, 7), (3, 14),
    (6, 2), (6, 6), (6, 8), (6, 12),
    (7, 3), (7, 11),
    (8, 2), (8, 6), (8, 8), (8, 12),
    (11, 0), (11, 7), (11, 14),
    (12, 6), (12, 8),
    (14, 3), (14, 11),
})


def word_cells(
    board: List[List[Optional[str]]],
    row: int,
    col: int,
    dr: int,
    dc: int,
) -> List[Tuple[int, int]]:
    """Return all cells of the word passing through (row, col) in direction (dr, dc)."""
    r, c = row, col
    while 0 <= r - dr < 15 and 0 <= c - dc < 15 and board[r - dr][c - dc] is not None:
        r -= dr
        c -= dc
    cells: List[Tuple[int, int]] = []
    while 0 <= r < 15 and 0 <= c < 15 and board[r][c] is not None:
        cells.append((r, c))
        r += dr
        c += dc
    return cells


def _score_word(
    board: List[List[Optional[str]]],
    new_pos: FrozenSet[Tuple[int, int]],
    cells: List[Tuple[int, int]],
) -> int:
    letter_total = 0
    word_mult = 1
    for (r, c) in cells:
        letter = board[r][c]
        # Lowercase letters are blanks — they score 0; uppercase uses the standard table.
        val = TILE_VALUES.get(letter, 0) if letter else 0
        if (r, c) in new_pos:
            if (r, c) in _TL:
                val *= 3
            elif (r, c) in _DL:
                val *= 2
            if (r, c) in _TW:
                word_mult *= 3
            elif (r, c) in _DW:
                word_mult *= 2
        letter_total += val
    return letter_total * word_mult


def calculate_move_score(
    board: List[List[Optional[str]]],
    new_tiles: List[dict],
) -> int:
    """Score a placement after the board has been updated, including cross-words and bingo bonus."""
    if not new_tiles:
        return 0

    new_pos: FrozenSet[Tuple[int, int]] = frozenset((t["row"], t["col"]) for t in new_tiles)
    rows = {t["row"] for t in new_tiles}
    cols = {t["col"] for t in new_tiles}

    is_horizontal = len(rows) == 1
    is_vertical = len(cols) == 1

    total = 0
    scored: set = set()

    main_dirs = []
    if is_horizontal:
        main_dirs.append((0, 1))
    if is_vertical:
        main_dirs.append((1, 0))

    for dr, dc in main_dirs:
        r0, c0 = new_tiles[0]["row"], new_tiles[0]["col"]
        main = word_cells(board, r0, c0, dr, dc)
        if len(main) > 1:
            key = tuple(main)
            if key not in scored:
                scored.add(key)
                total += _score_word(board, new_pos, main)

        cdr, cdc = dc, dr
        for t in new_tiles:
            cross = word_cells(board, t["row"], t["col"], cdr, cdc)
            if len(cross) > 1:
                key = tuple(cross)
                if key not in scored:
                    scored.add(key)
                    total += _score_word(board, new_pos, cross)

    if len(new_tiles) == 7:
        total += 50

    return total


def extract_words(
    board: List[List[Optional[str]]],
    new_tiles: List[dict],
) -> Tuple[str, List[str]]:
    """Return (main_word, all_words) for a placement after the board is updated."""
    if not new_tiles:
        return "", []

    rows = {t["row"] for t in new_tiles}
    cols = {t["col"] for t in new_tiles}

    is_horizontal = len(rows) == 1
    is_vertical = len(cols) == 1

    main_dirs: List[Tuple[int, int]] = []
    if is_horizontal:
        main_dirs.append((0, 1))
    if is_vertical:
        main_dirs.append((1, 0))

    def cells_to_word(cells: List[Tuple[int, int]]) -> str:
        return "".join((board[r][c] or "").upper() for r, c in cells)

    words: List[str] = []
    seen: set = set()
    main_word = ""

    for dr, dc in main_dirs:
        r0, c0 = new_tiles[0]["row"], new_tiles[0]["col"]
        main_cells = word_cells(board, r0, c0, dr, dc)
        if len(main_cells) > 1:
            key = tuple(main_cells)
            if key not in seen:
                seen.add(key)
                w = cells_to_word(main_cells)
                if not main_word:
                    main_word = w
                words.append(w)

        cdr, cdc = dc, dr
        for t in new_tiles:
            cross = word_cells(board, t["row"], t["col"], cdr, cdc)
            if len(cross) > 1:
                key = tuple(cross)
                if key not in seen:
                    seen.add(key)
                    words.append(cells_to_word(cross))

    if not main_word:
        t0 = new_tiles[0]
        main_word = (board[t0["row"]][t0["col"]] or "").upper()

    return main_word, words
