import { useEffect, useState } from 'react';
import { socket } from '../../socket';
import type { PendingPlacements } from './GameBoard';

interface GameToolbarProps {
  gameId: string;
  pendingPlacements: PendingPlacements;
  isValidPlay: boolean;
  isMyTurn: boolean;
  onPlayed: () => void;
  onRecall: () => void;
}

export function GameToolbar({ gameId, pendingPlacements, isValidPlay, isMyTurn, onPlayed, onRecall }: GameToolbarProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear any stale error when the placement changes
  useEffect(() => {
    setError(null);
  }, [pendingPlacements]);

  function handlePlay() {
    if (pending) return;

    const tiles = Object.entries(pendingPlacements).map(([key, { letter }]) => {
      const [row, col] = key.split('-').map(Number);
      return { row, col, letter };
    });

    setPending(true);
    setError(null);

    socket.once('play_move_ok', () => {
      setPending(false);
      onPlayed();
    });

    socket.once('play_error', (payload: { message?: string }) => {
      setPending(false);
      setError(payload.message ?? 'Move was rejected.');
    });

    socket.emit('play_move', { game_id: gameId, move_type: 'place', tiles });
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-6 py-3">
        <span className="text-sm text-red-600 dark:text-red-400">
          {error ?? ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {Object.keys(pendingPlacements).length > 0 && (
            <button
              type="button"
              onClick={onRecall}
              disabled={pending}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 active:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Recall
            </button>
          )}
          {isValidPlay && (
            <button
              type="button"
              onClick={handlePlay}
              disabled={pending || !isMyTurn}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 active:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-600 dark:hover:bg-green-500"
            >
              {pending ? 'Playing…' : 'Play'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
