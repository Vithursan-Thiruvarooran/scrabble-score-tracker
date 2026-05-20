import { useEffect, useRef, useState } from 'react';
import * as gameService from '../../services/game';
import type { Game, GameState } from '../../services/game';
import { CurrentGameCard } from './CurrentGameCard';
import { useAuth } from '../../context/AuthContext';
import { socket } from '../../socket';

interface CurrentGamesProps {
  completed?: boolean;
}

function sortByOldestMove(games: Game[]): Game[] {
  return [...games].sort((a, b) => {
    const ta = a.game_state?.last_move_at ? new Date(a.game_state.last_move_at).getTime() : Infinity;
    const tb = b.game_state?.last_move_at ? new Date(b.game_state.last_move_at).getTime() : Infinity;
    return ta - tb;
  });
}

function SectionLabel({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <h2 className={`text-xs font-semibold uppercase tracking-wider ${
      accent
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-gray-400 dark:text-gray-500'
    }`}>
      {children}
    </h2>
  );
}

export function CurrentGames({ completed }: CurrentGamesProps) {
  const { token, user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gameService.getMyGames(token, completed)
      .then(setGames)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load games.'))
      .finally(() => setLoading(false));
  }, [token, completed]);

  // Keep a stable ref so the subscription effect reads the latest games list
  // without needing `games` in its dependency array (which would cause
  // unsubscribe/resubscribe churn every time a socket update arrives).
  const gamesRef = useRef(games);
  gamesRef.current = games;

  useEffect(() => {
    if (completed || loading) return;

    const activeIds = gamesRef.current
      .filter(g => g.game_state?.status === 'active')
      .map(g => g.id);

    if (activeIds.length === 0) return;

    activeIds.forEach(id => socket.emit('subscribe_game', { game_id: id }));

    const onGameState = (data: GameState) => {
      setGames(prev =>
        prev.map(g => {
          if (g.id !== data.game_id) return g;
          const lastNonInitial = [...(data.game_moves ?? [])]
            .reverse()
            .find(m => m.move_type !== 'initial');
          return {
            ...g,
            game_state: {
              turn: data.turn ?? null,
              status: data.status,
              last_move_at:
                lastNonInitial?.timestamp ?? g.game_state?.last_move_at ?? null,
              scores: data.scores ?? {},
            },
          };
        })
      );
    };

    socket.on('game_state', onGameState);

    return () => {
      activeIds.forEach(id => socket.emit('unsubscribe_game', { game_id: id }));
      socket.off('game_state', onGameState);
    };
  }, [completed, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const userId = user?.id ?? '';

  if (loading) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-500 dark:text-red-400">{error}</p>;
  }

  if (completed) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <SectionLabel>Past games</SectionLabel>
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 mt-2">
          {games.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No past games.</p>
          ) : (
            games.map(game => (
              <CurrentGameCard key={game.id} game={game} currentUserId={userId} />
            ))
          )}
        </div>
      </div>
    );
  }

  const myTurnGames = sortByOldestMove(
    games.filter(g => g.game_state?.status === 'active' && g.game_state.turn === userId)
  );
  const theirTurnGames = sortByOldestMove(
    games.filter(g => !(g.game_state?.status === 'active' && g.game_state?.turn === userId))
  );

  if (games.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">No active games.</p>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto pr-0.5">
        <div className="space-y-3">
          {myTurnGames.length > 0 && (
            <div className="space-y-1.5">
              <SectionLabel accent>Your turn · {myTurnGames.length}</SectionLabel>
              {myTurnGames.map(game => (
                <CurrentGameCard key={game.id} game={game} currentUserId={userId} />
              ))}
            </div>
          )}

          {theirTurnGames.length > 0 && (
            <div className="space-y-1.5">
              <SectionLabel>Their turn · {theirTurnGames.length}</SectionLabel>
              {theirTurnGames.map(game => (
                <CurrentGameCard key={game.id} game={game} currentUserId={userId} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
