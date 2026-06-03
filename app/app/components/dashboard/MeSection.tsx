import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { InitialsAvatar } from './InitialsAvatar';

interface MeSectionProps {
  onLogout: () => void;
}

export function MeSection({ onLogout }: MeSectionProps) {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm px-5 py-6 flex flex-col items-center gap-3">
        <InitialsAvatar firstname={user.firstname} lastname={user.lastname} size="lg" />
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            {user.firstname} {user.lastname}
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{user.email}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
        <Link
          to="/profile"
          className="flex items-center justify-between px-4 py-3.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
        >
          <span>Edit Profile</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </Link>
        <div className="h-px bg-gray-100 dark:bg-gray-800" />
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 active:bg-red-100 dark:active:bg-red-950/50 transition-colors"
        >
          <span>Log out</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
