import { useEffect, useState } from 'react';
import * as gameService from '../../services/game';
import type { Game } from '../../services/game';
import { CurrentGameCard } from './CurrentGameCard';
import { useAuth } from '../../context/AuthContext';

export function CurrentGames() {
  const { token } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gameService.getMyGames(token)
      .then(setGames)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load games.'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 shrink-0">
        Your games
      </h2>

      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
        {loading && (
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>
        )}

        {error && !loading && (
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        )}

        {!loading && !error && games.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500">No games yet.</p>
        )}

        {games.map((game) => (
          <CurrentGameCard key={game.id} game={game} />
        ))}
      </div>
    </div>
  );
}
