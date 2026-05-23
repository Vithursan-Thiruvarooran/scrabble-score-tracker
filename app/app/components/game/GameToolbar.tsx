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
  const [showPassConfirm, setShowPassConfirm] = useState(false);

  useEffect(() => {
    setError(null);
  }, [pendingPlacements, recycleIndices]);

  function emitMove(moveType: string, extra: Record<string, unknown>, onSuccess: () => void) {
    if (pendingMove) return;
    setPendingMove(moveType);
    setError(null);

    let timeout: ReturnType<typeof setTimeout>;

    function cleanup() {
      clearTimeout(timeout);
      socket.off('play_move_ok', onOk);
      socket.off('play_error', onErr);
      setPendingMove(null);
    }
    function onOk() {
      cleanup();
      onSuccess();
    }
    function onErr(payload: { message?: string }) {
      cleanup();
      setError(payload.message ?? 'Move was rejected.');
    }

    timeout = setTimeout(() => {
      cleanup();
      setError('No response from server. Please try again.');
    }, 10_000);

    socket.once('play_move_ok', onOk);
    socket.once('play_error', onErr);
    socket.emit('play_move', { game_id: gameId, move_type: moveType, ...extra });

    return () => clearTimeout(timeout);
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

  const exchangeDisabled = isBusy || (!canAct && !(isRecycleOpen && !hasExchangeTiles));

  function handleExchangeClick() {
    if (hasExchangeTiles) {
      handleRecycle();
    } else {
      onToggleRecycle();
    }
  }

  return (
    <>
      {showPassConfirm && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Skip your turn?</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                You won't place any tiles this turn.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowPassConfirm(false)}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setShowPassConfirm(false); handlePass(); }}
                disabled={isBusy}
                className="flex-1 rounded-xl bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 active:bg-black disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white transition-colors"
              >
                {pendingMove === 'pass' ? 'Passing…' : 'Skip turn'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-950 pb-safe">
        {error && (
          <p className="px-4 pt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex items-stretch gap-2 px-4 py-3">

          {/* Left cluster: Pass + Exchange */}
          <div className="flex gap-2 shrink-0">

            {/* Pass */}
            <button
              type="button"
              onClick={() => setShowPassConfirm(true)}
              disabled={!canAct}
              className="flex flex-col items-center justify-center gap-1 min-h-[44px] px-3 rounded-xl border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 4 15 12 5 20 5 4"/>
                <line x1="19" y1="5" x2="19" y2="19"/>
              </svg>
              <span className="text-[10px] font-semibold leading-none">
                {pendingMove === 'pass' ? 'Passing…' : 'Pass'}
              </span>
            </button>

            {/* Exchange */}
            <button
              type="button"
              onClick={handleExchangeClick}
              disabled={exchangeDisabled}
              className={`flex flex-col items-center justify-center gap-1 min-h-[44px] px-3 rounded-xl border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                isRecycleOpen
                  ? 'border-gray-300 bg-gray-100 text-gray-800 hover:bg-gray-150 active:bg-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
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
                {pendingMove === 'recycle'
                  ? 'Sending…'
                  : hasExchangeTiles
                  ? `Submit ${recycleIndices.length}`
                  : 'Exchange'}
              </span>
            </button>
          </div>

          {/* Recall — sits just before Play */}
          <button
            type="button"
            onClick={onRecall}
            disabled={isBusy || !hasStagedTiles}
            className="flex flex-col items-center justify-center gap-1 min-h-[44px] px-3 rounded-xl border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            <span className="text-[10px] font-semibold leading-none">Recall</span>
          </button>

          {/* Play — primary, takes remaining width */}
          <button
            type="button"
            onClick={handlePlay}
            disabled={isBusy || !isMyTurn || !isValidPlay || !isGameActive}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-green-700 active:bg-green-800 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {pendingMove === 'place' ? (
              <>
                <svg className="w-5 h-5 animate-spin opacity-80 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                <span>Playing…</span>
              </>
            ) : (
              <>
                <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                <span>Play</span>
              </>
            )}
          </button>

        </div>
      </div>
    </>
  );
}
