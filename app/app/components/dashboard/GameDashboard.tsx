import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import * as gameService from '../../services/game';
import * as userService from '../../services/user';
import type { CreateGameParams } from '../../services/game';
import type { GameUser } from '../../services/user';
import { AddFriendCard } from './AddFriendCard';
import { NewGameCard } from './NewGameCard';
import { NewGameForm } from './NewGameForm';
import { CurrentGames } from './CurrentGames';
import { NotificationBanner } from './NotificationBanner';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { socket } from '../../socket';
import { useSocketStatus } from '../../hooks/useSocketStatus';

interface GameDashboardProps {
  onLogout: () => void;
}

export function GameDashboard({ onLogout }: GameDashboardProps) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { notify } = useNotifications();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<'create' | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [friends, setFriends] = useState<GameUser[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const socketConnected = useSocketStatus();

  useEffect(() => {
    function onChallenge({ game_id, challenger_name }: { game_id: string; challenger_name: string }) {
      notify({
        message: `${challenger_name} challenged you to a game!`,
        action: { label: 'View', to: `/game/${game_id}` },
        key: `challenge-${game_id}`,
      });
    }
    socket.on('game_challenge', onChallenge);
    return () => { socket.off('game_challenge', onChallenge); };
  }, [notify]);

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
      const data = await userService.getFriends(token);
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
        <div className="relative">
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
            className={`absolute top-1 right-1 w-2 h-2 rounded-full border-2 border-amber-50 dark:border-gray-950 pointer-events-none ${socketConnected ? 'bg-green-500' : 'bg-red-500'}`}
            title={socketConnected ? 'Connected' : 'Disconnected'}
          />
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onLogout(); }}
                  className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center overflow-hidden pb-4">
        <div className="w-full max-w-sm flex flex-col flex-1 min-h-0 gap-4">
          <NotificationBanner />
          <AddFriendCard />
          <NewGameCard disabled={busy !== null} onOpen={handleOpenForm} />
          <div className="flex flex-col flex-1 min-h-0 gap-6">
            <CurrentGames completed={false} />
            <CurrentGames completed={true} />
          </div>
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
