import { useState } from 'react';
import * as authService from '../../services/auth';

const TILES = ['S', 'C', 'R', 'A', 'B', 'B', 'L', 'E'];

interface AuthPageProps {
  onAuth: (token: string) => void;
}

export function AuthPage({ onAuth }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setError('');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { access_token } = await authService.login(loginEmail, loginPassword);
      onAuth(access_token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.register(firstname, lastname, regEmail, regPassword);
      const { access_token } = await authService.login(regEmail, regPassword);
      onAuth(access_token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50 dark:bg-gray-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex gap-1 mb-4">
            {TILES.map((letter, i) => (
              <span
                key={i}
                className="w-8 h-8 flex items-center justify-center bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold rounded text-sm shadow-sm"
              >
                {letter}
              </span>
            ))}
          </div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Score Tracker</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track every word, every point</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md overflow-hidden">
          <div className="flex border-b border-gray-100 dark:border-gray-800">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  mode === m
                    ? 'text-amber-700 dark:text-amber-400 border-b-2 border-amber-500'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {m === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <Field label="Email" type="email" value={loginEmail} onChange={setLoginEmail} />
                <Field label="Password" type="password" value={loginPassword} onChange={setLoginPassword} />
                <SubmitButton loading={loading} label="Log In" loadingLabel="Logging in…" />
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" type="text" value={firstname} onChange={setFirstname} />
                  <Field label="Last name" type="text" value={lastname} onChange={setLastname} />
                </div>
                <Field label="Email" type="email" value={regEmail} onChange={setRegEmail} />
                <Field label="Password" type="password" value={regPassword} onChange={setRegPassword} />
                <SubmitButton loading={loading} label="Create Account" loadingLabel="Creating account…" />
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={type === 'password' ? 8 : undefined}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500 transition"
      />
    </div>
  );
}

function SubmitButton({
  loading,
  label,
  loadingLabel,
}: {
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold text-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
    >
      {loading ? loadingLabel : label}
    </button>
  );
}
