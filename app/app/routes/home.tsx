import type { Route } from './+types/home';
import { useAuth } from '../context/AuthContext';
import { AuthPage } from '../components/auth/AuthPage';
import { GameDashboard } from '../components/dashboard/GameDashboard';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Scrabble Score Tracker' },
    { name: 'description', content: 'Track your Scrabble scores in real time' },
  ];
}

export default function Home() {
  const { token, ready, login, logout } = useAuth();

  if (!ready) return null;
  if (!token) return <AuthPage onAuth={login} />;
  return <GameDashboard onLogout={logout} />;
}
