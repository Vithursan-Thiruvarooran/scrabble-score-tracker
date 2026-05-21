import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribePush, unsubscribePush } from '../services/push';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied';

export function usePushNotifications() {
  const { token } = useAuth();
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  const [permission, setPermission] = useState<PushPermission>(() => {
    if (!supported) return 'unsupported';
    return Notification.permission as PushPermission;
  });

  // On mount: if already granted, re-register to keep backend in sync
  useEffect(() => {
    if (!supported || !token || !VAPID_PUBLIC_KEY) return;
    if (Notification.permission !== 'granted') return;

    navigator.serviceWorker.ready.then(async reg => {
      try {
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          await subscribePush(existing, token).catch(() => {});
        }
      } catch {
        // Ignore — best-effort sync
      }
    });
  }, [supported, token]);

  const subscribe = useCallback(async () => {
    if (!supported || !token || !VAPID_PUBLIC_KEY) return;
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      await subscribePush(sub, token);
    } catch (err) {
      console.error('Push subscribe failed:', err);
    }
  }, [supported, token]);

  const unsubscribe = useCallback(async () => {
    if (!supported || !token) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await unsubscribePush(sub, token);
      await sub.unsubscribe();
      setPermission('default');
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    }
  }, [supported, token]);

  return { permission, subscribe, unsubscribe };
}
