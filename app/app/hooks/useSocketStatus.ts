import { useEffect, useState } from 'react';
import { socket } from '../socket';

export function useSocketStatus(): boolean {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    function onConnect() { setConnected(true); }
    function onDisconnect() { setConnected(false); }
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return connected;
}
