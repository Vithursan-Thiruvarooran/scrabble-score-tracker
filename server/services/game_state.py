from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from bson import ObjectId

from db import get_db
from services.redis_cache import cache_state, get_cached_state
from services.scoring import calculate_move_score, extract_words
from services.rules import validate_placement, validate_rack_tiles
from services.dictionary import validate_words
from services.dispute_timers import schedule_dispute_timeout, cancel_dispute_timeout

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


def build_initial_state(creator_id: str, disputes: bool = False, dispute_timeout: int = 60, dictionary: str = "TWL06") -> dict:
    bag = _fresh_bag()
    initial_bag = list(bag)
    rack, bag = bag[:7], bag[7:]
    return {
        "players": [creator_id],
        "board": _empty_board(),
        "tile_bag": bag,
        "racks": {creator_id: rack},
        "scores": {creator_id: 0},
        "turn": creator_id,
        "status": "waiting",
        "winner": None,
        "game_moves": [{
            "move_number": 0,
            "move_type": "initial",
            "player": None,
            "tiles": [],
            "recycled": [],
            "score": 0,
            "word": "",
            "all_words": [],
            "rack": [],
            "tile_bag": initial_bag,
            "timestamp": datetime.utcnow().isoformat(),
        }],
        "consecutive_passes": 0,
        "disputes": disputes,
        "dispute_timeout": dispute_timeout,
        "dictionary": dictionary,
        "pending_dispute": None,
    }


async def get_game_state(game_id: str) -> Optional[dict]:
    state = await get_cached_state(game_id)
    if state is not None:
        return state

    db = get_db()
    game = await db.games.find_one({"_id": ObjectId(game_id)}, {"game_state": 1})
    if not game:
        return None

    state = game.get("game_state")
    if state:
        await cache_state(game_id, state)
    return state


async def add_player_to_state(game_id: str, player_id: str) -> Optional[dict]:
    """Deal tiles to a second player and mark the game active. No-ops if player is already in."""
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
        return None

    bag: List[str] = state["tile_bag"]
    rack, bag = bag[:7], bag[7:]

    players.append(player_id)
    state["players"] = players
    state["tile_bag"] = bag
    state["racks"][player_id] = rack
    state["scores"][player_id] = 0
    state["status"] = "active"
    non_initial = [m for m in state.get("game_moves", []) if m.get("move_type") != "initial"]
    if non_initial:
        state["turn"] = player_id

    await db.games.update_one(
        {"_id": ObjectId(game_id)},
        {"$set": {"game_state": state}},
    )
    await cache_state(game_id, state)
    return state


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _persist(game_id: str, state: dict, dispute_move_number: Optional[int] = None) -> None:
    """Fast-write to Redis, then durably persist to MongoDB."""
    await cache_state(game_id, state)
    db = get_db()
    fields: dict = {"game_state": state}
    if state.get("status") == "finished":
        game = await db.games.find_one({"_id": ObjectId(game_id)}, {"user": 1, "opponent": 1})
        if game:
            scores = state.get("scores", {})
            winner_id = state.get("winner")
            players: List[str] = state.get("players", [])
            loser_id = next((p for p in players if p != winner_id), None) if winner_id else None
            fields.update({
                "completed": True,
                "winner": winner_id,
                "loser": loser_id,
                "userScore": scores.get(game["user"], 0),
                "opponentScore": scores.get(game["opponent"], 0),
            })
    await db.games.update_one({"_id": ObjectId(game_id)}, {"$set": fields})

    moves = state.get("game_moves", [])
    if dispute_move_number is not None:
        place_move = next((m for m in moves if m.get("move_number") == dispute_move_number), None)
        if place_move:
            move_doc = {"game_id": game_id, "user_id": place_move.get("player"), **place_move}
            await db.moves.update_one(
                {"game_id": game_id, "move_number": dispute_move_number},
                {"$set": move_doc},
                upsert=True,
            )
        if moves:
            last_move = moves[-1]
            if last_move.get("move_type") == "dispute":
                move_doc = {"game_id": game_id, "user_id": last_move.get("player"), **last_move}
                await db.moves.update_one(
                    {"game_id": game_id, "move_number": last_move["move_number"]},
                    {"$set": move_doc},
                    upsert=True,
                )
    elif moves:
        last_move = moves[-1]
        if last_move.get("move_type") != "initial":
            move_doc = {"game_id": game_id, "user_id": last_move.get("player"), **last_move}
            await db.moves.update_one(
                {"game_id": game_id, "move_number": last_move["move_number"]},
                {"$set": move_doc},
                upsert=True,
            )


