import { useState, useEffect, type FormEvent } from 'react';
import type { CreateGameParams, GameUser } from '../../services/game';

interface NewGameFormProps {
  loading: boolean;
  error: string | null;
  friends: GameUser[];
  onClose: () => void;
  onSubmit: (params: CreateGameParams) => void;
}

export function NewGameForm({ loading, error, friends, onClose, onSubmit }: NewGameFormProps) {
  const [opponent, setOpponent] = useState('');
  const [duration, setDuration] = useState(25);
  const [timeIncrement, setTimeIncrement] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !loading) onClose();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ opponent, duration, timeIncrement });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">New game</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Opponent</label>
            <select
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500 transition"
            >
              <option value="">Select a friend…</option>
              {friends.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.firstname} {f.lastname}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Duration (min)"
              value={duration}
              onChange={setDuration}
              min={1}
              max={60}
            />
            <NumberField
              label="Increment (sec)"
              value={timeIncrement}
              onChange={setTimeIncrement}
              min={0}
              max={60}
            />
          </div>

          {error && (
            <p className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold text-sm transition-colors disabled:cursor-not-allowed"
            >
              {loading ? 'Creating…' : 'Create game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        min={min}
        max={max}
        required
        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500 transition"
      />
    </div>
  );
}
