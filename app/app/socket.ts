import { io, type Socket } from 'socket.io-client';

const _apiUrl = new URL(import.meta.env.VITE_API_URL as string);
// dev:  http://127.0.0.1:8001            → path = "/socket.io"
// prod: https://vithiru.ddns.net/scrabble → path = "/scrabble/socket.io"
const _socketPath = _apiUrl.pathname.replace(/\/$/, '') + '/socket.io';

export const socket: Socket = io(_apiUrl.origin, {
  autoConnect: false,
  path: _socketPath,
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
