from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from models.user import UserOut


class GameBase(BaseModel):
    opponent: str
    duration: int
    timeIncrement: int


class TilePlacement(BaseModel):
    row: int
    col: int
    letter: str


class Move(BaseModel):
    player: str
    tiles: List[TilePlacement]
    score: int
    timestamp: str


class GameState(BaseModel):
    game_id: str
    players: List[str]
    board: List[List[Optional[str]]]
    tile_bag: List[str]
    racks: Dict[str, List[str]]
    scores: Dict[str, int]
    turn: str
    status: str
    last_move: Optional[Move] = None


class GameOut(BaseModel):
    id: str
    user: UserOut
    opponent: UserOut
    duration: int
    timeIncrement: int
    completed: bool = False
    winner: Optional[str] = None
    loser: Optional[str] = None
    userScore: int = 0
    opponentScore: int = 0
    date: Optional[datetime] = None
    time: Optional[datetime] = None
