import { useEffect, useMemo, useRef, useState } from 'react';
import { socket, connectSocket } from '../../socket';
import { useParams } from 'react-router';
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { useGameRoom } from '../../hooks/useGameRoom';
import { Link } from 'react-router';
import type { GameState } from '../../services/game';
import { GameBoard, type PendingPlacements } from './GameBoard';
import { Rack } from './Rack';
import { RecycleZone } from './RecycleZone';
import { GameToolbar } from './GameToolbar';
import { DisputePrompt } from './DisputePrompt';
import { useAuth } from '../../context/AuthContext';

function validatePlay(
  pendingPlacements: PendingPlacements,
  board: (string | null)[][] | null | undefined,
): boolean {
  const keys = Object.keys(pendingPlacements);
  if (keys.length === 0) return false;

  const positions = keys.map((key) => {
    const [r, c] = key.split('-').map(Number);
    return { row: r, col: c };
  });

  const rowSet = new Set(positions.map((p) => p.row));
  const colSet = new Set(positions.map((p) => p.col));

  // All pending tiles must be in the same row or the same column
  const isHorizontal = rowSet.size === 1;
  const isVertical = colSet.size === 1;
  if (!isHorizontal && !isVertical) return false;

  // No empty gaps between first and last tile; existing board tiles may fill gaps
  if (positions.length > 1) {
    if (isHorizontal) {
      const row = [...rowSet][0];
      const minCol = Math.min(...positions.map((p) => p.col));
      const maxCol = Math.max(...positions.map((p) => p.col));
      for (let c = minCol; c <= maxCol; c++) {
        if (!colSet.has(c) && !board?.[row]?.[c]) return false;
      }
    } else {
      const col = [...colSet][0];
      const minRow = Math.min(...positions.map((p) => p.row));
      const maxRow = Math.max(...positions.map((p) => p.row));
      for (let r = minRow; r <= maxRow; r++) {
        if (!rowSet.has(r) && !board?.[r]?.[col]) return false;
      }
    }
  }

  const boardHasTiles = board?.some((row) => row.some((cell) => cell !== null)) ?? false;

  // First move: must cover the center star (7, 7)
  if (!boardHasTiles) {
    return positions.some((p) => p.row === 7 && p.col === 7);
  }

  // Subsequent moves: must touch at least one committed tile.
  // An existing tile within the run (filling a gap) counts as a connection.
  if (isHorizontal) {
    const row = [...rowSet][0];
    const minCol = Math.min(...positions.map((p) => p.col));
    const maxCol = Math.max(...positions.map((p) => p.col));
    for (let c = minCol; c <= maxCol; c++) {
      if (!colSet.has(c) && board?.[row]?.[c]) return true;
    }
  } else {
    const col = [...colSet][0];
    const minRow = Math.min(...positions.map((p) => p.row));
    const maxRow = Math.max(...positions.map((p) => p.row));
    for (let r = minRow; r <= maxRow; r++) {
      if (!rowSet.has(r) && board?.[r]?.[col]) return true;
    }
  }

  // Any pending tile orthogonally adjacent to a committed tile also counts
  const DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  return positions.some(({ row, col }) =>
    DIRS.some(([dr, dc]) => {
      const nr = row + dr;
      const nc = col + dc;
      return nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board?.[nr]?.[nc] != null;
    })
  );
}

