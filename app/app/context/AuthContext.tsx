import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { connectSocket, disconnectSocket } from '../socket';
import { getMe, type AuthUser } from '../services/auth';

interface AuthContextValue {
  token: string;
  user: AuthUser | null;
  ready: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState('');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('auth_token') ?? '';
    if (stored) {
      connectSocket(stored);
      setToken(stored);
      getMe(stored).then(setUser).catch(() => {
        localStorage.removeItem('auth_token');
      });
    }
    setReady(true);
  }, []);

  const login = useCallback((newToken: string) => {
    localStorage.setItem('auth_token', newToken);
    connectSocket(newToken);
    setToken(newToken);
    getMe(newToken).then(setUser).catch(() => {});
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    disconnectSocket();
    setToken('');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
