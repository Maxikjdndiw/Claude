import { BUILDING } from '../data/buildings';
import type { GameState } from './state';
import { layoutTowns, type TownLayout } from './world/townLayout';
import type { World } from './world/types';

export const TOWN_CELL = -2;

/**
 * Derived spatial caches (not saved): which building or town occupies each
 * cell, where the roads are, and how large each town is.
 */
export class Occupancy {
  /** 0 = free, >0 = building id, TOWN_CELL = houses. */
  readonly cells: Int32Array;
  readonly road: Uint8Array;
  /** Town id -> radius of its houses (km). */
  townRadius: number[] = [];
  layouts: TownLayout[] = [];

  constructor(private world: World) {
    this.cells = new Int32Array(world.size * world.size);
    this.road = new Uint8Array(world.size * world.size);
  }

  rebuild(state: GameState): void {
    const size = this.world.size;
    this.cells.fill(0);
    this.road.fill(0);
    for (const c of state.roads) this.road[c] = 1;
    for (const b of state.buildings) this.mark(b.id, b.type, b.x, b.y);
    const layouts = layoutTowns(this.world, state.towns, (c) => this.road[c] === 1 || this.cells[c] > 0);
    this.townRadius = [];
    this.layouts = layouts;
    for (const l of layouts) {
      const t = state.towns[l.town];
      let r = 2;
      for (const c of l.cells) {
        this.cells[c] = TOWN_CELL;
        r = Math.max(r, Math.hypot((c % size) - t.x, ((c / size) | 0) - t.y));
      }
      this.townRadius[l.town] = r + 1.5;
    }
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
