import { useEffect, useState } from 'react';
import { socket } from '../../socket';
import type { PendingPlacements } from './GameBoard';

interface GameToolbarProps {
  gameId: string;
  pendingPlacements: PendingPlacements;
  recycleIndices: number[];
  myRack: string[];
  isValidPlay: boolean;
  isMyTurn: boolean;
  isGameActive: boolean;
  isRecycleOpen: boolean;
  onPlayed: () => void;
  onRecycled: () => void;
  onRecall: () => void;
  onToggleRecycle: () => void;
}

export function GameToolbar({
  gameId,
  pendingPlacements,
  recycleIndices,
  myRack,
  isValidPlay,
  isMyTurn,
  isGameActive,
  isRecycleOpen,
  onPlayed,
  onRecycled,
  onRecall,
  onToggleRecycle,
}: GameToolbarProps) {
  const [pendingMove, setPendingMove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [pendingPlacements, recycleIndices]);

  function emitMove(moveType: string, extra: Record<string, unknown>, onSuccess: () => void) {
    if (pendingMove) return;
    setPendingMove(moveType);
    setError(null);

    function onOk() {
      socket.off('play_error', onErr);
      setPendingMove(null);
      onSuccess();
    }
    function onErr(payload: { message?: string }) {
      socket.off('play_move_ok', onOk);
      setPendingMove(null);
      setError(payload.message ?? 'Move was rejected.');
    }

    socket.once('play_move_ok', onOk);
    socket.once('play_error', onErr);
    socket.emit('play_move', { game_id: gameId, move_type: moveType, ...extra });
  }

  function handlePlay() {
    const tiles = Object.entries(pendingPlacements).map(([key, { letter, isBlank }]) => {
      const [row, col] = key.split('-').map(Number);
      return { row, col, letter, is_blank: isBlank ?? false };
    });
    emitMove('place', { tiles }, onPlayed);
  }

  function handlePass() {
    emitMove('pass', {}, () => {});
  }

  function handleRecycle() {
    const tiles = recycleIndices.map((i) => myRack[i]);
    emitMove('recycle', { tiles }, onRecycled);
  }

  const isBusy = pendingMove !== null;
  const hasStagedTiles = Object.keys(pendingPlacements).length > 0 || recycleIndices.length > 0;
  const canAct = isMyTurn && isGameActive && !isBusy;
  const hasExchangeTiles = isRecycleOpen && recycleIndices.length > 0;

  // Exchange can always be clicked to close an empty zone; needs canAct otherwise
  const exchangeDisabled = isBusy || (!canAct && !(isRecycleOpen && !hasExchangeTiles));

  function handleExchangeClick() {
    if (hasExchangeTiles) {
      handleRecycle();
    } else {
      onToggleRecycle();
    }
  }

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {error && (
        <p className="px-4 pt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex items-stretch gap-2 px-4 py-[15px]">

        {/* Secondary actions — icon above label, equal width */}
        <div className="flex gap-2">

          {/* Recall */}
          <button
            type="button"
            onClick={onRecall}
            disabled={isBusy || !hasStagedTiles}
            className="flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl border border-gray-300 bg-white text-gray-600 transition hover:bg-gray-50 active:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            <span className="text-[10px] font-semibold leading-none">Recall</span>
          </button>

          {/* Exchange / Submit */}
          <button
            type="button"
            onClick={handleExchangeClick}
            disabled={exchangeDisabled}
            className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl border transition disabled:opacity-30 disabled:cursor-not-allowed ${
              isRecycleOpen
                ? 'border-orange-500 bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700'
                : 'border-orange-300 bg-white text-orange-500 hover:bg-orange-50 active:bg-orange-100 dark:border-orange-700 dark:bg-gray-800 dark:text-orange-400 dark:hover:bg-orange-950/30'
            }`}
          >
            {hasExchangeTiles ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 1l4 4-4 4"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <path d="M7 23l-4-4 4-4"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            )}
            <span className="text-[10px] font-semibold leading-none">
              {pendingMove === 'recycle' ? 'Sending…' : hasExchangeTiles ? 'Submit' : 'Exchange'}
            </span>
          </button>

          {/* Pass */}
          <button
            type="button"
            onClick={handlePass}
            disabled={!canAct}
            className="flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl border border-gray-300 bg-white text-gray-600 transition hover:bg-gray-50 active:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 4 15 12 5 20 5 4"/>
              <line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
            <span className="text-[10px] font-semibold leading-none">
              {pendingMove === 'pass' ? 'Passing…' : 'Pass'}
            </span>
          </button>
        </div>

        {/* Play — primary, takes remaining width */}
        <button
          type="button"
          onClick={handlePlay}
          disabled={isBusy || !isMyTurn || !isValidPlay || !isGameActive}
          className="flex-1 flex items-center justify-center gap-2.5 rounded-xl bg-green-600 px-4 text-base font-bold text-white shadow-sm transition hover:bg-green-700 active:bg-green-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <span>{pendingMove === 'place' ? 'Playing…' : 'Play'}</span>
        </button>

      </div>
    </div>
  );
}
