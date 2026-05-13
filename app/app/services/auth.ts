import { apiFetch } from './api';

export interface AuthUser {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
  admin: boolean;
}

export function login(email: string, password: string): Promise<{ access_token: string }> {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function register(
  firstname: string,
  lastname: string,
  email: string,
  password: string,
): Promise<AuthUser> {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ firstname, lastname, email, password }),
  });
}

export function getMe(token: string): Promise<AuthUser> {
  return apiFetch('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}
