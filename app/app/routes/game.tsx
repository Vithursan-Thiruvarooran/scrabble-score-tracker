import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import type { Route } from "./+types/game";
import { GameView } from "../components/game/GameView";
import { useAuth } from '../context/AuthContext';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Scrabble' },
    { name: 'description', content: 'Scrabble score game room' },
  ];
}

export default function GameRoute() {
  const { token, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !token) {
      navigate('/', { replace: true });
    }
  }, [ready, token, navigate]);

  if (!ready || !token) return null;

  return <GameView />;
}
