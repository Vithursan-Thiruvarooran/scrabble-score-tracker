import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { connectSocket, disconnectSocket } from '../socket';
import { getMe, type AuthUser } from '../services/auth';
import { setUnauthorizedHandler } from '../services/api';

interface AuthContextValue {
  token: string;
  user: AuthUser | null;
  ready: boolean;
  login: (token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState('');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    disconnectSocket();
    setToken('');
    setUser(null);
  }, []);

  useEffect(() => {
    // Register logout as the global 401 handler so any expired-token API call
    // automatically signs the user out.
    setUnauthorizedHandler(logout);

    const stored = localStorage.getItem('auth_token') ?? '';
    if (stored) {
      connectSocket(stored);
      setToken(stored);
      getMe(stored)
        .then(setUser)
        .catch(() => {
          // If the 401 handler already ran (token cleared from storage), skip the
          // second logout call — all state is already clean.
          if (localStorage.getItem('auth_token')) logout();
        })
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, [logout]);

  const login = useCallback((newToken: string) => {
    localStorage.setItem('auth_token', newToken);
    connectSocket(newToken);
    setToken(newToken);
    getMe(newToken).then(setUser).catch(() => {});
  }, []);

  const refreshUser = useCallback(async () => {
    const stored = localStorage.getItem('auth_token') ?? '';
    if (!stored) return;
    try {
      const updated = await getMe(stored);
      setUser(updated);
    } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, ready, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
