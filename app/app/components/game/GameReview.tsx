import { useEffect, useMemo, useState } from 'react';
import type { Game, GameMove, GameState } from '../../services/game';
import { GameBoard } from './GameBoard';

interface GameReviewProps {
  game: Game | null;
  gameState: GameState;
}

function buildBoard(moves: GameMove[], upTo: number): (string | null)[][] {
  const board = Array.from({ length: 15 }, () => Array<string | null>(15).fill(null));
  for (let i = 0; i <= upTo; i++) {
    const m = moves[i];
    if (m.move_type === 'place' && m.dispute_status !== 'invalid') {
      for (const t of m.tiles) {
        board[t.row][t.col] = t.letter;
      }
    }
  }
  return board;
}

function computeScores(moves: GameMove[], upTo: number, players: string[]): Record<string, number> {
  const scores: Record<string, number> = {};
  players.forEach(p => { scores[p] = 0; });
  for (let i = 0; i <= upTo; i++) {
    const m = moves[i];
    if (m.player && m.dispute_status !== 'invalid') {
      scores[m.player] = (scores[m.player] ?? 0) + m.score;
    }
  }
  return scores;
}

function getMoveDescription(move: GameMove): string {
  switch (move.move_type) {
    case 'place':
      if (move.dispute_status === 'invalid') return `INVALID — ${move.word || '—'}`;
      return move.all_words.length > 1 ? move.all_words.join(', ') : (move.word || '—');
    case 'pass': return 'Passed turn';
    case 'recycle': return `Exchanged ${move.recycled.length} tile${move.recycled.length !== 1 ? 's' : ''}`;
    case 'resign': return 'Resigned';
    default: return '—';
  }
}

export function GameReview({ game, gameState }: GameReviewProps) {
  const reviewMoves = useMemo(
    () => gameState.game_moves.filter(m => m.move_type !== 'initial' && m.move_type !== 'dispute'),
    [gameState.game_moves]
  );

  const [currentIndex, setCurrentIndex] = useState(() => Math.max(0, reviewMoves.length - 1));

  const currentMove = reviewMoves[currentIndex];

  const displayBoard = useMemo(() => {
    const b = buildBoard(reviewMoves, currentIndex);
    if (currentMove?.move_type === 'place' && currentMove.dispute_status === 'invalid') {
      for (const t of currentMove.tiles) b[t.row][t.col] = t.letter;
    }
    return b;
  }, [reviewMoves, currentIndex, currentMove]);

  const highlightedCells = useMemo(() => {
    if (!currentMove || currentMove.move_type !== 'place') return new Map<string, 'valid' | 'invalid' | 'challenged'>();
    let type: 'valid' | 'invalid' | 'challenged';
    if (currentMove.dispute_status === 'invalid') type = 'invalid';
    else if (currentMove.dispute_status === 'valid') type = 'challenged';
    else type = 'valid';
    return new Map(currentMove.tiles.map(t => [`${t.row}-${t.col}`, type]));
  }, [currentMove]);

  const scores = useMemo(
    () => computeScores(reviewMoves, currentIndex, gameState.players),
    [reviewMoves, currentIndex, gameState.players]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') setCurrentIndex(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setCurrentIndex(i => Math.min(reviewMoves.length - 1, i + 1));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reviewMoves.length]);

  function getLabel(userId: string) {
    if (!game) return `#${userId.slice(-4)}`;
    if (game.user.id === userId) return game.user.firstname;
    if (game.opponent.id === userId) return game.opponent.firstname;
    return `#${userId.slice(-4)}`;
  }

  const total = reviewMoves.length;
  const progress = total > 1 ? currentIndex / (total - 1) : 1;
  const [p1, p2] = gameState.players;

  if (total === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">No moves to review.</p>
      </div>
    );
  }

  const isInvalidMove = currentMove?.dispute_status === 'invalid';

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      {/* Board */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-center px-1.5 py-1">
        <GameBoard board={displayBoard} highlightedCells={highlightedCells} />
      </div>

      {/* Move info card */}
      <div className="shrink-0 mx-3 mb-2 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2.5">
        {/* Running scores */}
        <div className="flex items-center justify-between mb-2">
          {[p1, p2].map((playerId, idx) => (
            <div key={playerId} className={`flex flex-col ${idx === 1 ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 truncate">
                {getLabel(playerId)}
              </span>
              <span className="score-font text-2xl leading-tight tabular-nums text-gray-900 dark:text-white">
                {scores[playerId] ?? 0}
              </span>
            </div>
          ))}
        </div>

        {/* Current move details */}
        {currentMove && (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                {currentMove.player ? getLabel(currentMove.player) : '—'}
              </span>
              <p className={`text-sm font-semibold truncate leading-tight ${isInvalidMove ? 'text-red-500 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                {getMoveDescription(currentMove)}
              </p>
            </div>
            {currentMove.score > 0 && !isInvalidMove && (
              <div className="shrink-0 px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50">
                <span className="score-font text-lg text-amber-600 dark:text-amber-400">+{currentMove.score}</span>
              </div>
            )}
            {isInvalidMove && (
              <div className="shrink-0 px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50">
                <span className="text-xs font-semibold text-red-500 dark:text-red-400">Challenged</span>
              </div>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div className="mt-2.5 h-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-amber-400 dark:bg-amber-500 transition-all duration-150"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Navigation controls */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 pb-safe">
        {/* Go to first */}
        <button
          type="button"
          onClick={() => setCurrentIndex(0)}
          disabled={currentIndex === 0}
          className="flex items-center justify-center w-12 h-12 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700 disabled:opacity-30 transition-colors"
          aria-label="First move"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <rect x="3" y="3.5" width="1.75" height="13" rx="0.875" />
            <path fillRule="evenodd" d="M16.5 10a.75.75 0 00-.75-.75H7.81l3.47-3.3a.75.75 0 10-1.04-1.08l-4.75 4.5a.75.75 0 000 1.08l4.75 4.5a.75.75 0 001.04-1.08L7.81 10.75H15.75A.75.75 0 0016.5 10z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Previous */}
        <button
          type="button"
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="flex items-center justify-center w-12 h-12 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700 disabled:opacity-30 transition-colors"
          aria-label="Previous move"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L9.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
        </button>

        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums">
            Move {currentIndex + 1} of {total}
          </span>
        </div>

        {/* Next */}
        <button
          type="button"
          onClick={() => setCurrentIndex(i => Math.min(reviewMoves.length - 1, i + 1))}
          disabled={currentIndex === reviewMoves.length - 1}
          className="flex items-center justify-center w-12 h-12 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700 disabled:opacity-30 transition-colors"
          aria-label="Next move"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Go to last */}
        <button
          type="button"
          onClick={() => setCurrentIndex(reviewMoves.length - 1)}
          disabled={currentIndex === reviewMoves.length - 1}
          className="flex items-center justify-center w-12 h-12 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700 disabled:opacity-30 transition-colors"
          aria-label="Last move"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <rect x="15.25" y="3.5" width="1.75" height="13" rx="0.875" />
            <path fillRule="evenodd" d="M3.5 10a.75.75 0 00.75.75h7.94l-3.47 3.3a.75.75 0 001.04 1.08l4.75-4.5a.75.75 0 000-1.08l-4.75-4.5a.75.75 0 00-1.04 1.08l3.47 3.3H4.25A.75.75 0 003.5 10z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}
