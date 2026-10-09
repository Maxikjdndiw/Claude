import { MinHeap } from './world/heap';

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2],
] as const;

/**
 * A* on the cell grid with 8-connectivity.
 * `cost(from, to)` returns the cost multiplier for entering `to` (Infinity =
 * blocked); the step length (1 or √2) is multiplied in. Returns the list of
 * cells from start to goal (inclusive), or null.
 */
export function astar(
  size: number,
  start: number,
  goals: Set<number>,
  cost: (from: number, to: number) => number,
  minCost: number,
  maxNodes = 200_000,
  cornerCut = false,
): number[] | null {
  if (goals.has(start)) return [start];
  const goalList = [...goals].map((g) => [g % size, (g / size) | 0] as const);
  const h = (c: number) => {
    const x = c % size;
    const y = (c / size) | 0;
    let best = Infinity;
    for (const [gx, gy] of goalList) {
      const dx = Math.abs(gx - x);
      const dy = Math.abs(gy - y);
      const d = Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
      if (d < best) best = d;
    }
    return best * minCost;
  };
  const g = new Float64Array(size * size).fill(Infinity);
  const came = new Int32Array(size * size).fill(-1);
  const closed = new Uint8Array(size * size);
  const open = new MinHeap();
  g[start] = 0;
  open.push(start, h(start));
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    if (goals.has(cur)) {
      const path = [cur];
      let c = cur;
      while (came[c] >= 0) {
        c = came[c];
        path.push(c);
      }
      return path.reverse();
    }
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;
    const x = cur % size;
    const y = (cur / size) | 0;
    for (const [dx, dy, len] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (closed[n]) continue;
      // No corner cutting through blocked cells on diagonals.
      if (!cornerCut && dx !== 0 && dy !== 0) {
        if (!isFinite(cost(cur, y * size + nx)) || !isFinite(cost(cur, ny * size + x))) continue;
      }
      const c = cost(cur, n);
      if (!isFinite(c)) continue;
      const ng = g[cur] + c * len;
      if (ng < g[n]) {
        g[n] = ng;
        came[n] = cur;
        open.push(n, ng + h(n));
      }
    }
  }
  return null;
}

/** Length of a cell path in km (cells), counting diagonals as √2. */
export function pathLength(size: number, path: number[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const diag = a % size !== b % size && ((a / size) | 0) !== ((b / size) | 0);
    len += diag ? Math.SQRT2 : 1;
  }
  return len;
}
