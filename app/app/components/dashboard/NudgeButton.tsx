import { useState } from 'react';
import { socket } from '../../socket';

interface NudgeButtonProps {
  gameId: string;
  lastMoveAt: string | null;
  lastNudgedAt: string | null;
}

const THIRTY_MINUTES = 30 * 60 * 1000;

export function NudgeButton({ gameId, lastMoveAt, lastNudgedAt }: NudgeButtonProps) {
  // After a successful nudge the game list isn't re-fetched, so we track the
  // server-confirmed nudge time locally and use it as an override.
  const [localNudgedAt, setLocalNudgedAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const effectiveNudgedAt = localNudgedAt ?? lastNudgedAt;

  const minutesSinceLastMove = lastMoveAt
    ? (Date.now() - new Date(lastMoveAt).getTime()) / 60000
    : null;
  const recentlyNudged =
    effectiveNudgedAt !== null &&
    Date.now() - new Date(effectiveNudgedAt).getTime() < THIRTY_MINUTES;
  const canNudge = minutesSinceLastMove !== null && minutesSinceLastMove >= 30 && !recentlyNudged;

  if (!canNudge) return null;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (sending) return;
    setSending(true);
    setFailed(false);

    function onOk({ nudged_at }: { nudged_at: string }) {
      socket.off('nudge_error', onErr);
      setSending(false);
      setLocalNudgedAt(nudged_at);
    }
    function onErr() {
      socket.off('nudge_ok', onOk as Parameters<typeof socket.off>[1]);
      setSending(false);
      setFailed(true);
      setTimeout(() => setFailed(false), 3000);
    }
    socket.once('nudge_ok', onOk as Parameters<typeof socket.once>[1]);
    socket.once('nudge_error', onErr);
    socket.emit('nudge_player', { game_id: gameId });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={sending}
      className={`shrink-0 text-[10px] font-semibold uppercase tracking-widest transition-colors px-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        failed
          ? 'text-red-500 dark:text-red-400'
          : 'text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 active:opacity-70'
      }`}
    >
      {sending ? '…' : failed ? 'Failed' : 'Nudge'}
    </button>
  );
}
