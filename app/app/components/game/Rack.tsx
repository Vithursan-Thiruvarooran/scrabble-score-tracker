import { useCallback } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

const TILE_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

interface RackSlotProps {
  letter: string;
  originalIndex: number;
  slotIndex: number;
  isPlaced: boolean;
}

function RackSlot({ letter, originalIndex, slotIndex, isPlaced }: RackSlotProps) {
  const isBlank = letter === '' || letter === ' ' || letter === '?';

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `rack-${originalIndex}`,
    data: { letter, rackIndex: originalIndex, source: 'rack' },
    disabled: isPlaced,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `rack-slot-${slotIndex}`,
  });

  const setRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  return (
    <div
      ref={setRef}
      {...listeners}
      {...attributes}
      className={`relative flex h-10 w-10 items-center justify-center rounded
        bg-amber-100 dark:bg-amber-200 shadow-sm border
        select-none touch-none transition-all
        ${isOver && !isDragging ? 'border-blue-400 ring-2 ring-blue-300 scale-110' : 'border-amber-300 dark:border-amber-400'}
        ${isDragging || isPlaced ? 'opacity-30 cursor-default' : 'cursor-grab active:cursor-grabbing'}
      `}
    >
      <span className="text-[32px] font-bold leading-none text-gray-900">
        {isBlank ? '' : letter}
      </span>
      {!isBlank && (
        <span className="absolute bottom-0.5 right-0.5 text-[8px] font-semibold leading-none text-gray-600">
          {TILE_VALUES[letter] ?? 0}
        </span>
      )}
    </div>
  );
}

interface RackProps {
  tiles: string[];
  rackOrder: number[];
  placedIndices?: Set<number>;
}

export function Rack({ tiles, rackOrder, placedIndices }: RackProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'rack' });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-4 space-y-3 transition-colors ${
        isOver
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
      }`}
    >
      {/* <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Your tiles
      </h2> */}
      <div className="flex gap-1.5 flex-wrap">
        {tiles.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">No tiles</p>
        ) : (
          rackOrder.map((originalIndex, slotIndex) => (
            <RackSlot
              key={originalIndex}
              letter={tiles[originalIndex] ?? ''}
              originalIndex={originalIndex}
              slotIndex={slotIndex}
              isPlaced={placedIndices?.has(originalIndex) ?? false}
            />
          ))
        )}
      </div>
    </div>
  );
}
