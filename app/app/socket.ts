import { io, type Socket } from 'socket.io-client';

export const socket: Socket = io(import.meta.env.VITE_API_URL as string, {
  autoConnect: false,
});

if (import.meta.env.DEV) {
  socket.on('connect', () => console.log('[socket] connected', socket.id));
  socket.on('disconnect', (reason) => console.log('[socket] disconnected', reason));
  socket.onAny((event: string, ...args: unknown[]) => {
    console.log('[socket ←]', event, ...args);
  });
  socket.onAnyOutgoing((event: string, ...args: unknown[]) => {
    console.log('[socket →]', event, ...args);
  });
}

export function connectSocket(token: string): void {
  socket.auth = { token };
  if (!socket.connected) socket.connect();
}

export function disconnectSocket(): void {
  socket.disconnect();
}
