import { apiFetch } from './api';
import type { GameUser } from './user';

export type { GameUser } from './user';

export interface CreateGameParams {
  opponent: string;
  dictionary: string;
  board_type: string;
  turn_timer: boolean;
  duration: number | null;
  timeIncrement: number | null;
  online: boolean;
  disputes: boolean;
  dispute_timeout: number;
}

export interface GameStateSummary {
  turn: string | null;
  status: 'waiting' | 'active' | 'finished';
  last_move_at: string | null;
  scores: Record<string, number>;
}

export interface Game {
  id: string;
  user: GameUser;
  opponent: GameUser;
  dictionary: string;
  board_type: string;
  turn_timer: boolean;
  duration: number | null;
  timeIncrement: number | null;
  online: boolean;
  disputes: boolean;
  dispute_timeout: number;
  completed: boolean;
  winner: string | null;
  loser: string | null;
  userScore: number;
  opponentScore: number;
  date: string;
  game_state: GameStateSummary | null;
}

export interface PendingDispute {
  player: string;
  opponent: string;
  score: number;
  word: string;
  all_words: string[];
  expires_at: string; // ISO datetime string
}

export interface GameMove {
  move_number: number;
  move_type: 'initial' | 'place' | 'pass' | 'recycle' | 'resign' | 'dispute';
  player: string | null;
  tiles: { row: number; col: number; letter: string; is_blank?: boolean }[];
  recycled: string[];
  score: number;
  word: string;
  all_words: string[];
  rack: string[];
  tile_bag: string[];
  timestamp: string;
  dispute_status?: 'not_disputed' | 'valid' | 'invalid';
}

export interface GameState {
  game_id: string;
  players: string[];
  board: (string | null)[][];
  tile_bag: string[];
  racks: Record<string, string[]>;
  scores: Record<string, number>;
  turn: string;
  status: 'waiting' | 'active' | 'finished';
  winner: string | null;
  game_moves: GameMove[];
  pending_dispute: PendingDispute | null;
}

export async function createGame(params: CreateGameParams, token: string): Promise<{ room: string }> {
  const data = await apiFetch<Game>('/game/create', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  return { room: data.id };
}

export function getMyGames(token: string, completed?: boolean): Promise<Game[]> {
  const qs = completed !== undefined ? `?completed=${completed}` : '';
  return apiFetch<Game[]>(`/game/mine${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getGame(gameId: string, token: string): Promise<Game> {
  return apiFetch<Game>(`/game/${gameId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getGameState(gameId: string, token: string): Promise<GameState> {
  return apiFetch<GameState>(`/game/${gameId}/state`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getGameMoves(gameId: string, token: string): Promise<GameMove[]> {
  return apiFetch<GameMove[]>(`/game/${gameId}/moves`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
