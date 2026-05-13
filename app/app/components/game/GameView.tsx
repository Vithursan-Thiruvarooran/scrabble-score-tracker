import { useMemo, useRef, useState } from 'react';
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
  const { token } = useAuth();
  const { joinPending, joinError, leavePending, leaveError, game, gameState, leaveGame } = useGameRoom(gameId);

  const myUserId = token ? token.split(':')[0] : null;
  const myRack = myUserId && gameState ? (gameState.racks[myUserId] ?? []) : [];

  const [pendingPlacements, setPendingPlacements] = useState<PendingPlacements>({});
  const [activeTileLetter, setActiveTileLetter] = useState<string | null>(null);
  const [rackOrder, setRackOrder] = useState<number[]>([]);

  // Reset rack order whenever the tile content changes (e.g. after a turn is committed)
  const rackContentKey = myRack.join(',');
  const prevRackContentKey = useRef('');
  if (prevRackContentKey.current !== rackContentKey) {
    prevRackContentKey.current = rackContentKey;
    setRackOrder(myRack.map((_, i) => i));
  }

  const placedRackIndices = useMemo(
    () => new Set(Object.values(pendingPlacements).map((p) => p.rackIndex)),
    [pendingPlacements]
  );

  const isValidPlay = useMemo(
    () => validatePlay(pendingPlacements, gameState?.board),
    [pendingPlacements, gameState?.board]
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragStart(event: DragStartEvent) {
    setActiveTileLetter((event.active.data.current as { letter: string }).letter);
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
      setPendingPlacements((prev) => ({ ...prev, [overId]: { letter, rackIndex: data.rackIndex! } }));
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

  const handlePlayed = () => setPendingPlacements({});

  if (!gameId) return null;

  return (
    <>
    <div className="mx-auto max-w-2xl space-y-6 p-6 pb-20">
      <SocketIndicator />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/"
          className="text-sm font-medium text-gray-600 underline-offset-4 hover:text-gray-900 hover:underline dark:text-gray-400 dark:hover:text-gray-100"
        >
          ← Home
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={leaveGame}
            disabled={leavePending || joinPending || Boolean(joinError)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            {leavePending ? 'Leaving…' : 'Leave game'}
          </button>
        </div>
      </header>

      {leaveError && (
        <p className="text-sm text-red-600 dark:text-red-400">{leaveError}</p>
      )}

      {joinPending && (
        <p className="text-sm text-gray-600 dark:text-gray-400">Joining room…</p>
      )}

      {joinError && !joinPending && (
        <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/40">
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
          {/* {game && <GameInfo game={game} />} */}
          {gameState && <ScoreBoard state={gameState} game={game} />}
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="-mx-6">
              <GameBoard board={gameState?.board} pendingPlacements={pendingPlacements} isValidPlay={isValidPlay} />
            </div>
            <Rack tiles={myRack} rackOrder={rackOrder} placedIndices={placedRackIndices} />
            <DragOverlay dropAnimation={null}>
              {activeTileLetter && <FloatingTile letter={activeTileLetter} />}
            </DragOverlay>
          </DndContext>
        </>
      )}
    </div>
    <GameToolbar
      gameId={gameId}
      pendingPlacements={pendingPlacements}
      isValidPlay={isValidPlay}
      isMyTurn={gameState?.turn === myUserId}
      onPlayed={handlePlayed}
      onRecall={handlePlayed}
    />
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

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Live scores
        </h2>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          state.status === 'active'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : state.status === 'finished'
            ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        }`}>
          {state.status}
        </span>
      </div>
      <div className="flex gap-4">
        {state.players.map((pid) => (
          <div key={pid} className={`flex-1 rounded-lg p-3 ${
            state.turn === pid && state.status === 'active'
              ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-700'
              : 'bg-gray-50 dark:bg-gray-800'
          }`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label(pid)}</p>
            <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {state.scores[pid] ?? 0}
            </p>
            {state.turn === pid && state.status === 'active' && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Your turn</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {state.tile_bag.length} tile{state.tile_bag.length !== 1 ? 's' : ''} remaining in bag
      </p>
    </div>
  );
}


function GameInfo({ game }: { game: Game }) {
  const formattedDate = new Date(game.date).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const formattedTime = new Date(game.time).toLocaleTimeString(undefined, {
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
            <span>{game.duration} min</span>
            {game.timeIncrement > 0 && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span>+{game.timeIncrement} sec / move</span>
              </>
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

function FloatingTile({ letter }: { letter: string }) {
  return (
    <div className="relative flex h-10 w-10 items-center justify-center rounded bg-amber-100 shadow-md border border-amber-300 select-none rotate-3 scale-110">
      <span className="text-[32px] font-bold leading-none text-gray-900">{letter}</span>
      <span className="absolute bottom-0.5 right-0.5 text-[8px] font-semibold leading-none text-gray-600">
        {TILE_VALUES[letter] ?? 0}
      </span>
    </div>
  );
}
