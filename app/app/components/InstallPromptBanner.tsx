import { useState } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export function InstallPromptBanner() {
  const { isAvailable, prompt } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (!isAvailable || dismissed) return null;

  async function handleInstall() {
    setInstalling(true);
    await prompt();
    setInstalling(false);
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-20 pb-safe pointer-events-none">
      <div className="max-w-[440px] mx-auto pointer-events-auto">
        <div className="mx-3 mb-3 rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5">
            {/* Scrabble tile logo */}
            <div className="shrink-0 flex gap-0.5">
              {['S', 'C', 'R'].map((l, i) => (
                <span
                  key={i}
                  className="w-6 h-6 flex items-center justify-center bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold rounded text-xs shadow-sm"
                >
                  {l}
                </span>
              ))}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">Install the app</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight mt-0.5">For the best experience</p>
            </div>

            {/* Actions */}
            <div className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 px-1 py-1 transition-colors"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={handleInstall}
                disabled={installing}
                className="rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-white transition-colors shadow-sm"
              >
                {installing ? 'Installing…' : 'Install'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
