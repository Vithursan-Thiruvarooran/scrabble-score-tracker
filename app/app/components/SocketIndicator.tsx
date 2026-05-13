import { useEffect, useState } from 'react';
import { socket, connectSocket } from '../socket';

export function SocketIndicator() {
  const [connected, setConnected] = useState(socket.connected);
  const [hasConnected, setHasConnected] = useState(socket.connected);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      setHasConnected(true);
    }
    function onDisconnect() {
      setConnected(false);
    }
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  if (!hasConnected) return null;

  function handleReconnect() {
    const token = localStorage.getItem('auth_token') ?? '';
    connectSocket(token);
  }

  return (
    <div className="fixed top-3 right-3 flex items-center gap-1.5 z-50">
      {connected ? (
        <div
          className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-sm"
          title="Connected"
        />
      ) : (
        <>
          <button
            onClick={handleReconnect}
            title="Reconnect"
            className="flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path
                fillRule="evenodd"
                d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <div
            className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm"
            title="Disconnected"
          />
        </>
      )}
    </div>
  );
}