def _advance_turn(state: dict, player_id: str) -> None:
    players: List[str] = state["players"]
    state["turn"] = players[(players.index(player_id) + 1) % len(players)]


def _finish_game(state: dict) -> None:
    """Mark the game finished. Sets winner to None on a tie."""
    state["status"] = "finished"
    players: List[str] = state["players"]
    scores: Dict = state["scores"]
    high = max(scores.get(p, 0) for p in players)
    leaders = [p for p in players if scores.get(p, 0) == high]
    state["winner"] = leaders[0] if len(leaders) == 1 else None


def _check_game_over_after_place(state: dict, player_id: str) -> bool:
    """Finish the game when the bag is empty and the active player's rack is empty."""
    if state["tile_bag"] or state["racks"].get(player_id):
        return False
    _finish_game(state)
    return True


def _commit_pending_place(state: dict, pending: dict) -> None:
    """Draw replacement tiles and credit score. Called when dispute is resolved without revert."""
    player_id: str = pending["player"]
    rack: List[str] = list(state["racks"].get(player_id, []))
    bag: List[str] = state["tile_bag"]
    draw = min(7 - len(rack), len(bag))
    rack.extend(bag[:draw])
    state["tile_bag"] = bag[draw:]
    state["racks"][player_id] = rack
    state["scores"][player_id] = state["scores"].get(player_id, 0) + pending["score"]


def _revert_pending_place(state: dict, pending: dict) -> None:
    """Remove placed tiles from board and restore player's rack."""
    for t in pending["tiles"]:
        state["board"][t["row"]][t["col"]] = None
    state["racks"][pending["player"]] = list(pending["rack_before"])



# ---------------------------------------------------------------------------
# Public move handlers — each returns (updated_state_or_current, error_or_None)
# ---------------------------------------------------------------------------

