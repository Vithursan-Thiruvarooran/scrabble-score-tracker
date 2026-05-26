import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNotifications } from './NotificationContext';

interface ServiceWorkerUpdateContextValue {
  updateAvailable: boolean;
  applyUpdate: () => void;
  checkForUpdate: () => Promise<void>;
}

const ServiceWorkerUpdateContext = createContext<ServiceWorkerUpdateContextValue>({
  updateAvailable: false,
  applyUpdate: () => {},
  checkForUpdate: async () => {},
});

export function ServiceWorkerUpdateProvider({ children }: { children: React.ReactNode }) {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const { notify } = useNotifications();
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  const applyUpdate = useCallback(() => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
  }, [waitingWorker]);

  const checkForUpdate = useCallback(async () => {
    if (!regRef.current) return;
    await regRef.current.update();
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        regRef.current = reg;
        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener('statechange', () => {
            if (next.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(next);
              notify({
                key: 'sw-update',
                persistent: true,
                message: 'Update available',
                action: {
                  label: 'Reload',
                  onClick: () => next.postMessage({ type: 'SKIP_WAITING' }),
                },
              });
            }
          });
        });
      })
      .catch(() => {});
  }, [notify]);

  return (
    <ServiceWorkerUpdateContext.Provider value={{ updateAvailable: waitingWorker !== null, applyUpdate, checkForUpdate }}>
      {children}
    </ServiceWorkerUpdateContext.Provider>
  );
}

export function useSwUpdate() {
  return useContext(ServiceWorkerUpdateContext);
}
