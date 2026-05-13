import { Link } from 'react-router';
import type { Game } from '../../services/game';

interface CurrentGameCardProps {
  game: Game;
}

export function CurrentGameCard({ game }: CurrentGameCardProps) {
  const date = new Date(game.date).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <Link
      to={`/game/${game.id}`}
      className="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 space-y-2 hover:border-amber-300 dark:hover:border-amber-700 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between gap-3">
        {game.completed ? (
          <span className="text-xs font-medium text-green-600 dark:text-green-400 shrink-0">
            Completed
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Live
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${game.completed && game.winner === game.user.id ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
            {game.user.firstname} {game.user.lastname}
          </p>
          {game.completed && (
            <p className="text-lg font-bold tabular-nums text-gray-800 dark:text-gray-200 leading-tight">
              {game.userScore}
            </p>
          )}
        </div>

        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 shrink-0">vs</span>

        <div className="flex-1 min-w-0 text-right">
          <p className={`text-sm font-semibold truncate ${game.completed && game.winner === game.opponent.id ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
            {game.opponent.firstname} {game.opponent.lastname}
          </p>
          {game.completed && (
            <p className="text-lg font-bold tabular-nums text-gray-800 dark:text-gray-200 leading-tight">
              {game.opponentScore}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">{date}</p>
    </Link>
  );
}
