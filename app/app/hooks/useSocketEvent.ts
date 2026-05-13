import { useEffect, useRef } from 'react';
import { socket } from '../socket';

export function useSocketEvent<T>(event: string, handler: (data: T) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const stable = (data: T) => handlerRef.current(data);
    socket.on(event, stable);
    return () => { socket.off(event, stable); };
  }, [event]);
}
