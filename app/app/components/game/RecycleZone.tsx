import { useDroppable } from '@dnd-kit/core';

const TILE_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

function RecycleTile({ letter, onRemove }: { letter: string; onRemove: () => void }) {
  const isBlank = letter === '' || letter === ' ';
  return (
    <div className="relative flex h-10 w-10 items-center justify-center rounded bg-amber-100 dark:bg-amber-200 border border-amber-300 dark:border-amber-400 select-none">
      <span className="text-[32px] font-bold leading-none text-gray-900">
        {isBlank ? '' : letter}
      </span>
      {!isBlank && (
        <span className="absolute bottom-0.5 right-0.5 text-[8px] font-semibold leading-none text-gray-600">
          {TILE_VALUES[letter] ?? 0}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-500 text-white text-[10px] font-bold leading-none hover:bg-gray-700 dark:bg-gray-400 dark:hover:bg-gray-600"
        aria-label={`Remove ${letter}`}
      >
        ×
      </button>
    </div>
  );
}

interface RecycleZoneProps {
  tiles: string[];
  recycleIndices: number[];
  onRemove: (originalIndex: number) => void;
}

export function RecycleZone({ tiles, recycleIndices, onRemove }: RecycleZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'recycle-zone' });

  const hasItems = recycleIndices.length > 0;

  return (
    <div
      ref={setNodeRef}
      className={`min-h-14 rounded-xl border-2 border-dashed p-3 transition-colors ${
        isOver
          ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30'
          : hasItems
          ? 'border-orange-300 bg-orange-50/60 dark:border-orange-700 dark:bg-orange-950/20'
          : 'border-gray-300 dark:border-gray-600'
      }`}
    >
      {hasItems ? (
        <div className="flex flex-wrap gap-1.5">
          {recycleIndices.map((originalIndex) => (
            <RecycleTile
              key={originalIndex}
              letter={tiles[originalIndex] ?? ''}
              onRemove={() => onRemove(originalIndex)}
            />
          ))}
        </div>
      ) : (
        <p className={`text-center text-xs transition-colors ${
          isOver ? 'text-orange-500' : 'text-gray-400 dark:text-gray-500'
        }`}>
          Drop tiles here to exchange
        </p>
      )}
    </div>
  );
}
