import type { PendingPlacements } from '../components/game/GameBoard';

export function validatePlay(
  pendingPlacements: PendingPlacements,
  board: (string | null)[][] | null | undefined,
): boolean {
  const keys = Object.keys(pendingPlacements);
  if (keys.length === 0) return false;

  const positions = keys.map((key) => {
    const [r, c] = key.split('-').map(Number);
    return { row: r, col: c };
  });

  const rowSet = new Set(positions.map((p) => p.row));
  const colSet = new Set(positions.map((p) => p.col));

  // All pending tiles must be in the same row or the same column
  const isHorizontal = rowSet.size === 1;
  const isVertical = colSet.size === 1;
  if (!isHorizontal && !isVertical) return false;

  // No empty gaps between first and last tile; existing board tiles may fill gaps
  if (positions.length > 1) {
    if (isHorizontal) {
      const row = [...rowSet][0];
      const minCol = Math.min(...positions.map((p) => p.col));
      const maxCol = Math.max(...positions.map((p) => p.col));
      for (let c = minCol; c <= maxCol; c++) {
        if (!colSet.has(c) && !board?.[row]?.[c]) return false;
      }
    } else {
      const col = [...colSet][0];
      const minRow = Math.min(...positions.map((p) => p.row));
      const maxRow = Math.max(...positions.map((p) => p.row));
      for (let r = minRow; r <= maxRow; r++) {
        if (!rowSet.has(r) && !board?.[r]?.[col]) return false;
      }
    }
  }

  const boardHasTiles = board?.some((row) => row.some((cell) => cell !== null)) ?? false;

  // First move: must cover the center star (7, 7)
  if (!boardHasTiles) {
    return positions.some((p) => p.row === 7 && p.col === 7);
  }

  // Subsequent moves: must touch at least one committed tile.
  // An existing tile within the run (filling a gap) counts as a connection.
  if (isHorizontal) {
    const row = [...rowSet][0];
    const minCol = Math.min(...positions.map((p) => p.col));
    const maxCol = Math.max(...positions.map((p) => p.col));
    for (let c = minCol; c <= maxCol; c++) {
      if (!colSet.has(c) && board?.[row]?.[c]) return true;
    }
  } else {
    const col = [...colSet][0];
    const minRow = Math.min(...positions.map((p) => p.row));
    const maxRow = Math.max(...positions.map((p) => p.row));
    for (let r = minRow; r <= maxRow; r++) {
      if (!rowSet.has(r) && board?.[r]?.[col]) return true;
    }
  }

  // Any pending tile orthogonally adjacent to a committed tile also counts
  const DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  return positions.some(({ row, col }) =>
    DIRS.some(([dr, dc]) => {
      const nr = row + dr;
      const nc = col + dc;
      return nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board?.[nr]?.[nc] != null;
    })
  );
}
