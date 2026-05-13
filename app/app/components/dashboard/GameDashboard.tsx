import { useState } from 'react';
import { useNavigate } from 'react-router';
import * as gameService from '../../services/game';
import type { CreateGameParams, GameUser } from '../../services/game';
import { AddFriendCard } from './AddFriendCard';
import { NewGameCard } from './NewGameCard';
import { NewGameForm } from './NewGameForm';
import { CurrentGames } from './CurrentGames';
import { SocketIndicator } from '../SocketIndicator';
import { useAuth } from '../../context/AuthContext';

interface GameDashboardProps {
  onLogout: () => void;
}

export function GameDashboard({ onLogout }: GameDashboardProps) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<'create' | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [friends, setFriends] = useState<GameUser[]>([]);

  async function handleCreate(params: CreateGameParams) {
    setBusy('create');
    setCreateError(null);
    try {
      const { room } = await gameService.createGame(params, token);
      navigate(`/game/${room}`);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Could not create game.');
      setBusy(null);
    }
  }

  async function handleOpenForm() {
    setShowForm(true);
    try {
      const data = await gameService.getFriends(token);
      setFriends(data);
    } catch {
      setFriends([]);
    }
  }

  function handleCloseForm() {
    setShowForm(false);
    setCreateError(null);
  }

  return (
    <div className="h-screen bg-amber-50 dark:bg-gray-950 px-4 flex flex-col">
      <SocketIndicator />
      <header className="py-6 flex items-center justify-between max-w-sm w-full mx-auto shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {['S', 'C', 'R'].map((l, i) => (
              <span
                key={i}
                className="w-6 h-6 flex items-center justify-center bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold rounded text-xs shadow-sm"
              >
                {l}
              </span>
            ))}
          </div>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Score Tracker</span>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
        >
          Log out
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center overflow-hidden pb-4">
        <div className="w-full max-w-sm flex flex-col flex-1 min-h-0 gap-4">
          <AddFriendCard />
          <NewGameCard disabled={busy !== null} onOpen={handleOpenForm} />
          <CurrentGames />
        </div>
      </main>

      {showForm && (
        <NewGameForm
          loading={busy === 'create'}
          error={createError}
          friends={friends}
          onClose={handleCloseForm}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}
