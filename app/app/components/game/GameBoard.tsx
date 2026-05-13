import { useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

const TILE_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

type SquareType = 'TW' | 'DW' | 'TL' | 'DL' | 'center' | 'normal';

const TW_SQUARES = new Set([
  '0,0', '0,7', '0,14',
  '7,0', '7,14',
  '14,0', '14,7', '14,14',
]);

const TL_SQUARES = new Set([
  '1,5', '1,9',
  '5,1', '5,5', '5,9', '5,13',
  '9,1', '9,5', '9,9', '9,13',
  '13,5', '13,9',
]);

const DL_SQUARES = new Set([
  '0,3', '0,11',
  '2,6', '2,8',
  '3,0', '3,7', '3,14',
  '6,2', '6,6', '6,8', '6,12',
  '7,3', '7,11',
  '8,2', '8,6', '8,8', '8,12',
  '11,0', '11,7', '11,14',
  '12,6', '12,8',
  '14,3', '14,11',
]);

function getSquareType(row: number, col: number): SquareType {
  if (row === 7 && col === 7) return 'center';
  const key = `${row},${col}`;
  if (TW_SQUARES.has(key)) return 'TW';
  if (TL_SQUARES.has(key)) return 'TL';
  if (DL_SQUARES.has(key)) return 'DL';
  if (
    (row === col && row >= 1 && row <= 4) ||
    (row + col === 14 && row >= 1 && row <= 4) ||
    (row === col && row >= 10 && row <= 13) ||
    (row + col === 14 && row >= 10 && row <= 13)
  ) return 'DW';
  return 'normal';
}

const EMPTY_SQUARE_CLASSES: Record<SquareType, string> = {
  TW: 'bg-red-600',
  DW: 'bg-rose-300',
  TL: 'bg-blue-700',
  DL: 'bg-sky-300',
  center: 'bg-rose-300',
  normal: 'bg-green-800',
};

const SQUARE_LABELS: Record<SquareType, string> = {
  TW: 'TW', DW: 'DW', TL: 'TL', DL: 'DL', center: '★', normal: '',
};

const LABEL_TEXT_CLASSES: Record<SquareType, string> = {
  TW: 'text-white', DW: 'text-white', TL: 'text-white',
  DL: 'text-white', center: 'text-white', normal: '',
};

const EMPTY_BOARD: (string | null)[][] = Array.from({ length: 15 }, () =>
  Array.from({ length: 15 }, () => null)
);

export type PendingPlacements = Record<string, { letter: string; rackIndex: number; isBlank?: boolean }>;

function DraggableTile({ row, col, letter, isBlank }: { row: number; col: number; letter: string; isBlank?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `board-${row}-${col}`,
    data: { letter, source: 'board', fromKey: `${row}-${col}` },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none transition-opacity ${isDragging ? 'opacity-30' : ''}`}
    >
      <span className="text-[clamp(14px,5vw,32px)] font-bold text-gray-900 leading-none select-none">
        {letter.toUpperCase()}
      </span>
      <span className="absolute bottom-0 right-[1px] text-[clamp(5px,1.5vw,11px)] font-semibold text-gray-600 leading-none select-none">
        {isBlank ? 0 : (TILE_VALUES[letter] ?? 0)}
      </span>
    </div>
  );
}

interface BoardCellProps {
  row: number;
  col: number;
  letter: string | null;
  isPending: boolean;
  isBlank?: boolean;
  isValidPlay: boolean;
  squareType: SquareType;
}

function BoardCell({ row, col, letter, isPending, isBlank, isValidPlay, squareType }: BoardCellProps) {
  const occupied = letter !== null;
  const { setNodeRef, isOver } = useDroppable({
    id: `${row}-${col}`,
    disabled: occupied,
  });

  let bgClass: string;
  if (occupied) {
    if (isPending) {
      bgClass = isValidPlay
        ? 'bg-amber-200 dark:bg-amber-300 ring-2 ring-inset ring-green-500'
        : 'bg-amber-200 dark:bg-amber-300 ring-2 ring-inset ring-blue-400';
    } else {
      bgClass = 'bg-amber-100 dark:bg-amber-200';
    }
  } else {
    bgClass = isOver ? 'brightness-125 ' + EMPTY_SQUARE_CLASSES[squareType] : EMPTY_SQUARE_CLASSES[squareType];
  }

  return (
    <div
      ref={setNodeRef}
      className={`relative aspect-square flex items-center justify-center transition-[filter] ${bgClass}`}
    >
      {occupied ? (
        isPending ? (
          <DraggableTile row={row} col={col} letter={letter} isBlank={isBlank} />
        ) : (
          <>
            <span className="text-[clamp(14px,5vw,32px)] font-bold text-gray-900 leading-none select-none">
              {letter.toUpperCase()}
            </span>
            <span className="absolute bottom-0 right-[1px] text-[clamp(5px,1.5vw,11px)] font-semibold text-gray-600 leading-none select-none">
              {TILE_VALUES[letter] ?? 0}
            </span>
          </>
        )
      ) : (
        squareType !== 'normal' && (
          <span className={`text-[clamp(5px,1.3vw,9px)] font-bold leading-tight text-center select-none ${LABEL_TEXT_CLASSES[squareType]}`}>
            {SQUARE_LABELS[squareType]}
          </span>
        )
      )}
    </div>
  );
}

interface GameBoardProps {
  board?: (string | null)[][] | null;
  pendingPlacements?: PendingPlacements;
  isValidPlay?: boolean;
}

export function GameBoard({ board, pendingPlacements, isValidPlay = false }: GameBoardProps) {
  const mergedBoard = useMemo(() => {
    const base = board ?? EMPTY_BOARD;
    return base.map((row, r) =>
      row.map((cell, c) => {
        const pending = pendingPlacements?.[`${r}-${c}`];
        return pending ? pending.letter : cell;
      })
    );
  }, [board, pendingPlacements]);

  return (
    <div className="space-y-3">
      {/* <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 px-6">
        Board
      </h2> */}
      <div
        className="grid gap-px bg-gray-400 dark:bg-gray-600 rounded overflow-hidden w-full"
        style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}
      >
        {mergedBoard.map((row, r) =>
          row.map((letter, c) => (
            <BoardCell
              key={`${r}-${c}`}
              row={r}
              col={c}
              letter={letter}
              isPending={Boolean(pendingPlacements?.[`${r}-${c}`])}
              isBlank={pendingPlacements?.[`${r}-${c}`]?.isBlank}
              isValidPlay={isValidPlay}
              squareType={getSquareType(r, c)}
            />
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500 dark:text-gray-400 px-6">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-600" /> Triple Word</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-300" /> Double Word</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-700" /> Triple Letter</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-300" /> Double Letter</span>
      </div>
    </div>
  );
}
