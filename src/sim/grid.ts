import { BUILDING } from '../data/buildings';
import type { GameState } from './state';
import { layoutTowns } from './world/townLayout';
import type { World } from './world/types';

export const TOWN_CELL = -2;

/**
 * Derived occupancy grid (not saved): which building or town occupies each cell.
 * 0 = free, >0 = building id, TOWN_CELL = houses.
 */
export class Occupancy {
  readonly cells: Int32Array;
  constructor(private world: World) {
    this.cells = new Int32Array(world.size * world.size);
  }

  rebuild(state: GameState): void {
    this.cells.fill(0);
    for (const l of layoutTowns(this.world, state.towns)) for (const c of l.cells) this.cells[c] = TOWN_CELL;
    for (const b of state.buildings) this.mark(b.id, b.type, b.x, b.y);
  }

  mark(id: number, type: string, x: number, y: number): void {
    const [w, h] = BUILDING[type].footprint;
    for (let oy = 0; oy < h; oy++) for (let ox = 0; ox < w; ox++) this.cells[(y + oy) * this.world.size + x + ox] = id;
  }

  clear(id: number): void {
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === id) this.cells[i] = 0;
  }

  at(x: number, y: number): number {
    return this.cells[y * this.world.size + x];
  }

  /** Cell indices of a footprint. */
  footprintCells(type: string, x: number, y: number): number[] {
    const [w, h] = BUILDING[type].footprint;
    const out: number[] = [];
    for (let oy = 0; oy < h; oy++) for (let ox = 0; ox < w; ox++) out.push((y + oy) * this.world.size + x + ox);
    return out;
  }
}
