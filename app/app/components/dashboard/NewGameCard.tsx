interface NewGameCardProps {
  disabled: boolean;
  onOpen: () => void;
}

export function NewGameCard({ disabled, onOpen }: NewGameCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors shadow-sm"
    >
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5H3.75a.75.75 0 010-1.5h5.5V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
      </svg>
      New game
    </button>
  );
}
