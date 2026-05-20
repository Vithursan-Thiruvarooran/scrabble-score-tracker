import { Link } from 'react-router';
import type { Game } from '../../services/game';

interface CurrentGameCardProps {
  game: Game;
  currentUserId: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function CurrentGameCard({ game, currentUserId }: CurrentGameCardProps) {
  const iAmUser = game.user.id === currentUserId;
  const me = iAmUser ? game.user : game.opponent;
  const them = iAmUser ? game.opponent : game.user;

  const gs = game.game_state;
  const myScore = gs?.scores[me.id] ?? (iAmUser ? game.userScore : game.opponentScore);
  const theirScore = gs?.scores[them.id] ?? (iAmUser ? game.opponentScore : game.userScore);

  const isActive = !game.completed && gs?.status === 'active';
  const isMyTurn = isActive && gs?.turn === me.id;

  const iWon = game.completed && game.winner === me.id;
  const theyWon = game.completed && game.winner === them.id;
  const showScores = isActive || game.completed;

  return (
    <Link
      to={`/game/${game.id}`}
      className="group flex items-center gap-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-3.5 py-2.5 hover:border-amber-300 dark:hover:border-amber-600 hover:shadow-sm transition-all duration-150"
    >
      {/* Status dot */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
        game.completed
          ? 'bg-green-500'
          : gs?.status === 'waiting'
          ? 'bg-gray-400 dark:bg-gray-500'
          : 'bg-blue-500 animate-pulse'
      }`} />

      {/* My name */}
      <span className={`flex-1 min-w-0 text-sm font-semibold truncate ${
        iWon ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'
      }`}>
        {me.firstname}
      </span>

      {/* Score matchup */}
      {showScores ? (
        <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
          <span className={`text-sm font-black ${
            iWon ? 'text-amber-500 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'
          }`}>
            {myScore}
          </span>
          <span className={`text-xs font-bold ${
            isActive
              ? isMyTurn
                ? 'text-amber-400 dark:text-amber-500'
                : 'text-gray-300 dark:text-gray-600'
              : 'text-gray-300 dark:text-gray-600'
          }`}>
            {isActive ? (isMyTurn ? '←' : '→') : '·'}
          </span>
          <span className={`text-sm font-black ${
            theyWon ? 'text-amber-500 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'
          }`}>
            {theirScore}
          </span>
        </div>
      ) : (
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">waiting…</span>
      )}

      {/* Their name */}
      <span className={`flex-1 min-w-0 text-sm font-semibold truncate text-right ${
        theyWon ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'
      }`}>
        {them.firstname}
      </span>

      {/* Time since last move */}
      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 w-6 text-right tabular-nums">
        {gs?.last_move_at ? timeAgo(gs.last_move_at) : ''}
      </span>
    </Link>
  );
}
