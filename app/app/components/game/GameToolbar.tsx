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
  const [showResignDialog, setShowResignDialog] = useState(false);

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

  function handleResign() {
    setShowResignDialog(false);
    emitMove('resign', {}, () => {});
  }

  const isBusy = pendingMove !== null;
  const hasStagedTiles =
    Object.keys(pendingPlacements).length > 0 || recycleIndices.length > 0;

  return (
    <>
      {showResignDialog && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Resign game?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This will end the game immediately and your opponent will win.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResignDialog(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResign}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 active:bg-red-800"
              >
                Resign
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-3">
          <span className="flex-1 text-sm text-red-600 dark:text-red-400">{error ?? ''}</span>

          <div className="flex items-center gap-2">
            {/* Resign — always available during an active game */}
            {isGameActive && (
              <button
                type="button"
                onClick={() => setShowResignDialog(true)}
                disabled={isBusy}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                {pendingMove === 'resign' ? 'Resigning…' : 'Resign'}
              </button>
            )}

            {/* Pass — only on your turn */}
            {isMyTurn && isGameActive && (
              <button
                type="button"
                onClick={handlePass}
                disabled={isBusy}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {pendingMove === 'pass' ? 'Passing…' : 'Pass'}
              </button>
            )}

            {/* Recall — clears both board placements and the recycle zone */}
            {hasStagedTiles && (
              <button
                type="button"
                onClick={onRecall}
                disabled={isBusy}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Recall
              </button>
            )}

            {/* Recycle toggle — opens/closes the exchange zone */}
            {isMyTurn && isGameActive && (
              <button
                type="button"
                onClick={onToggleRecycle}
                disabled={isBusy}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isRecycleOpen
                    ? 'border-orange-500 bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700'
                    : 'border-orange-300 bg-white text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:bg-gray-800 dark:text-orange-400 dark:hover:bg-orange-950/30'
                }`}
              >
                Exchange
              </button>
            )}

            {/* Submit — confirm the tiles staged in the recycle zone */}
            {isRecycleOpen && recycleIndices.length > 0 && isMyTurn && isGameActive && (
              <button
                type="button"
                onClick={handleRecycle}
                disabled={isBusy}
                className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 active:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingMove === 'recycle' ? 'Exchanging…' : 'Submit'}
              </button>
            )}

            {/* Play — submit a valid board placement */}
            {isValidPlay && (
              <button
                type="button"
                onClick={handlePlay}
                disabled={isBusy || !isMyTurn}
                className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 active:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingMove === 'place' ? 'Playing…' : 'Play'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
