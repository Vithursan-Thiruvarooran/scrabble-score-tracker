import { apiFetch } from './api';

export interface GameUser {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
  admin: boolean;
}

export interface CreateGameParams {
  opponent: string;
  dictionary: string;
  board_type: string;
  turn_timer: boolean;
  duration: number | null;
  timeIncrement: number | null;
  online: boolean;
  disputes: boolean;
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
  completed: boolean;
  winner: string | null;
  loser: string | null;
  userScore: number;
  opponentScore: number;
  date: string;
  time: string;
}

export function getUser(userId: string, token: string): Promise<GameUser> {
  return apiFetch(`/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getFriends(token: string): Promise<GameUser[]> {
  return apiFetch<GameUser[]>('/users/friends', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getAllUsers(token: string): Promise<GameUser[]> {
  return apiFetch<GameUser[]>('/users', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface FriendRequest {
  id: string;
  userId: string;
  friendId: string;
  status: 'pending' | 'accepted';
}

export function addFriend(friendId: string, token: string): Promise<void> {
  return apiFetch('/users/addFriend', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ friendId }),
  });
}

export function getFriendRequests(token: string): Promise<FriendRequest[]> {
  return apiFetch<FriendRequest[]>('/users/friendRequests', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function acceptFriend(id: string, token: string): Promise<void> {
  return apiFetch('/users/acceptFriend', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id }),
  });
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

export interface GameMove {
  move_number: number;
  move_type: 'initial' | 'place' | 'pass' | 'recycle' | 'resign';
  player: string | null;
  tiles: { row: number; col: number; letter: string; is_blank?: boolean }[];
  recycled: string[];
  score: number;
  word: string;
  all_words: string[];
  rack: string[];
  tile_bag: string[];
  timestamp: string;
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
}

export function getGameState(gameId: string, token: string): Promise<GameState> {
  return apiFetch<GameState>(`/game/${gameId}/state`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
