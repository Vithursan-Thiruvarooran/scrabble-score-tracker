from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from models.user import UserOut


class GameBase(BaseModel):
    opponent: str
    dictionary: str = "TWL06"
    board_type: str = "standard"
    turn_timer: bool = False
    duration: Optional[int] = None
    timeIncrement: Optional[int] = None
    online: bool = True
    disputes: bool = False
    dispute_timeout: int = 60


class TilePlacement(BaseModel):
    row: int
    col: int
    letter: str


class GameMove(BaseModel):
    move_number: int
    move_type: str
    player: Optional[str] = None
    tiles: List[TilePlacement] = []
    recycled: List[str] = []
    score: int = 0
    word: str = ""
    all_words: List[str] = []
    rack: List[str] = []
    tile_bag: List[str] = []
    timestamp: str
    dispute_status: Optional[str] = None


class PendingDispute(BaseModel):
    player: str
    opponent: str
    score: int
    word: str
    all_words: List[str] = []
    expires_at: str
    tiles: List[dict] = []
    rack_before: List[str] = []
    move_number: int = 0
    timestamp: str = ""


class GameState(BaseModel):
    game_id: str
    players: List[str]
    board: List[List[Optional[str]]]
    tile_bag: List[str]
    racks: Dict[str, List[str]]
    scores: Dict[str, int]
    turn: str
    status: str
    winner: Optional[str] = None
    game_moves: List[GameMove] = []
    pending_dispute: Optional[PendingDispute] = None


class GameStateSummary(BaseModel):
    turn: Optional[str] = None
    status: str = "waiting"
    last_move_at: Optional[str] = None
    scores: Dict[str, int] = {}


class GameOut(BaseModel):
    id: str
    user: UserOut
    opponent: UserOut
    dictionary: str = "TWL06"
    board_type: str = "standard"
    turn_timer: bool = False
    duration: Optional[int] = None
    timeIncrement: Optional[int] = None
    online: bool = True
    disputes: bool = False
    completed: bool = False
    winner: Optional[str] = None
    loser: Optional[str] = None
    userScore: int = 0
    opponentScore: int = 0
    date: Optional[datetime] = None
    game_state: Optional[GameStateSummary] = None
