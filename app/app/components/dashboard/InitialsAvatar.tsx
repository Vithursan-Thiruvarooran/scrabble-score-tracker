interface InitialsAvatarProps {
  firstname: string;
  lastname: string;
  size?: 'sm' | 'lg';
}

export function InitialsAvatar({ firstname, lastname, size = 'sm' }: InitialsAvatarProps) {
  const initials = `${firstname[0] ?? ''}${lastname[0] ?? ''}`.toUpperCase();
  return (
    <div
      className={`shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-700 dark:text-amber-400 font-bold ${
        size === 'lg' ? 'w-16 h-16 text-2xl' : 'w-9 h-9 text-sm'
      }`}
    >
      {initials}
    </div>
  );
}
