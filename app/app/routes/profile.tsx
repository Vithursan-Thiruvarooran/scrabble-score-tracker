import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { updateMe, deleteMe } from '../services/user';

export function meta() {
  return [{ title: 'Profile — Scrabble Score Tracker' }];
}

export default function ProfileRoute() {
  const { token, user, ready, refreshUser, logout } = useAuth();
  const { notify } = useNotifications();
  const navigate = useNavigate();

  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (ready && !token) navigate('/', { replace: true });
  }, [ready, token, navigate]);

  useEffect(() => {
    if (user) {
      setFirstname(user.firstname);
      setLastname(user.lastname);
    }
  }, [user]);

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    setNameError('');
    setNameBusy(true);
    try {
      await updateMe(token, { firstname, lastname });
      await refreshUser();
      notify({ message: 'Name updated', key: 'profile-name-update' });
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : 'Failed to update name');
    } finally {
      setNameBusy(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPasswordError('');
    setPasswordBusy(true);
    try {
      await updateMe(token, { password: newPassword });
      setNewPassword('');
      setConfirmPassword('');
      notify({ message: 'Password updated', key: 'profile-password-update' });
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleDelete() {
    setDeleteBusy(true);
    try {
      await deleteMe(token);
      logout();
      navigate('/', { replace: true });
    } catch {
      setDeleteBusy(false);
    }
  }

  if (!ready || !user) return null;

  return (
    <div className="min-h-screen bg-amber-50 dark:bg-gray-950 px-4 pt-safe pb-10">
      <div className="max-w-sm mx-auto">
        <header className="py-6 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M10.5 3L5.5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Profile</h1>
        </header>

        <div className="space-y-4">
          {/* Info section */}
          <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Account Info</h2>
            </div>
            <form onSubmit={handleUpdateName} className="p-4 space-y-4">
              <Field label="Email" type="email" value={user.email} onChange={() => {}} disabled />
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name" type="text" value={firstname} onChange={setFirstname} />
                <Field label="Last name" type="text" value={lastname} onChange={setLastname} />
              </div>
              {nameError && (
                <p className="text-sm text-red-600 dark:text-red-400">{nameError}</p>
              )}
              <SaveButton loading={nameBusy} label="Save changes" loadingLabel="Saving…" />
            </form>
          </section>

          {/* Password section */}
          <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Change Password</h2>
            </div>
            <form onSubmit={handleUpdatePassword} className="p-4 space-y-4">
              <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} minLength={8} />
              <Field label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} minLength={8} />
              {passwordError && (
                <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
              )}
              <SaveButton loading={passwordBusy} label="Change password" loadingLabel="Updating…" />
            </form>
          </section>

          {/* Danger zone */}
          <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-red-400 dark:text-red-500">Danger Zone</h2>
            </div>
            <div className="p-4">
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full py-2.5 rounded-xl border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30 active:bg-red-100 dark:active:bg-red-950/50 transition-colors"
                >
                  Delete my account
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This will permanently disable your account. Your data will be retained but you won't be able to log in again.
                  </p>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteBusy}
                    className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    {deleteBusy ? 'Deleting…' : 'Yes, delete my account'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="w-full py-2.5 rounded-xl text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>
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
  disabled,
  minLength,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  minLength?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={!disabled}
        disabled={disabled}
        minLength={minLength}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function SaveButton({
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
