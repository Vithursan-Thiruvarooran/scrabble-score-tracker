from __future__ import annotations

from typing import Dict, List, Optional, Set, Tuple

_DIRS: List[Tuple[int, int]] = [(-1, 0), (1, 0), (0, -1), (0, 1)]


def validate_rack_tiles(rack: List[str], letters: List[str]) -> Optional[str]:
    """Check every letter can be sourced from the rack; blanks ('?') fill gaps."""
    available = list(rack)
    for letter in letters:
        if letter in available:
            available.remove(letter)
        elif "?" in available:
            available.remove("?")
        else:
            return f"Tile '{letter}' is not in your rack."
    return None


def validate_placement(
    board: List[List[Optional[str]]],
    tiles: List[dict],
) -> Optional[str]:
    """
    Validate that a set of tiles can legally be placed on the board:
      - target cells must be empty
      - all tiles in the same row or the same column
      - no empty gaps between the first and last tile in the run
      - first move must cover center (7, 7); subsequent moves must touch an existing tile
    """
    if not tiles:
        return "No tiles provided."

    for t in tiles:
        if board[t["row"]][t["col"]] is not None:
            return f"Cell ({t['row']}, {t['col']}) is already occupied."

    positions: List[Tuple[int, int]] = [(t["row"], t["col"]) for t in tiles]
    pos_set: Set[Tuple[int, int]] = set(positions)
    rows: Set[int] = {r for r, _ in positions}
    cols: Set[int] = {c for _, c in positions}

    is_horizontal = len(rows) == 1
    is_vertical = len(cols) == 1

    if not is_horizontal and not is_vertical:
        return "Tiles must all be placed in the same row or the same column."

    if len(tiles) > 1:
        if is_horizontal:
            row = next(iter(rows))
            for c in range(min(cols), max(cols) + 1):
                if (row, c) not in pos_set and board[row][c] is None:
                    return "Tiles must form a consecutive sequence with no empty gaps."
        else:
            col = next(iter(cols))
            for r in range(min(rows), max(rows) + 1):
                if (r, col) not in pos_set and board[r][col] is None:
                    return "Tiles must form a consecutive sequence with no empty gaps."

    board_has_tiles = any(
        board[r][c] is not None for r in range(15) for c in range(15)
    )

    if not board_has_tiles:
        if not any(t["row"] == 7 and t["col"] == 7 for t in tiles):
            return "The first move must cover the center square (row 7, col 7)."
        return None

    connected = False

    if is_horizontal:
        row = next(iter(rows))
        for c in range(min(cols), max(cols) + 1):
            if (row, c) not in pos_set and board[row][c] is not None:
                connected = True
                break
    if not connected and is_vertical:
        col = next(iter(cols))
        for r in range(min(rows), max(rows) + 1):
            if (r, col) not in pos_set and board[r][col] is not None:
                connected = True
                break

    if not connected:
        for r, c in positions:
            for dr, dc in _DIRS:
                nr, nc = r + dr, c + dc
                if 0 <= nr < 15 and 0 <= nc < 15 and board[nr][nc] is not None:
                    connected = True
                    break
            if connected:
                break

    if not connected:
        return "Tiles must connect to existing tiles on the board."

    return None
