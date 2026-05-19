import { useMemo, useRef, useState } from 'react';
import { socket } from '../../socket';
import { useParams } from 'react-router';
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SocketIndicator } from '../SocketIndicator';
import { useGameRoom } from '../../hooks/useGameRoom';
import { Link } from 'react-router';
import type { Game, GameState } from '../../services/game';
import { GameBoard, type PendingPlacements } from './GameBoard';
import { Rack } from './Rack';
import { RecycleZone } from './RecycleZone';
import { GameToolbar } from './GameToolbar';
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
  const { token, user } = useAuth();
  const { joinPending, joinError, leavePending, leaveError, game, gameState, leaveGame } = useGameRoom(gameId);

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

  const isGameActive = gameState?.status === 'active';

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

  return (
    <>
    {showResignDialog && (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
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
              disabled={resignPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 active:bg-red-800 disabled:opacity-50"
            >
              {resignPending ? 'Resigning…' : 'Resign'}
            </button>
          </div>
        </div>
      </div>
    )}
    <div className="h-dvh flex flex-col overflow-hidden">
      <SocketIndicator />
      <header className="shrink-0 flex items-center justify-between px-4 py-3">
        <Link
          to="/"
          className="text-sm font-medium text-gray-600 underline-offset-4 hover:text-gray-900 hover:underline dark:text-gray-400 dark:hover:text-gray-100"
        >
          ← Home
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            aria-label="Menu"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect y="2" width="16" height="1.5" rx="0.75" />
              <rect y="7.25" width="16" height="1.5" rx="0.75" />
              <rect y="12.5" width="16" height="1.5" rx="0.75" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); leaveGame(); }}
                  disabled={leavePending || joinPending || Boolean(joinError)}
                  className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {leavePending ? 'Leaving…' : 'Leave game'}
                </button>
                {isGameActive && (
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setShowResignDialog(true); }}
                    className="w-full border-t border-gray-100 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    Resign
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {leaveError && (
        <p className="px-4 text-sm text-red-600 dark:text-red-400">{leaveError}</p>
      )}

      {joinPending && (
        <p className="px-4 text-sm text-gray-600 dark:text-gray-400">Joining room…</p>
      )}

      {joinError && !joinPending && (
        <div className="mx-4 space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/40">
          <p className="text-sm text-red-800 dark:text-red-200">{joinError}</p>
          <Link
            to="/"
            className="inline-block text-sm font-medium text-red-900 underline dark:text-red-100"
          >
            Back to home
          </Link>
        </div>
      )}

      {!joinPending && !joinError && (
        <>
          {gameState && <ScoreBoard state={gameState} game={game} />}
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-center">
              <GameBoard board={gameState?.board} pendingPlacements={pendingPlacements} isValidPlay={isValidPlay} />
            </div>
            {isRecycleOpen && (
              <div className="shrink-0 px-3 pt-2">
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
      )}
      <GameToolbar
        gameId={gameId}
        pendingPlacements={pendingPlacements}
        recycleIndices={recycleIndices}
        myRack={myRack}
        isValidPlay={isValidPlay}
        isMyTurn={gameState?.turn === myUserId}
        isGameActive={isGameActive}
        isRecycleOpen={isRecycleOpen}
        onPlayed={handlePlayed}
        onRecycled={handleRecycled}
        onRecall={handleRecall}
        onToggleRecycle={handleToggleRecycle}
      />
    </div>

</>
  );
}

