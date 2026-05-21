import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { socket } from '../socket';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import * as gameService from '../services/game';
import type { Game, GameState } from '../services/game';

export function useGameRoom(gameId: string | undefined) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { notify } = useNotifications();

  const [joinPending, setJoinPending] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [leavePending, setLeavePending] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const gameIdRef = useRef(gameId);
  gameIdRef.current = gameId;
  const socketCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!gameId) {
      navigate('/', { replace: true });
      return;
    }

    setJoinPending(true);
    setJoinError(null);
    socketCleanupRef.current = null;
    let cancelled = false;

    gameService.getGame(gameId, token)
      .then(fetchedGame => {
        if (cancelled) return;
        setGame(fetchedGame);

        if (fetchedGame.completed) {
          // Finished game: load state via REST, no socket join needed
          gameService.getGameState(gameId, token)
            .then(state => { if (!cancelled) { setGameState(state); setJoinPending(false); } })
            .catch(() => { if (!cancelled) { setJoinPending(false); setJoinError('Could not load game state.'); } });
          return;
        }

        // Active game: socket join path
        if (!token) {
          navigate('/', { replace: true });
          return;
        }

        const onJoinOk = () => {
          if (cancelled) return;
          setJoinPending(false);
          setJoinError(null);
          gameService.getGameState(gameId, token)
            .then(s => { if (!cancelled) setGameState(s); })
            .catch(() => {});
        };

        const onJoinErr = (payload: { message?: string }) => {
          if (cancelled) return;
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

        socketCleanupRef.current = () => {
          socket.off('connect', doJoin);
          socket.off('joined_game', onJoinOk);
          socket.off('join_error', onJoinErr);
        };

        if (socket.connected) {
          doJoin();
        } else {
          socket.once('connect', doJoin);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setJoinPending(false);
          setJoinError('Could not load game.');
        }
      });

    return () => {
      cancelled = true;
      socketCleanupRef.current?.();
      socketCleanupRef.current = null;
    };
  }, [gameId, token, navigate]);

  useEffect(() => {
    function onGameState(data: GameState) {
      if (data.game_id === gameIdRef.current) {
        setGameState(data);
      } else {
        notify({
          message: 'Opponent moved',
          action: { label: 'View', to: `/game/${data.game_id}` },
          key: `game-move-${data.game_id}`,
        });
      }
    }
    socket.on('game_state', onGameState);
    return () => { socket.off('game_state', onGameState); };
  }, [notify]);

  const leaveGame = useCallback(() => {
    if (!gameId) {
      navigate('/');
      return;
    }

    // Completed games were never joined via socket — just go home
    if (game?.completed) {
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
  }, [gameId, navigate, game]);

  return { joinPending, joinError, leavePending, leaveError, game, gameState, leaveGame };
}
