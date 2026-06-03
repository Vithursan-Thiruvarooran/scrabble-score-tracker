const BASE_URL = import.meta.env.VITE_API_URL as string;

let onUnauthorized: (() => void) | undefined;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  // Parse JSON first (with fallback) so a malformed body never blocks the 401 handler.
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) onUnauthorized?.();
  if (!res.ok) throw new Error((data as { detail?: string }).detail ?? `Request failed: ${res.status}`);
  return data as T;
}
