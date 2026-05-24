import { TILE_VALUES } from './tiles';

type Board = (string | null)[][];
type PendingTile = { letter: string; isBlank?: boolean };
type Placements = Record<string, PendingTile>;

// Premium square predicates — match server/services/scoring.py exactly
function isTW(r: number, c: number): boolean {
  return [0, 7, 14].includes(r) && [0, 7, 14].includes(c) && !(r === 7 && c === 7);
}
function isDW(r: number, c: number): boolean {
  if (r === 7 && c === 7) return true; // center
  return (r === c || r + c === 14) && ((r >= 1 && r <= 4) || (r >= 10 && r <= 13));
}
const TL = new Set([
  '1,5','1,9','5,1','5,5','5,9','5,13',
  '9,1','9,5','9,9','9,13','13,5','13,9',
]);
const DL = new Set([
  '0,3','0,11','2,6','2,8','3,0','3,7','3,14',
  '6,2','6,6','6,8','6,12','7,3','7,11',
  '8,2','8,6','8,8','8,12','11,0','11,7','11,14',
  '12,6','12,8','14,3','14,11',
]);

function wordCells(board: Board, row: number, col: number, dr: number, dc: number): [number, number][] {
  let r = row;
  let c = col;
  while (r - dr >= 0 && r - dr < 15 && c - dc >= 0 && c - dc < 15 && board[r - dr][c - dc] !== null) {
    r -= dr;
    c -= dc;
  }
  const cells: [number, number][] = [];
  while (r >= 0 && r < 15 && c >= 0 && c < 15 && board[r][c] !== null) {
    cells.push([r, c]);
    r += dr;
    c += dc;
  }
  return cells;
}

function scoreWord(
  board: Board,
  blankKeys: Set<string>,
  newKeys: Set<string>,
  cells: [number, number][],
): number {
  let letterTotal = 0;
  let wordMult = 1;
  for (const [r, c] of cells) {
    const letter = board[r][c];
    const key = `${r},${c}`;
    // Blanks: pending blanks tracked in blankKeys; committed blanks stored lowercase on board
    const isBlank = blankKeys.has(key) || (letter !== null && letter === letter.toLowerCase() && letter !== letter.toUpperCase());
    let val = isBlank ? 0 : (TILE_VALUES[(letter ?? '').toUpperCase()] ?? 0);
    if (newKeys.has(key)) {
      if (TL.has(key)) val *= 3;
      else if (DL.has(key)) val *= 2;
      if (isTW(r, c)) wordMult *= 3;
      else if (isDW(r, c)) wordMult *= 2;
    }
    letterTotal += val;
  }
  return letterTotal * wordMult;
}

export function calculatePendingScore(board: Board, placements: Placements): number {
  const entries = Object.entries(placements);
  if (entries.length === 0) return 0;

  // Build merged board with pending tiles applied
  const merged: Board = board.map(row => [...row]);
  const newKeys = new Set<string>();
  const blankKeys = new Set<string>();

  for (const [key, tile] of entries) {
    const [r, c] = key.split('-').map(Number);
    merged[r][c] = tile.letter;
    newKeys.add(`${r},${c}`);
    if (tile.isBlank) blankKeys.add(`${r},${c}`);
  }

  const newTiles = entries.map(([key, tile]) => {
    const [r, c] = key.split('-').map(Number);
    return { row: r, col: c, letter: tile.letter };
  });

  const rows = new Set(newTiles.map(t => t.row));
  const cols = new Set(newTiles.map(t => t.col));
  const isHorizontal = rows.size === 1;
  const isVertical = cols.size === 1;

  let total = 0;
  const scored = new Set<string>();

  const mainDirs: [number, number][] = [];
  if (isHorizontal) mainDirs.push([0, 1]);
  if (isVertical) mainDirs.push([1, 0]);

  for (const [dr, dc] of mainDirs) {
    const { row: r0, col: c0 } = newTiles[0];
    const main = wordCells(merged, r0, c0, dr, dc);
    if (main.length > 1) {
      const key = JSON.stringify(main);
      if (!scored.has(key)) {
        scored.add(key);
        total += scoreWord(merged, blankKeys, newKeys, main);
      }
    }
    const [cdr, cdc] = [dc, dr];
    for (const t of newTiles) {
      const cross = wordCells(merged, t.row, t.col, cdr, cdc);
      if (cross.length > 1) {
        const key = JSON.stringify(cross);
        if (!scored.has(key)) {
          scored.add(key);
          total += scoreWord(merged, blankKeys, newKeys, cross);
        }
      }
    }
  }

  if (newTiles.length === 7) total += 50;

  return total;
}

// Returns the "row-col" key of the tile where the score badge should appear
// (rightmost for horizontal, bottommost for vertical, only tile for single)
export function getLastPendingKey(placements: Placements): string | null {
  const keys = Object.keys(placements);
  if (keys.length === 0) return null;
  const positions = keys.map(k => { const [r, c] = k.split('-').map(Number); return { r, c, key: k }; });
  const rows = new Set(positions.map(p => p.r));
  if (rows.size === 1) {
    // Horizontal — rightmost column
    return positions.reduce((a, b) => b.c > a.c ? b : a).key;
  }
  // Vertical or single — bottommost row
  return positions.reduce((a, b) => b.r > a.r ? b : a).key;
}
