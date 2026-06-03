import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSwUpdate } from '../../context/ServiceWorkerUpdateContext';

interface HamburgerMenuProps {
  dotBorderColor?: string;
  inGame?: boolean;
  isGameActive?: boolean;
  onResign?: () => void;
  onLogout: () => void;
}

export function HamburgerMenu({
  dotBorderColor = 'white',
  inGame = false,
  isGameActive = false,
  onResign,
  onLogout,
}: HamburgerMenuProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const { updateAvailable, applyUpdate, checkForUpdate } = useSwUpdate();

  async function handleCheckForUpdate() {
    setMenuOpen(false);
    setCheckingUpdate(true);
    await checkForUpdate();
    setTimeout(() => setCheckingUpdate(false), 3000);
  }

  function handleProfile() {
    setMenuOpen(false);
    navigate('/profile');
  }

  function handleLogout() {
    setMenuOpen(false);
    onLogout();
  }

  function handleResign() {
    setMenuOpen(false);
    onResign?.();
  }

  return (
    <div className="shrink-0 relative">
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        className="flex items-center justify-center w-10 h-10 -mr-1 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
        aria-label="Menu"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <rect y="2" width="16" height="1.5" rx="0.75" />
          <rect y="7.25" width="16" height="1.5" rx="0.75" />
          <rect y="12.5" width="16" height="1.5" rx="0.75" />
        </svg>
      </button>
      {updateAvailable && (
        <div
          className={`absolute top-1 right-1 w-2 h-2 rounded-full border-2 border-${dotBorderColor} dark:border-gray-950 bg-blue-500 pointer-events-none`}
          title="Update available"
        />
      )}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
            {updateAvailable ? (
              <button
                type="button"
                onClick={() => { setMenuOpen(false); applyUpdate(); }}
                className="w-full px-4 py-3 text-left text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
              >
                Update available — Reload
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheckForUpdate}
                disabled={checkingUpdate}
                className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {checkingUpdate ? 'Checking for update…' : 'Check for update'}
              </button>
            )}
            <button
              type="button"
              onClick={handleProfile}
              className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Profile
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Log out
            </button>
            {inGame && isGameActive && (
              <button
                type="button"
                onClick={handleResign}
                className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                Resign
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
