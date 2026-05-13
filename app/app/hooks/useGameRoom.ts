import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { socket } from '../socket';
import { useAuth } from '../context/AuthContext';
import { useSocketEvent } from './useSocketEvent';
import * as gameService from '../services/game';
import type { Game, GameState } from '../services/game';

export function useGameRoom(gameId: string | undefined) {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [joinPending, setJoinPending] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [leavePending, setLeavePending] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);

  useEffect(() => {
    if (!gameId) {
      navigate('/', { replace: true });
      return;
    }

    setJoinPending(true);
    setJoinError(null);

    const onJoinOk = () => {
      setJoinPending(false);
      setJoinError(null);
    };

    const onJoinErr = (payload: { message?: string }) => {
      setJoinPending(false);
      setJoinError(payload.message ?? 'Could not join this game.');
    };

    const doJoin = () => {
      socket.off('joined_game', onJoinOk);
      socket.off('join_error', onJoinErr);
      socket.once('joined_game', onJoinOk);
      socket.once('join_error', onJoinErr);
      socket.emit('joinGame', { game_id: gameId });
    };

    if (socket.connected) {
      doJoin();
    } else if (!token) {
      navigate('/', { replace: true });
    } else {
      socket.once('connect', doJoin);
    }

    return () => {
      socket.off('connect', doJoin);
      socket.off('joined_game', onJoinOk);
      socket.off('join_error', onJoinErr);
    };
  }, [gameId, token, navigate]);

  useEffect(() => {
    if (!joinPending && !joinError && gameId) {
      gameService.getGame(gameId, token).then(setGame).catch(() => {});
      gameService.getGameState(gameId, token).then(setGameState).catch(() => {});
    }
  }, [joinPending, joinError, gameId, token]);

  useSocketEvent<GameState>('game_state', setGameState);

  const leaveGame = useCallback(() => {
    if (!gameId) {
      navigate('/');
      return;
    }
    setLeaveError(null);

    const goHome = () => {
      setLeavePending(false);
      navigate('/');
    };

    if (!socket.connected) {
      goHome();
      return;
    }

    setLeavePending(true);

    const onLeft = () => {
      socket.off('leave_error', onErr);
      goHome();
    };

    const onErr = (payload: { message?: string }) => {
      socket.off('left_game', onLeft);
      setLeavePending(false);
      setLeaveError(payload.message ?? 'Could not leave game.');
    };

    socket.once('left_game', onLeft);
    socket.once('leave_error', onErr);
    socket.emit('leaveGame', { game_id: gameId });
  }, [gameId, navigate]);

  return { joinPending, joinError, leavePending, leaveError, game, gameState, leaveGame };
}
