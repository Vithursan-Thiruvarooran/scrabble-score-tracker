import { NewGameCard } from './NewGameCard';
import { CurrentGames } from './CurrentGames';
import { NotificationBanner } from './NotificationBanner';

interface PlaySectionProps {
  onOpenForm: () => void;
  busy: boolean;
}

export function PlaySection({ onOpenForm, busy }: PlaySectionProps) {
  return (
    <div className="w-full max-w-sm flex flex-col flex-1 min-h-0 mx-auto gap-4">
      <NotificationBanner />
      <NewGameCard disabled={busy} onOpen={onOpenForm} />
      <div className="flex flex-col flex-1 min-h-0 gap-6">
        <CurrentGames completed={false} />
        <CurrentGames completed={true} />
      </div>
    </div>
  );
}
