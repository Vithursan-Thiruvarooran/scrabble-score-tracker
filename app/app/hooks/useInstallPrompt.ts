import { useEffect, useRef, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt(): {
  isAvailable: boolean;
  prompt: () => Promise<'accepted' | 'dismissed' | null>;
} {
  const [isAvailable, setIsAvailable] = useState(false);
  const deferredEvent = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      deferredEvent.current = e as BeforeInstallPromptEvent;
      setIsAvailable(true);
    }

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function prompt(): Promise<'accepted' | 'dismissed' | null> {
    if (!deferredEvent.current) return null;
    await deferredEvent.current.prompt();
    const { outcome } = await deferredEvent.current.userChoice;
    deferredEvent.current = null;
    setIsAvailable(false);
    return outcome;
  }

  return { isAvailable, prompt };
}
