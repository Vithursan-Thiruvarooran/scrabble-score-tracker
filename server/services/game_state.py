from __future__ import annotations

import random
from datetime import datetime
from typing import Dict, FrozenSet, List, Optional, Tuple, Set

from bson import ObjectId

from db import get_db
from services.redis_cache import cache_state, evict_state, get_cached_state

# ---------------------------------------------------------------------------
# Scoring tables (mirror of GameBoard.tsx premium-square definitions)
# ---------------------------------------------------------------------------

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


def _word_cells(
    board: List[List[Optional[str]]],
    row: int,
    col: int,
    dr: int,
    dc: int,
) -> List[Tuple[int, int]]:
    """Return all cells of the word that passes through (row, col) in direction (dr, dc)."""
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
        val = TILE_VALUES.get(letter.upper(), 0) if letter else 0
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
    new_tiles: List[Dict],
) -> int:
    """
    Calculate the total Scrabble score for a move after the board has been updated.
    Accounts for the main word, all perpendicular cross-words, premium squares,
    and the 50-point bingo bonus for playing all 7 tiles.
    """
    if not new_tiles:
        return 0

    new_pos: FrozenSet[Tuple[int, int]] = frozenset((t["row"], t["col"]) for t in new_tiles)
    rows = {t["row"] for t in new_tiles}
    cols = {t["col"] for t in new_tiles}

    # A single tile is both horizontal and vertical — both cross-words will be checked.
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
        main = _word_cells(board, r0, c0, dr, dc)
        if len(main) > 1:
            key = tuple(main)
            if key not in scored:
                scored.add(key)
                total += _score_word(board, new_pos, main)

        # Perpendicular cross-words formed by each newly placed tile
        cdr, cdc = dc, dr
        for t in new_tiles:
            cross = _word_cells(board, t["row"], t["col"], cdr, cdc)
            if len(cross) > 1:
                key = tuple(cross)
                if key not in scored:
                    scored.add(key)
                    total += _score_word(board, new_pos, cross)

    if len(new_tiles) == 7:
        total += 50

    return total


# ---------------------------------------------------------------------------

TILE_DISTRIBUTION: List[str] = (
    ["A"] * 9 + ["B"] * 2 + ["C"] * 2 + ["D"] * 4 + ["E"] * 12
    + ["F"] * 2 + ["G"] * 3 + ["H"] * 2 + ["I"] * 9 + ["J"] * 1
    + ["K"] * 1 + ["L"] * 4 + ["M"] * 2 + ["N"] * 6 + ["O"] * 8
    + ["P"] * 2 + ["Q"] * 1 + ["R"] * 6 + ["S"] * 4 + ["T"] * 6
    + ["U"] * 4 + ["V"] * 2 + ["W"] * 2 + ["X"] * 1 + ["Y"] * 2
    + ["Z"] * 1 + ["?"] * 2
)


def _fresh_bag() -> List[str]:
    bag = TILE_DISTRIBUTION.copy()
    random.shuffle(bag)
    return bag


def _empty_board() -> List[List[Optional[str]]]:
    return [[None] * 15 for _ in range(15)]


def build_initial_state(creator_id: str) -> dict:
    bag = _fresh_bag()
    rack, bag = bag[:7], bag[7:]
    return {
        "players": [creator_id],
        "board": _empty_board(),
        "tile_bag": bag,
        "racks": {creator_id: rack},
        "scores": {creator_id: 0},
        "turn": creator_id,
        "status": "waiting",
        "last_move": None,
    }


async def get_game_state(game_id: str) -> Optional[dict]:
    # Redis first — warm path during active play
    state = await get_cached_state(game_id)
    if state is not None:
        return state

    # MongoDB fallback — cold start or cache miss
    db = get_db()
    game = await db.games.find_one({"_id": ObjectId(game_id)}, {"game_state": 1})
    if not game:
        return None

    state = game.get("game_state")
    if state:
        await cache_state(game_id, state)
    return state


async def add_player_to_state(game_id: str, player_id: str) -> Optional[dict]:
    """Deal tiles to a second player and mark the game active. No-ops if the player is already in."""
    # Always read from MongoDB here — player roster is authoritative in DB
    db = get_db()
    game = await db.games.find_one({"_id": ObjectId(game_id)})
    if not game:
        return None

    state = game.get("game_state")
    if not state:
        return None

    players: List[str] = state["players"]

    if player_id in players:
        return state

    if len(players) >= 2:
        return None  # room full

    bag: List[str] = state["tile_bag"]
    rack, bag = bag[:7], bag[7:]

    players.append(player_id)
    state["players"] = players
    state["tile_bag"] = bag
    state["racks"][player_id] = rack
    state["scores"][player_id] = 0
    state["status"] = "active"

    await db.games.update_one(
        {"_id": ObjectId(game_id)},
        {"$set": {"game_state": state}},
    )
    await cache_state(game_id, state)
    return state


# ---------------------------------------------------------------------------
# Internal helpers shared across all move handlers
# ---------------------------------------------------------------------------

async def _load_state(game_id: str) -> Optional[dict]:
    state = await get_cached_state(game_id)
    if state is not None:
        return state
    db = get_db()
    doc = await db.games.find_one({"_id": ObjectId(game_id)}, {"game_state": 1})
    if not doc:
        return None
    state = doc.get("game_state")
    if state:
        await cache_state(game_id, state)
    return state


