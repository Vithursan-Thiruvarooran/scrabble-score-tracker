import { useEffect, useState } from 'react';
import { AddFriendCard } from './AddFriendCard';
import { InitialsAvatar } from './InitialsAvatar';
import * as userService from '../../services/user';
import type { GameUser } from '../../services/user';
import { useAuth } from '../../context/AuthContext';

export function FriendsSection() {
  const { token } = useAuth();
  const [friends, setFriends] = useState<GameUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    userService.getFriends(token)
      .then(setFriends)
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="w-full max-w-sm flex flex-col flex-1 min-h-0 mx-auto gap-4">
      <AddFriendCard />

      <div className="flex flex-col flex-1 min-h-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
          Friends · {loading ? '…' : friends.length}
        </h2>
        <div className="flex-1 overflow-y-auto pr-0.5">
          {loading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>
          ) : friends.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No friends yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {friends.map((friend) => (
                <li
                  key={friend.id}
                  className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 rounded-2xl shadow-sm"
                >
                  <InitialsAvatar firstname={friend.firstname} lastname={friend.lastname} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                      {friend.firstname} {friend.lastname}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{friend.email}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
