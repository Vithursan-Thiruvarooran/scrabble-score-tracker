import { useEffect, useState } from 'react';
import * as gameService from '../../services/game';
import type { FriendRequest, GameUser } from '../../services/game';
import { useAuth } from '../../context/AuthContext';

export function AddFriendCard() {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [allUsers, setAllUsers] = useState<GameUser[]>([]);
  const [sent, setSent] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});

  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [accepting, setAccepting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    gameService.getAllUsers(token).then(setAllUsers).catch(() => {});
    gameService.getFriendRequests(token).then(setRequests).catch(() => {});
  }, [token]);

  const filtered = query.trim()
    ? allUsers.filter((u) => {
        const q = query.toLowerCase();
        return (
          u.firstname.toLowerCase().includes(q) ||
          u.lastname.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
        );
      })
    : [];

  async function handleAdd(user: GameUser) {
    setSent((prev) => ({ ...prev, [user.id]: 'sending' }));
    try {
      await gameService.addFriend(user.id, token);
      setSent((prev) => ({ ...prev, [user.id]: 'sent' }));
    } catch {
      setSent((prev) => ({ ...prev, [user.id]: 'error' }));
    }
  }

  async function handleAccept(req: FriendRequest) {
    setAccepting((prev) => ({ ...prev, [req.id]: true }));
    try {
      await gameService.acceptFriend(req.id, token);
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch {
      setAccepting((prev) => ({ ...prev, [req.id]: false }));
    }
  }

  const senderName = (req: FriendRequest) => {
    const user = allUsers.find((u) => u.id === req.userId);
    return user ? `${user.firstname} ${user.lastname}` : req.userId;
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md p-6 space-y-3">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        Add a friend
      </h2>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500 transition"
      />

      {filtered.length > 0 && (
        <ul className="space-y-2 max-h-48 overflow-y-auto">
          {filtered.map((user) => {
            const state = sent[user.id];
            return (
              <li
                key={user.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {user.firstname} {user.lastname}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdd(user)}
                  disabled={state === 'sending' || state === 'sent'}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:cursor-not-allowed text-white disabled:opacity-50 ${
                    state === 'sent'
                      ? 'bg-green-500'
                      : state === 'error'
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-amber-500 hover:bg-amber-600'
                  }`}
                >
                  {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Sent' : state === 'error' ? 'Retry' : 'Add'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {query.trim() && filtered.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No users found.</p>
      )}

      <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
        <button
          type="button"
          onClick={() => setRequestsOpen((o) => !o)}
          className="flex items-center justify-between w-full text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          <span>
            Friend requests
            {requests.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                {requests.length}
              </span>
            )}
          </span>
          <span className="text-gray-400 dark:text-gray-500 text-xs">{requestsOpen ? '▲' : '▼'}</span>
        </button>

        {requestsOpen && (
          <div className="mt-2">
            {requests.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-1">No pending requests.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {requests.map((req) => (
                  <li
                    key={req.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate min-w-0">
                      {senderName(req)}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleAccept(req)}
                      disabled={accepting[req.id]}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
                    >
                      {accepting[req.id] ? 'Accepting…' : 'Accept'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