async def _persist(game_id: str, state: dict) -> None:
    """Fast-write to Redis, then durably persist to MongoDB."""
    await cache_state(game_id, state)
    db = get_db()
    await db.games.update_one(
        {"_id": ObjectId(game_id)},
        {"$set": {"game_state": state}},
    )


def _advance_turn(state: dict, player_id: str) -> None:
    players: List[str] = state["players"]
    state["turn"] = players[(players.index(player_id) + 1) % len(players)]


def _validate_rack_tiles(rack: List[str], letters: List[str]) -> Optional[str]:
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


_DIRS: List[Tuple[int, int]] = [(-1, 0), (1, 0), (0, -1), (0, 1)]


def _validate_placement(
    board: List[List[Optional[str]]],
    tiles: List[Dict],
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

    # Contiguity — gaps between the first and last tile must be filled by existing board tiles
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

    # Subsequent moves — must touch at least one committed tile
    connected = False

    # An existing tile that fills a gap in the run counts as a connection
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


# ---------------------------------------------------------------------------
# Public move handlers — each returns (updated_state_or_current, error_or_None)
# ---------------------------------------------------------------------------

async def apply_place(
    game_id: str,
    player_id: str,
    tiles: List[Dict],  # [{"row": int, "col": int, "letter": str}]
) -> Tuple[Optional[dict], Optional[str]]:
    state = await _load_state(game_id)
    if not state:
        return None, "Game not found."
    if state.get("status") != "active":
        return state, "Game is not active."
    if state.get("turn") != player_id:
        return state, "It is not your turn."

    rack: List[str] = list(state["racks"].get(player_id, []))
    board: List[List[Optional[str]]] = state["board"]

    err = _validate_rack_tiles(rack, [t["letter"] for t in tiles])
    if err:
        return state, err

    err = _validate_placement(board, tiles)
    if err:
        return state, err

    # Place tiles on board and consume from rack
    for t in tiles:
        letter: str = t["letter"]
        board[t["row"]][t["col"]] = letter
        if letter in rack:
            rack.remove(letter)
        elif "?" in rack:
            rack.remove("?")

    score = calculate_move_score(board, tiles)

    bag: List[str] = state["tile_bag"]
    draw = min(7 - len(rack), len(bag))
    rack.extend(bag[:draw])
    bag = bag[draw:]

    state["scores"][player_id] = state["scores"].get(player_id, 0) + score
    state["board"] = board
    state["racks"][player_id] = rack
    state["tile_bag"] = bag
    state["last_move"] = {
        "player": player_id,
        "move_type": "place",
        "tiles": tiles,
        "score": score,
        "timestamp": datetime.utcnow().isoformat(),
    }
    _advance_turn(state, player_id)

    await _persist(game_id, state)
    return state, None


async def apply_pass(
    game_id: str,
    player_id: str,
) -> Tuple[Optional[dict], Optional[str]]:
    state = await _load_state(game_id)
    if not state:
        return None, "Game not found."
    if state.get("status") != "active":
        return state, "Game is not active."
    if state.get("turn") != player_id:
        return state, "It is not your turn."

    state["last_move"] = {
        "player": player_id,
        "move_type": "pass",
        "tiles": [],
        "score": 0,
        "timestamp": datetime.utcnow().isoformat(),
    }
    _advance_turn(state, player_id)

    await _persist(game_id, state)
    return state, None


async def apply_recycle(
    game_id: str,
    player_id: str,
    letters: List[str],  # letters from the rack to exchange
) -> Tuple[Optional[dict], Optional[str]]:
    state = await _load_state(game_id)
    if not state:
        return None, "Game not found."
    if state.get("status") != "active":
        return state, "Game is not active."
    if state.get("turn") != player_id:
        return state, "It is not your turn."

    rack: List[str] = list(state["racks"].get(player_id, []))
    bag: List[str] = list(state["tile_bag"])

    if len(bag) < len(letters):
        return state, "Not enough tiles in the bag to recycle."

    err = _validate_rack_tiles(rack, letters)
    if err:
        return state, err

    # Remove recycled tiles from rack
    for letter in letters:
        if letter in rack:
            rack.remove(letter)
        elif "?" in rack:
            rack.remove("?")

    # Return tiles to bag, shuffle, then draw the same number back
    bag.extend(letters)
    random.shuffle(bag)
    draw = min(len(letters), len(bag))
    rack.extend(bag[:draw])
    bag = bag[draw:]

    state["racks"][player_id] = rack
    state["tile_bag"] = bag
    state["last_move"] = {
        "player": player_id,
        "move_type": "recycle",
        "tiles": [],
        "score": 0,
        "timestamp": datetime.utcnow().isoformat(),
    }
    _advance_turn(state, player_id)

    await _persist(game_id, state)
    return state, None


async def apply_resign(
    game_id: str,
    player_id: str,
) -> Tuple[Optional[dict], Optional[str]]:
    state = await _load_state(game_id)
    if not state:
        return None, "Game not found."
    if state.get("status") != "active":
        return state, "Game is not active."
    if player_id not in state.get("players", []):
        return state, "You are not a player in this game."

    players: List[str] = state["players"]
    winner = next((p for p in players if p != player_id), None)

    state["status"] = "finished"
    if winner:
        state["turn"] = winner
    state["last_move"] = {
        "player": player_id,
        "move_type": "resign",
        "tiles": [],
        "score": 0,
        "timestamp": datetime.utcnow().isoformat(),
    }

    await _persist(game_id, state)
    return state, None
