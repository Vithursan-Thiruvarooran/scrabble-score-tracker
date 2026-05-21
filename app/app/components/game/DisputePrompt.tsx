import { useEffect, useState } from 'react';
import { socket } from '../../socket';

interface DisputePromptProps {
  gameId: string;
  words: string[];
  score: number;
  expiresAt: string; // ISO string
}

export function DisputePrompt({ gameId, words, score, expiresAt }: DisputePromptProps) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(id); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [secondsLeft > 0]);

  function resolve(dispute: boolean) {
    if (resolved) return;
    setResolved(true);
    socket.emit('resolve_dispute', { game_id: gameId, dispute });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 pb-safe backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-t-2xl bg-white dark:bg-gray-900 px-5 pt-5 pb-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Opponent played</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {words.length === 1 ? '1 word' : `${words.length} words`} · {score} pts
            </p>
          </div>
          {/* Countdown ring */}
          <div className="shrink-0 flex flex-col items-center">
            <span className={`text-xl font-bold tabular-nums ${secondsLeft <= 5 ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
              {secondsLeft}s
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-none">auto-accept</span>
          </div>
        </div>

        {/* Words list */}
        <div className="flex flex-wrap gap-1.5">
          {words.map((w) => (
            <span
              key={w}
              className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 text-sm font-semibold uppercase tracking-wide border border-amber-200 dark:border-amber-800"
            >
              {w}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => resolve(false)}
            disabled={resolved || secondsLeft === 0}
            className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => resolve(true)}
            disabled={resolved || secondsLeft === 0}
            className="flex-1 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white hover:bg-red-600 active:bg-red-700 disabled:opacity-40 transition-colors"
          >
            Dispute
          </button>
        </div>

        {resolved && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500">Waiting for server…</p>
        )}
      </div>
    </div>
  );
}