async def apply_place(
    game_id: str,
    player_id: str,
    tiles: List[dict],
) -> Tuple[Optional[dict], Optional[str]]:
    state = await get_game_state(game_id)
    if not state:
        return None, "Game not found."
    status = state.get("status")
    _players: List[str] = state.get("players", [])
    if status == "finished":
        return state, "Game is already finished."
    if status == "waiting":
        if len(_players) != 1 or _players[0] != player_id:
            return state, "Game is not active."
        already_played = any(m.get("move_type") != "initial" for m in state.get("game_moves", []))
        if already_played:
            return state, "Waiting for opponent to join before your next turn."
    elif status != "active":
        return state, "Game is not active."
    if state.get("turn") != player_id:
        return state, "It is not your turn."
    if state.get("pending_dispute"):
        return state, "A dispute is pending resolution."

    rack: List[str] = list(state["racks"].get(player_id, []))
    rack_before: List[str] = list(rack)
    board: List[List[Optional[str]]] = state["board"]

    available = list(rack)
    for t in tiles:
        letter: str = t["letter"].upper()
        is_blank: bool = bool(t.get("is_blank", False))
        if is_blank:
            if "?" not in available:
                return state, f"You don't have a blank tile to play as '{letter}'."
            available.remove("?")
        else:
            if letter in available:
                available.remove(letter)
            elif "?" in available:
                available.remove("?")
            else:
                return state, f"Tile '{letter}' is not in your rack."

    err = validate_placement(board, tiles)
    if err:
        return state, err

    # Blank tiles stored as lowercase so scoring gives them 0 value.
    for t in tiles:
        letter = t["letter"].upper()
        is_blank = bool(t.get("is_blank", False))
        board[t["row"]][t["col"]] = letter.lower() if is_blank else letter
        if is_blank:
            rack.remove("?")
        elif letter in rack:
            rack.remove(letter)
        elif "?" in rack:
            rack.remove("?")

    score = calculate_move_score(board, tiles)
    word, all_words = extract_words(board, tiles)

    state["board"] = board
    state["racks"][player_id] = rack
    state["consecutive_passes"] = 0

    if state.get("disputes"):
        players: List[str] = state["players"]
        opponent = next((p for p in players if p != player_id), None)
        timeout: int = state.get("dispute_timeout", 60)
        now_dt = datetime.utcnow()
        state["pending_dispute"] = {
            "player": player_id,
            "opponent": opponent,
            "tiles": tiles,
            "score": score,
            "word": word,
            "all_words": all_words,
            "rack_before": rack_before,
            "move_number": len(state["game_moves"]),
            "timestamp": now_dt.isoformat(),
            "expires_at": (now_dt + timedelta(seconds=timeout)).isoformat(),
        }
        state["turn"] = opponent
        await _persist(game_id, state)
        from sockets import sio as _sio
        schedule_dispute_timeout(game_id, timeout, apply_resolve_dispute, _sio.emit)
        return state, None
    else:
        bag: List[str] = state["tile_bag"]
        draw = min(7 - len(rack), len(bag))
        rack.extend(bag[:draw])
        bag = bag[draw:]

        state["scores"][player_id] = state["scores"].get(player_id, 0) + score
        state["racks"][player_id] = rack
        state["tile_bag"] = bag
        state["game_moves"].append({
            "move_number": len(state["game_moves"]),
            "move_type": "place",
            "player": player_id,
            "tiles": tiles,
            "recycled": [],
            "score": score,
            "word": word,
            "all_words": all_words,
            "rack": rack_before,
            "tile_bag": list(bag),
            "timestamp": datetime.utcnow().isoformat(),
        })

        if not _check_game_over_after_place(state, player_id):
            _advance_turn(state, player_id)

        await _persist(game_id, state)
        return state, None


async def apply_pass(
    game_id: str,
    player_id: str,
) -> Tuple[Optional[dict], Optional[str]]:
    state = await get_game_state(game_id)
    if not state:
        return None, "Game not found."
    if state.get("status") != "active":
        return state, "Game is not active."
    if state.get("turn") != player_id:
        return state, "It is not your turn."

    consecutive = state.get("consecutive_passes", 0) + 1
    state["consecutive_passes"] = consecutive
    state["game_moves"].append({
        "move_number": len(state["game_moves"]),
        "move_type": "pass",
        "player": player_id,
        "tiles": [],
        "recycled": [],
        "score": 0,
        "word": "",
        "all_words": [],
        "rack": list(state["racks"].get(player_id, [])),
        "tile_bag": list(state["tile_bag"]),
        "timestamp": datetime.utcnow().isoformat(),
    })

    if consecutive >= len(state["players"]) * 3:
        _finish_game(state)
    else:
        _advance_turn(state, player_id)

    await _persist(game_id, state)
    return state, None


async def apply_recycle(
    game_id: str,
    player_id: str,
    letters: List[str],
) -> Tuple[Optional[dict], Optional[str]]:
    state = await get_game_state(game_id)
    if not state:
        return None, "Game not found."
    if state.get("status") != "active":
        return state, "Game is not active."
    if state.get("turn") != player_id:
        return state, "It is not your turn."

    rack: List[str] = list(state["racks"].get(player_id, []))
    rack_before: List[str] = list(rack)
    bag: List[str] = list(state["tile_bag"])

    if len(bag) < len(letters):
        return state, "Not enough tiles in the bag to recycle."

    err = validate_rack_tiles(rack, letters)
    if err:
        return state, err

    for letter in letters:
        if letter in rack:
            rack.remove(letter)
        elif "?" in rack:
            rack.remove("?")

    bag.extend(letters)
    random.shuffle(bag)
    draw = min(len(letters), len(bag))
    rack.extend(bag[:draw])
    bag = bag[draw:]

    state["racks"][player_id] = rack
    state["tile_bag"] = bag
    state["consecutive_passes"] = 0
    state["game_moves"].append({
        "move_number": len(state["game_moves"]),
        "move_type": "recycle",
        "player": player_id,
        "tiles": [],
        "recycled": letters,
        "score": 0,
        "word": "",
        "all_words": [],
        "rack": rack_before,
        "tile_bag": list(bag),
        "timestamp": datetime.utcnow().isoformat(),
    })
    _advance_turn(state, player_id)

    await _persist(game_id, state)
    return state, None


