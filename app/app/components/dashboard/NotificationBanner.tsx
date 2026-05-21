import { useState } from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';

export function NotificationBanner() {
  const { permission, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || permission !== 'default') return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
      <div className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/50">
        <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
        </svg>
      </div>

      <p className="flex-1 text-xs text-amber-800 dark:text-amber-300 leading-snug">
        Get notified when it's your turn
      </p>

      <button
        type="button"
        onClick={subscribe}
        className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
      >
        Enable
      </button>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-200 transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
