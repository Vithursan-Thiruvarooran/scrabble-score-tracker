interface NewGameCardProps {
  disabled: boolean;
  onOpen: () => void;
}

export function NewGameCard({ disabled, onOpen }: NewGameCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md p-6 space-y-3">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        New game
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Create a room and share the code with your opponent.
      </p>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold text-sm transition-colors disabled:cursor-not-allowed"
      >
        Create new game
      </button>
    </div>
  );
}
