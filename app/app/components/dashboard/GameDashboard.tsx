import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import * as gameService from '../../services/game';
import * as userService from '../../services/user';
import type { CreateGameParams } from '../../services/game';
import type { GameUser } from '../../services/user';
import { NewGameForm } from './NewGameForm';
import { PlaySection } from './PlaySection';
import { FriendsSection } from './FriendsSection';
import { MeSection } from './MeSection';
import { NavBar } from './NavBar';
import type { Tab } from './NavBar';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { socket } from '../../socket';
import { useSocketStatus } from '../../hooks/useSocketStatus';
import { HamburgerMenu } from '../shared/HamburgerMenu';

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
  const [activeTab, setActiveTab] = useState<Tab>('play');
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
    <div className="fixed inset-0 pt-safe bg-amber-50 dark:bg-gray-950 px-4 flex flex-col">
      <header className={`py-6 flex items-center justify-between max-w-sm w-full mx-auto shrink-0 border-b transition-colors ${socketConnected ? 'border-transparent' : 'border-red-300 dark:border-red-700'}`}>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {['S', 'C', 'R', 'A', 'B', 'B', 'L', 'E'].map((l, i) => (
              <span
                key={i}
                className="w-6 h-6 flex items-center justify-center bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold rounded text-xs shadow-sm"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
        <HamburgerMenu dotBorderColor="amber-50" onLogout={onLogout} />
      </header>

      <main className="flex-1 flex flex-col overflow-hidden py-4">
        {activeTab === 'play' && (
          <PlaySection onOpenForm={handleOpenForm} busy={busy !== null} />
        )}
        {activeTab === 'friends' && (
          <FriendsSection />
        )}
        {activeTab === 'me' && (
          <MeSection onLogout={onLogout} />
        )}
      </main>

      <NavBar active={activeTab} onChange={setActiveTab} />

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
