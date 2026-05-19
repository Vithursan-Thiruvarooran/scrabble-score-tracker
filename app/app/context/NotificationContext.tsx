import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface ToastOptions {
  message: string;
  action?: { label: string; to: string };
  key?: string;
}

interface Toast extends ToastOptions {
  id: number;
}

interface NotificationContextValue {
  toasts: Toast[];
  notify: (opts: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);
  const timeoutsRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const activeKeysRef = useRef(new Set<string>());

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => { timeouts.forEach(clearTimeout); };
  }, []);

  const dismiss = useCallback((id: number) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) clearTimeout(timeout);
    timeoutsRef.current.delete(id);
    setToasts((prev) => {
      const toast = prev.find((t) => t.id === id);
      if (toast?.key) activeKeysRef.current.delete(toast.key);
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const notify = useCallback((opts: ToastOptions) => {
    if (opts.key && activeKeysRef.current.has(opts.key)) return;
    if (opts.key) activeKeysRef.current.add(opts.key);
    const id = ++counterRef.current;
    setToasts((prev) => [...prev, { id, ...opts }]);
    const timeout = setTimeout(() => {
      if (opts.key) activeKeysRef.current.delete(opts.key);
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timeoutsRef.current.delete(id);
    }, AUTO_DISMISS_MS);
    timeoutsRef.current.set(id, timeout);
  }, []);

  return (
    <NotificationContext.Provider value={{ toasts, notify, dismiss }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
