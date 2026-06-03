export type Tab = 'play' | 'friends' | 'me';

interface NavBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'play',
    label: 'Play',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.9" />
        <rect x="13" y="1" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.6" />
        <rect x="1" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.6" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.9" />
      </svg>
    ),
  },
  {
    id: 'friends',
    label: 'Friends',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 'me',
    label: 'Me',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export function NavBar({ active, onChange }: NavBarProps) {
  return (
    <nav className="shrink-0 pb-safe bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 -mx-4">
      <div className="flex w-full sm:max-w-sm sm:mx-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors ${
                isActive
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 active:text-gray-700 dark:active:text-gray-200'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-amber-500 dark:bg-amber-400" />
              )}
              {tab.icon}
              <span className="text-[10px] font-semibold tracking-wide uppercase">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
