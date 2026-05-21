interface ChallengePromptProps {
  challengerName: string;
  dictionary: string;
  disputes: boolean;
  turnTimer: boolean;
  onAccept: () => void;
  onReject: () => void;
  loading: boolean;
}

export function ChallengePrompt({
  challengerName,
  dictionary,
  disputes,
  turnTimer,
  onAccept,
  onReject,
  loading,
}: ChallengePromptProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-6 flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            You've been challenged!
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-800 dark:text-gray-200">{challengerName}</span> invited you to a game of Scrabble.
          </p>
        </div>

        <div className="rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-3 flex flex-col gap-1.5 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex justify-between">
            <span>Dictionary</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{dictionary}</span>
          </div>
          <div className="flex justify-between">
            <span>Disputes</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{disputes ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div className="flex justify-between">
            <span>Turn timer</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{turnTimer ? 'Yes' : 'No'}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Please wait…' : 'Accept challenge'}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm transition-colors disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