async def apply_resign(
    game_id: str,
    player_id: str,
) -> Tuple[Optional[dict], Optional[str]]:
    state = await get_game_state(game_id)
    if not state:
        return None, "Game not found."
    if state.get("status") != "active":
        return state, "Game is not active."
    if player_id not in state.get("players", []):
        return state, "You are not a player in this game."

    players: List[str] = state["players"]
    winner = next((p for p in players if p != player_id), None)

    state["status"] = "finished"
    state["winner"] = winner
    state["game_moves"].append({
        "move_number": len(state["game_moves"]),
        "move_type": "resign",
        "player": player_id,
        "tiles": [],
        "recycled": [],
        "score": 0,
        "word": "",
        "all_words": [],
        "rack": list(state["racks"].get(player_id, [])),
        "tile_bag": list(state["tile_bag"]),
        "timestamp": datetime.utcnow().isoformat(),
    })

    await _persist(game_id, state)
    return state, None


async def apply_resolve_dispute(
    game_id: str,
    resolver_id: Optional[str],
    dispute: bool,
) -> Tuple[Optional[dict], Optional[str]]:
    """
    Resolve a pending dispute.
    resolver_id=None means the auto-accept timer fired.
    dispute=False → accept move. dispute=True → challenge.
    """
    state = await get_game_state(game_id)
    if not state:
        return None, "Game not found."

    pending = state.get("pending_dispute")
    if not pending:
        return state, "No pending dispute."

    if resolver_id is not None and resolver_id != pending.get("opponent"):
        return state, "Only the opponent can resolve a dispute."

    player_id: str = pending["player"]
    move_number: int = pending["move_number"]
    now_str = datetime.utcnow().isoformat()

    state["pending_dispute"] = None

    if not dispute:
        # ── No challenge: commit normally ──
        dispute_status = "not_disputed"
        _commit_pending_place(state, pending)
        if not _check_game_over_after_place(state, player_id):
            _advance_turn(state, player_id)

    else:
        # ── Challenge filed: validate words ──
        words_valid = validate_words(pending.get("all_words", []), state.get("dictionary", "TWL06"))
        if words_valid:
            # Words OK → commit, disputer loses their turn
            dispute_status = "valid"
            _commit_pending_place(state, pending)
            state["turn"] = player_id  # placer goes again
        else:
            # Words invalid → revert
            dispute_status = "invalid"
            _revert_pending_place(state, pending)
            _advance_turn(state, player_id)  # turn to disputer

    # Append place move record
    actual_score = pending["score"] if dispute_status != "invalid" else 0
    state["game_moves"].append({
        "move_number": move_number,
        "move_type": "place",
        "player": player_id,
        "tiles": pending["tiles"],
        "recycled": [],
        "score": actual_score,
        "word": pending.get("word", ""),
        "all_words": pending.get("all_words", []),
        "rack": pending.get("rack_before", []),
        "tile_bag": list(state["tile_bag"]),
        "dispute_status": dispute_status,
        "timestamp": pending.get("timestamp", now_str),
    })

    # Append dispute move record (only when actually challenged)
    if dispute and resolver_id is not None:
        state["game_moves"].append({
            "move_number": len(state["game_moves"]),
            "move_type": "dispute",
            "player": resolver_id,
            "tiles": [],
            "recycled": [],
            "score": 0,
            "word": "",
            "all_words": pending.get("all_words", []),
            "rack": list(state["racks"].get(resolver_id, [])),
            "tile_bag": list(state["tile_bag"]),
            "dispute_status": dispute_status,
            "timestamp": now_str,
        })

    await _persist(game_id, state, dispute_move_number=move_number)
    return state, None