export function GameView() {
  const { gameId } = useParams();
  const { user } = useAuth();
  const { joinPending, joinError, game, gameState } = useGameRoom(gameId);

  const myUserId = user?.id ?? null;
  const myRack = myUserId && gameState ? (gameState.racks[myUserId] ?? []) : [];

  const [pendingPlacements, setPendingPlacements] = useState<PendingPlacements>({});
  const [recycleIndices, setRecycleIndices] = useState<number[]>([]);
  const [isRecycleOpen, setIsRecycleOpen] = useState(false);
  const [activeTileLetter, setActiveTileLetter] = useState<string | null>(null);
  const [activeTileIsBlank, setActiveTileIsBlank] = useState(false);
  const [blankModalState, setBlankModalState] = useState<{ rackIndex: number; boardKey: string } | null>(null);
  const [rackOrder, setRackOrder] = useState<number[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showResignDialog, setShowResignDialog] = useState(false);
  const [resignPending, setResignPending] = useState(false);
  const [socketConnected, setSocketConnected] = useState(socket.connected);

  useEffect(() => {
    function onConnect() { setSocketConnected(true); }
    function onDisconnect() { setSocketConnected(false); }
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); };
  }, []);

  const isGameActive = gameState?.status === 'active';
  const isDisputePending = Boolean(gameState?.pending_dispute);

  function handleResign() {
    setShowResignDialog(false);
    if (resignPending) return;
    setResignPending(true);
    function onOk() { socket.off('play_error', onErr); setResignPending(false); }
    function onErr() { socket.off('play_move_ok', onOk); setResignPending(false); }
    socket.once('play_move_ok', onOk);
    socket.once('play_error', onErr);
    socket.emit('play_move', { game_id: gameId, move_type: 'resign' });
  }

  // Reset rack order whenever the tile content changes (e.g. after a turn is committed)
  const rackContentKey = myRack.join(',');
  const prevRackContentKey = useRef('');
  if (prevRackContentKey.current !== rackContentKey) {
    prevRackContentKey.current = rackContentKey;
    setRackOrder(myRack.map((_, i) => i));
  }

  // Indices that are "in use" — on the board, in the recycle zone, or awaiting blank letter
  // selection — so the rack grays them out.
  const usedRackIndices = useMemo(
    () => new Set([
      ...Object.values(pendingPlacements).map((p) => p.rackIndex),
      ...recycleIndices,
      ...(blankModalState ? [blankModalState.rackIndex] : []),
    ]),
    [pendingPlacements, recycleIndices, blankModalState]
  );

  const isValidPlay = useMemo(
    () => validatePlay(pendingPlacements, gameState?.board),
    [pendingPlacements, gameState?.board]
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { letter: string; source: string; fromKey?: string };
    setActiveTileLetter(data.letter);
    const isBlank =
      data.letter === '?' ||
      (data.source === 'board' && data.fromKey
        ? Boolean(pendingPlacements[data.fromKey]?.isBlank)
        : false);
    setActiveTileIsBlank(isBlank);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTileLetter(null);
    const { active, over } = event;
    if (!over) return;

    const data = active.data.current as {
      letter: string;
      source: 'rack' | 'board';
      rackIndex?: number;
      fromKey?: string;
    };
    const { letter, source } = data;
    const overId = over.id as string;

    if (overId === 'rack') {
      if (source === 'board' && data.fromKey) {
        setPendingPlacements((prev) => {
          const next = { ...prev };
          delete next[data.fromKey!];
          return next;
        });
      }
      return;
    }

    // Dropping on the recycle zone — only rack tiles can be recycled
    if (overId === 'recycle-zone') {
      if (source === 'rack' && data.rackIndex !== undefined) {
        setRecycleIndices((prev) =>
          prev.includes(data.rackIndex!) ? prev : [...prev, data.rackIndex!]
        );
      }
      return;
    }

    // Dropping on a rack slot
    if (overId.startsWith('rack-slot-')) {
      if (source === 'board' && data.fromKey) {
        setPendingPlacements((prev) => {
          const next = { ...prev };
          delete next[data.fromKey!];
          return next;
        });
        return;
      }
      if (source === 'rack' && data.rackIndex !== undefined) {
        const toSlot = parseInt(overId.slice('rack-slot-'.length), 10);
        const fromSlot = rackOrder.indexOf(data.rackIndex);
        if (fromSlot === -1 || fromSlot === toSlot) return;
        setRackOrder((prev) => {
          const next = [...prev];
          const [moved] = next.splice(fromSlot, 1);
          next.splice(toSlot, 0, moved);
          return next;
        });
      }
      return;
    }

    // Dropping on a board cell
    const [r, c] = overId.split('-').map(Number);
    if (isNaN(r) || isNaN(c)) return;
    if (gameState?.board?.[r]?.[c]) return;
    if (pendingPlacements[overId]) return;

    if (source === 'rack' && data.rackIndex !== undefined) {
      if (letter === '?') {
        setBlankModalState({ rackIndex: data.rackIndex, boardKey: overId });
      } else {
        setPendingPlacements((prev) => ({ ...prev, [overId]: { letter, rackIndex: data.rackIndex! } }));
      }
    } else if (source === 'board' && data.fromKey) {
      const fromTile = pendingPlacements[data.fromKey];
      if (!fromTile) return;
      setPendingPlacements((prev) => {
        const next = { ...prev };
        delete next[data.fromKey!];
        next[overId] = fromTile;
        return next;
      });
    }
  }

  const handlePlayed   = () => { setPendingPlacements({}); setBlankModalState(null); };
  const handleRecycled = () => { setRecycleIndices([]); setIsRecycleOpen(false); };
  const handleRecall   = () => { setPendingPlacements({}); setRecycleIndices([]); setIsRecycleOpen(false); setBlankModalState(null); };
  const handleToggleRecycle = () => {
    setIsRecycleOpen((prev) => {
      if (prev) setRecycleIndices([]);
      return !prev;
    });
  };

  if (!gameId) return null;

  const players = gameState?.players ?? [];
  const [p1, p2] = myUserId && players[1] === myUserId
    ? [players[1], players[0]]
    : players;
  const isFinished = gameState?.status === 'finished';

  function getLabel(userId: string) {
    if (!game) return `#${userId.slice(-4)}`;
    if (game.user.id === userId) return game.user.firstname;
    if (game.opponent.id === userId) return game.opponent.firstname;
    return `#${userId.slice(-4)}`;
  }

  return (
    <>
      {showResignDialog && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Resign game?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This will end the game and your opponent wins.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResignDialog(false)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResign}
                disabled={resignPending}
                className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 active:bg-red-700 disabled:opacity-50"
              >
                {resignPending ? 'Resigning…' : 'Resign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute prompt — shown to the opponent */}
      {gameState?.pending_dispute && myUserId === gameState.pending_dispute.opponent && (
        <DisputePrompt
          gameId={gameId}
          words={gameState.pending_dispute.all_words}
          score={gameState.pending_dispute.score}
          expiresAt={gameState.pending_dispute.expires_at}
        />
      )}

      <div className="h-dvh flex flex-col overflow-hidden bg-white dark:bg-gray-950">

        {/* Header: top row (back + menu), second row (scores) */}
        <header className="shrink-0 flex flex-col border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
          {/* Top row: back + label + hamburger */}
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <Link
              to="/"
              className="shrink-0 flex items-center justify-center w-10 h-10 -ml-1 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
              </svg>
            </Link>

            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Scoreboard</span>

            <div className="shrink-0 relative">
              {isGameActive && (
                <>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((prev) => !prev)}
                    className="flex items-center justify-center w-10 h-10 -mr-1 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
                    aria-label="Menu"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <rect y="2" width="16" height="1.5" rx="0.75" />
                      <rect y="7.25" width="16" height="1.5" rx="0.75" />
                      <rect y="12.5" width="16" height="1.5" rx="0.75" />
                    </svg>
                  </button>
                  <div
                    className={`absolute top-1 right-1 w-2 h-2 rounded-full border-2 border-white dark:border-gray-950 pointer-events-none ${socketConnected ? 'bg-green-500' : 'bg-red-500'}`}
                    title={socketConnected ? 'Connected' : 'Disconnected'}
                  />
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                        <button
                          type="button"
                          onClick={() => { setMenuOpen(false); setShowResignDialog(true); }}
                          className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          Resign
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
              {!isGameActive && (
                <div className="w-10 h-10 -mr-1" />
              )}
            </div>
          </div>

          {/* Scoreboard row */}
          {gameState && p1 && p2 ? (
            <div className="flex items-center gap-2 px-3 pb-2">
              <PlayerScoreChip id={p1} state={gameState} getLabel={getLabel} align="left" />

              <div className="shrink-0 flex flex-col items-center gap-0.5 px-1">
                {isFinished ? (
                  <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500 dark:text-amber-400">Final</span>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                    <span className="text-xs font-bold tabular-nums leading-none text-gray-500 dark:text-gray-400">
                      {gameState.tile_bag.length}
                    </span>
                  </>
                )}
              </div>

              <PlayerScoreChip id={p2} state={gameState} getLabel={getLabel} align="right" />
            </div>
          ) : (
            <div className="pb-2" />
          )}
        </header>

        {/* Waiting overlay — shown to the player who just placed while opponent decides */}
        {gameState?.pending_dispute && myUserId === gameState.pending_dispute.player && (
          <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-100 dark:border-amber-900/50">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 text-center">
              Waiting for opponent to accept or dispute…
            </p>
          </div>
        )}

        {joinPending && (
          <p className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">Joining room…</p>
        )}

        {joinError && !joinPending && (
          <div className="mx-4 mt-3 space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/40">
            <p className="text-sm text-red-800 dark:text-red-200">{joinError}</p>
            <Link to="/" className="inline-block text-sm font-medium text-red-900 underline dark:text-red-100">
              Back to home
            </Link>
          </div>
        )}

        {!joinPending && !joinError && (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-center px-1.5 py-1">
              <GameBoard board={gameState?.board} pendingPlacements={pendingPlacements} isValidPlay={isValidPlay} />
            </div>
            {isRecycleOpen && (
              <div className="shrink-0 px-3 pt-1">
                <RecycleZone
                  tiles={myRack}
                  recycleIndices={recycleIndices}
                  onRemove={(i) => setRecycleIndices((prev) => prev.filter((x) => x !== i))}
                />
              </div>
            )}
            <div className="shrink-0 px-3 py-2">
              <Rack tiles={myRack} rackOrder={rackOrder} placedIndices={usedRackIndices} />
            </div>
            <DragOverlay dropAnimation={null}>
              {activeTileLetter && <FloatingTile letter={activeTileLetter} isBlank={activeTileIsBlank} />}
            </DragOverlay>
          </DndContext>
        )}

        <GameToolbar
          gameId={gameId}
          pendingPlacements={pendingPlacements}
          recycleIndices={recycleIndices}
          myRack={myRack}
          isValidPlay={isValidPlay}
          isMyTurn={gameState?.turn === myUserId}
          isGameActive={isGameActive && !isDisputePending}
          isRecycleOpen={isRecycleOpen}
          onPlayed={handlePlayed}
          onRecycled={handleRecycled}
          onRecall={handleRecall}
          onToggleRecycle={handleToggleRecycle}
        />
      </div>

      {blankModalState && (
        <BlankTileModal
          onSelect={(chosen) => {
            setPendingPlacements((prev) => ({
              ...prev,
              [blankModalState.boardKey]: { letter: chosen, rackIndex: blankModalState.rackIndex, isBlank: true },
            }));
            setBlankModalState(null);
          }}
          onDismiss={() => setBlankModalState(null)}
        />
      )}
    </>
  );
}

function PlayerScoreChip({
  id,
  state,
  getLabel,
  align,
}: {
  id: string;
  state: GameState;
  getLabel: (id: string) => string;
  align: 'left' | 'right';
}) {
  const isFinished = state.status === 'finished';
  const isCurrent = !isFinished && state.turn === id;
  const isWinner = isFinished && state.winner === id;
  const isTie = isFinished && state.winner === null;
  const highlighted = isWinner || isTie;

  return (
    <div
      className={`flex-1 min-w-0 flex flex-col ${align === 'right' ? 'items-end' : 'items-start'} transition-opacity ${!isFinished && !isCurrent ? 'opacity-40' : 'opacity-100'}`}
    >
      <p className={`text-[10px] font-semibold uppercase tracking-widest truncate max-w-full leading-none ${highlighted ? 'text-amber-500 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
        {getLabel(id)}{(isWinner || isTie) ? ' ★' : ''}
      </p>
      <p className={`score-font text-[28px] leading-tight tabular-nums ${highlighted ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
        {state.scores[id] ?? 0}
      </p>
      {isCurrent && (
        <div className={`h-0.5 w-5 rounded-full bg-blue-500 dark:bg-blue-400 mt-0.5 ${align === 'right' ? 'self-end' : ''}`} />
      )}
    </div>
  );
}

const TILE_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

function FloatingTile({ letter, isBlank }: { letter: string; isBlank?: boolean }) {
  const isRawBlank = letter === '?';
  return (
    <div className="relative flex h-10 w-10 items-center justify-center rounded bg-amber-100 shadow-md border border-amber-300 select-none rotate-3 scale-110">
      <span className="text-[29px] font-extrabold leading-none text-amber-900">
        {isRawBlank ? '' : letter.toUpperCase()}
      </span>
      <span className="absolute bottom-0.5 right-0.5 text-[13px] font-bold leading-none text-amber-700">
        {isBlank || isRawBlank ? 0 : (TILE_VALUES[letter] ?? 0)}
      </span>
    </div>
  );
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function BlankTileModal({ onSelect, onDismiss }: { onSelect: (letter: string) => void; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Choose a letter for your blank tile</h3>
        <div className="grid grid-cols-7 gap-1.5">
          {LETTERS.map((letter) => (
            <button
              key={letter}
              type="button"
              onClick={() => onSelect(letter)}
              className="h-10 w-10 rounded bg-amber-100 border border-amber-300 text-sm font-bold text-gray-900 hover:bg-amber-200 active:bg-amber-300 dark:bg-amber-200 dark:border-amber-400 dark:text-gray-900"
            >
              {letter}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
