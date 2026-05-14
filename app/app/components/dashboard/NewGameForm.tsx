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
  const [dictionary, setDictionary] = useState('TWL06');
  const [boardType, setBoardType] = useState('standard');
  const [turnTimer, setTurnTimer] = useState(false);
  const [duration, setDuration] = useState(25);
  const [timeIncrement, setTimeIncrement] = useState(0);
  const [online, setOnline] = useState(true);
  const [disputes, setDisputes] = useState(false);

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
    onSubmit({
      opponent,
      dictionary,
      board_type: boardType,
      turn_timer: turnTimer,
      duration: turnTimer ? duration : null,
      timeIncrement: turnTimer ? timeIncrement : null,
      online,
      disputes,
    });
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
          {/* Opponent */}
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

          {/* Dictionary + Board type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Dictionary</label>
              <select
                value={dictionary}
                onChange={(e) => setDictionary(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500 transition"
              >
                <option value="TWL06">TWL06</option>
                <option value="SOWPODS">SOWPODS</option>
                <option value="OSPD5">OSPD5</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Board</label>
              <select
                value={boardType}
                onChange={(e) => setBoardType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500 transition"
              >
                <option value="standard">Standard</option>
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2.5">
            <Toggle
              label="Online game"
              description="Players connect remotely via the app"
              checked={online}
              onChange={setOnline}
            />
            <Toggle
              label="Turn timer"
              description="Each move is time-limited"
              checked={turnTimer}
              onChange={setTurnTimer}
            />
            <Toggle
              label="Allow disputes"
              description="Players can challenge words"
              checked={disputes}
              onChange={setDisputes}
            />
          </div>

          {/* Duration + Increment — only shown when turn timer is on */}
          {turnTimer && (
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
          )}

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

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${
          checked ? 'bg-amber-500' : 'bg-gray-200 dark:bg-gray-700'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
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
