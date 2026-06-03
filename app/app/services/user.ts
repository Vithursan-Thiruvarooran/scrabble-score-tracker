import { apiFetch } from './api';

export interface GameUser {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
  admin: boolean;
}

export interface FriendRequest {
  id: string;
  userId: string;
  friendId: string;
  status: 'pending' | 'accepted';
}

export function getUser(userId: string, token: string): Promise<GameUser> {
  return apiFetch<GameUser>(`/users/${userId}`, {
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

export interface UserUpdateData {
  firstname?: string;
  lastname?: string;
  password?: string;
}

export function updateMe(token: string, data: UserUpdateData): Promise<GameUser> {
  return apiFetch<GameUser>('/users/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export function deleteMe(token: string): Promise<void> {
  return apiFetch('/users/me', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
