import type { GameState } from './state';
import type { World } from './world/types';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Set a vertex height and remember it in the save game. */
export function setVertexHeight(world: World, state: GameState, vi: number, h: number): void {
  world.heights[vi] = h;
  state.terrainEdits[vi] = Math.round(h * 1000) / 1000;
}

/** Flatten the terrain under a footprint (cells x..x+w-1, y..y+h-1) to its mean height. */
export function flattenFootprint(world: World, state: GameState, x: number, y: number, w: number, h: number): Rect {
  const n = world.n;
  let sum = 0;
  let cnt = 0;
  for (let vy = y; vy <= y + h; vy++)
    for (let vx = x; vx <= x + w; vx++) {
      sum += world.heights[vy * n + vx];
      cnt++;
    }
  const avg = Math.max(0.15, sum / cnt);
  for (let vy = y; vy <= y + h; vy++) for (let vx = x; vx <= x + w; vx++) setVertexHeight(world, state, vy * n + vx, avg);
  return { x0: x, y0: y, x1: x + w, y1: y + h };
}

/** Re-apply saved terrain edits to a freshly generated world. */
export function applyTerrainEdits(world: World, state: GameState): void {
  for (const [k, h] of Object.entries(state.terrainEdits)) world.heights[Number(k)] = h;
}