function ScoreBoard({ state, game }: { state: GameState; game: Game | null }) {
  const label = (userId: string) => {
    if (!game) return userId.slice(-6);
    if (game.user.id === userId) return `${game.user.firstname} ${game.user.lastname}`;
    if (game.opponent.id === userId) return `${game.opponent.firstname} ${game.opponent.lastname}`;
    return userId.slice(-6);
  };

  const isFinished = state.status === 'finished';
  const winnerId = isFinished ? (state.winner ?? null) : null;
  const isTie = isFinished && winnerId === null;
  const [p1, p2] = state.players;

  function accentLeft(pid: string) {
    if (isFinished && isTie) return 'border-l-2 border-amber-400 dark:border-amber-500 pl-2';
    if (winnerId === pid) return 'border-l-2 border-amber-400 dark:border-amber-500 pl-2';
    if (state.turn === pid && !isFinished) return 'border-l-2 border-blue-400 dark:border-blue-500 pl-2';
    return 'border-l-2 border-transparent pl-2';
  }

  function accentRight(pid: string) {
    if (isFinished && isTie) return 'border-r-2 border-amber-400 dark:border-amber-500 pr-2';
    if (winnerId === pid) return 'border-r-2 border-amber-400 dark:border-amber-500 pr-2';
    if (state.turn === pid && !isFinished) return 'border-r-2 border-blue-400 dark:border-blue-500 pr-2';
    return 'border-r-2 border-transparent pr-2';
  }

  return (
    <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      {isFinished && (
        isTie ? (
          <div className="flex items-center justify-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-4 py-1.5 border-b border-blue-100 dark:border-blue-800/40">
            <span>🤝</span>
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
              It's a tie!
            </span>
          </div>
        ) : winnerId ? (
          <div className="flex items-center justify-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 px-4 py-1.5 border-b border-amber-100 dark:border-amber-800/40">
            <span>🏆</span>
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {label(winnerId)} wins!
            </span>
          </div>
        ) : null
      )}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start px-4 py-[10px] gap-3">
        {/* Player 1 — left-aligned */}
        <div className={`min-w-0 transition-colors ${accentLeft(p1)}`}>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label(p1)}</p>
          <p className={`text-2xl font-bold tabular-nums leading-tight ${(winnerId === p1 || isTie) ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
            {state.scores[p1] ?? 0}
          </p>
          {isTie && <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Tie</p>}
          {!isTie && winnerId === p1 && (
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Winner</p>
          )}
        </div>

        {/* Tile bag — always centered */}
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          <span className="text-xs font-semibold tabular-nums text-gray-500 dark:text-gray-400 leading-none">
            {state.tile_bag.length}
          </span>
        </div>

        {/* Player 2 — right-aligned */}
        {p2 ? (
          <div className={`min-w-0 text-right transition-colors ${accentRight(p2)}`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label(p2)}</p>
            <p className={`text-2xl font-bold tabular-nums leading-tight ${(winnerId === p2 || isTie) ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {state.scores[p2] ?? 0}
            </p>
            {isTie && <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Tie</p>}
            {!isTie && winnerId === p2 && (
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Winner</p>
            )}
          </div>
        ) : (
          <div className="text-right pt-0.5">
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">Waiting…</p>
          </div>
        )}
      </div>
    </div>
  );
}


function GameInfo({ game }: { game: Game }) {
  const gameDate = new Date(game.date);
  const formattedDate = gameDate.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const formattedTime = gameDate.toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 overflow-hidden">
      {game.completed && (
        <div className="flex items-center justify-center gap-2 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 border-b border-amber-100 dark:border-amber-800/40">
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
            {game.winner} wins
          </span>
        </div>
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-4">
          {game.completed ? (
            <>
              <PlayerScore name={`${game.user.firstname} ${game.user.lastname}`} score={game.userScore} isWinner={game.winner === game.user.id} align="left" />
              <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">vs</span>
              <PlayerScore name={`${game.opponent.firstname} ${game.opponent.lastname}`} score={game.opponentScore} isWinner={game.winner === game.opponent.id} align="right" />

            </>
          ) : (
            <>
              <Player name={`${game.user.firstname} ${game.user.lastname}`} align="left" />
              <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">vs</span>
              <Player name={`${game.opponent.firstname} ${game.opponent.lastname}`} align="right" />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-gray-100 dark:border-gray-800 pt-3 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            {game.turn_timer && game.duration != null ? (
              <>
                <span>{game.duration} min</span>
                {(game.timeIncrement ?? 0) > 0 && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <span>+{game.timeIncrement} sec / move</span>
                  </>
                )}
              </>
            ) : (
              <span>No timer</span>
            )}
          </div>
          <span>{formattedDate} at {formattedTime}</span>
        </div>
      </div>
    </div>
  );
}

function Player({ name, align }: { name: string; align: 'left' | 'right' }) {
  return (
    <div className={`flex-1 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{name}</p>
    </div>
  );
}

function PlayerScore({
  name, score, isWinner, align,
}: {
  name: string;
  score: number;
  isWinner: boolean;
  align: 'left' | 'right';
}) {
  return (
    <div className={`flex-1 flex flex-col gap-0.5 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <p className={`text-sm font-semibold truncate ${isWinner ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
        {name}
      </p>
      <p className="text-xl font-bold tabular-nums text-gray-800 dark:text-gray-200">{score}</p>
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
      <span className="text-[32px] font-bold leading-none text-gray-900">
        {isRawBlank ? '' : letter.toUpperCase()}
      </span>
      <span className="absolute bottom-0.5 right-0.5 text-[8px] font-semibold leading-none text-gray-600">
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
