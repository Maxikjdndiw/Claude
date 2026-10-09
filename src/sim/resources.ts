import { BIOME_IDS } from '../data/biomes';
import { BUILDING, type BuildingDef } from '../data/buildings';
import { INFRA } from '../data/transport';
import { RESOURCES } from '../data/resources';
import { emit } from './events';
import { book } from './finance';
import type { Sim } from './sim';
import type { Building, Deposit, GameState } from './state';
import { regrowthFactor } from './tech';
import { setVertexHeight, type Rect } from './terrainEdit';
import type { World } from './world/types';

/**
 * Natural resources during play:
 *  - Forests and fish stocks are renewable: harvesting lowers them, they
 *    regrow logistically (fast when partly depleted, slowly near capacity or
 *    when almost gone). Over-harvesting is a real risk.
 *  - Deposits are finite: every ton mined is gone, and output declines as
 *    the deposit is exhausted. Mines dig a visible open pit.
 */

export const FOREST_RADIUS = 4;
export const FISH_RADIUS = 6;
/** Density units removed per ton harvested. */
const FOREST_PER_TON = 0.0045;
const FISH_PER_TON = 0.0035;

export function forestAt(state: GameState, world: World, cell: number): number {
  return state.fields.forest[cell] ?? world.forest[cell];
}

export function fishAt(state: GameState, world: World, cell: number): number {
  return state.fields.fish[cell] ?? world.fish[cell];
}

function cellsAround(world: World, cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  const ri = Math.ceil(r);
  for (let y = Math.floor(cy) - ri; y <= Math.floor(cy) + ri; y++)
    for (let x = Math.floor(cx) - ri; x <= Math.floor(cx) + ri; x++) {
      if (x < 0 || y < 0 || x >= world.size || y >= world.size) continue;
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
      out.push(y * world.size + x);
    }
  return out;
}

function centerOf(def: BuildingDef, x: number, y: number) {
  return { x: x + def.footprint[0] / 2, y: y + def.footprint[1] / 2 };
}

function isOcean(world: World, c: number): boolean {
  const b = BIOME_IDS[world.biome[c]];
  return b === 'ocean' || b === 'deep';
}

export function isCoastal(world: World, def: BuildingDef, x: number, y: number): boolean {
  const [w, h] = def.footprint;
  for (let cy = y - 1; cy <= y + h; cy++)
    for (let cx = x - 1; cx <= x + w; cx++) {
      if (cx < 0 || cy < 0 || cx >= world.size || cy >= world.size) continue;
      if (isOcean(world, cy * world.size + cx)) return true;
    }
  return false;
}

/** Find a deposit of `resource` that a building at (x, y) could mine. */
export function depositFor(state: GameState, def: BuildingDef, x: number, y: number): Deposit | null {
  const c = centerOf(def, x, y);
  let best: Deposit | null = null;
  let bd = Infinity;
  for (const d of state.deposits) {
    if (d.resource !== def.site.resource || d.hidden || d.amount <= 0) continue;
    const dist = Math.hypot(d.x + 0.5 - c.x, d.y + 0.5 - c.y);
    if (dist <= d.radius + 3.5 && dist < bd) {
      bd = dist;
      best = d;
    }
  }
  return best;
}

/** Productivity factor of a site for resource-based buildings (1 = normal). */
export function resourceSiteFactor(state: GameState, world: World, def: BuildingDef, x: number, y: number): number {
  const c = centerOf(def, x, y);
  if (def.site.kind === 'forest') {
    const cells = cellsAround(world, c.x, c.y, FOREST_RADIUS);
    const avg = cells.reduce((a, k) => a + forestAt(state, world, k), 0) / Math.max(1, cells.length);
    return Math.min(1.15, avg * 1.7);
  }
  if (def.site.kind === 'fish') {
    const cells = cellsAround(world, c.x, c.y, FISH_RADIUS).filter((k) => world.fish[k] > 0);
    if (!cells.length) return 0;
    const sum = cells.reduce((a, k) => a + fishAt(state, world, k), 0);
    return Math.min(1.2, sum / 22);
  }
  if (def.site.kind === 'deposit') {
    const d = depositFor(state, def, x, y);
    if (!d) return 0;
    // Output declines as the deposit empties (deeper, poorer ore).
    return 0.55 + 0.45 * (d.amount / d.initial);
  }
  return 1;
}

/** Remove harvested tons from forests or fish stocks around a building. */
export function harvest(sim: Sim, b: Building, tons: number): void {
  const def = BUILDING[b.type];
  const { world, state } = sim;
  const c = centerOf(def, b.x, b.y);
  if (def.site.kind === 'forest') {
    const cells = cellsAround(world, c.x, c.y, FOREST_RADIUS).filter((k) => forestAt(state, world, k) > 0.02);
    if (!cells.length) return;
    const per = (tons * FOREST_PER_TON) / cells.length;
    for (const k of cells) state.fields.forest[k] = Math.max(0, forestAt(state, world, k) - per);
    sim.forestDirty = true;
  } else if (def.site.kind === 'fish') {
    const cells = cellsAround(world, c.x, c.y, FISH_RADIUS).filter((k) => fishAt(state, world, k) > 0.01);
    if (!cells.length) return;
    const per = (tons * FISH_PER_TON) / cells.length;
    for (const k of cells) state.fields.fish[k] = Math.max(0, fishAt(state, world, k) - per);
  }
}

/** Logistic regrowth of forests and fish stocks (only cells that changed). */
export function regrow(sim: Sim): void {
  const { world, state } = sim;
  const f = regrowthFactor(state);
  for (const key of Object.keys(state.fields.forest)) {
    const k = Number(key);
    const cap = world.forest[k];
    const v = state.fields.forest[k];
    if (sim.occ.cells[k] > 0) continue; // built over
    const next = Math.min(cap, v + (0.00025 + 0.003 * v * (1 - v / Math.max(cap, 0.01))) * f);
    if (next >= cap - 0.001) delete state.fields.forest[k];
    else state.fields.forest[k] = next;
  }
  for (const key of Object.keys(state.fields.fish)) {
    const k = Number(key);
    const cap = world.fish[k];
    const v = state.fields.fish[k];
    const next = Math.min(cap, v + 0.00015 + 0.006 * v * (1 - v / Math.max(cap, 0.01)));
    if (next >= cap - 0.001) delete state.fields.fish[k];
    else state.fields.fish[k] = next;
  }
}

/** Take ore out of the deposit a mine works on; returns tons actually available. */
export function extract(sim: Sim, b: Building, tons: number): number {
  const def = BUILDING[b.type];
  const d = depositFor(sim.state, def, b.x, b.y);
  if (!d) return 0;
  const q = Math.min(tons, d.amount);
  d.amount -= q;
  if (d.amount <= 0) {
    d.amount = 0;
    emit(sim.state, 'bad', `Your ${def.name}'s ${RESOURCES[d.resource].name.toLowerCase()} deposit is exhausted. Non-renewable resources run out.`, {
      concept: 'depletion',
      at: { x: b.x, y: b.y },
      owner: b.owner,
    });
    sim.depositsDirty = true;
  }
  if (def.pit) digPit(sim, d);
  return q;
}

/** Pit radius for rendering and terrain edits. */
export function pitRadius(d: Deposit): number {
  const frac = 1 - d.amount / d.initial;
  return d.radius * (0.45 + 0.75 * Math.sqrt(frac)) + 0.6;
}

/** Lower the terrain into a terraced open pit as the deposit is mined. */
function digPit(sim: Sim, d: Deposit): void {
  const { world, state } = sim;
  const frac = 1 - d.amount / d.initial;
  const depth = 0.4 + 3.6 * Math.pow(frac, 0.7);
  if (d.pitDepth !== undefined && depth - d.pitDepth < 0.12) return;
  const n = world.n;
  const cx = d.x + 0.5;
  const cy = d.y + 0.5;
  const r = pitRadius(d);
  if (d.pitBase === undefined) {
    let sum = 0;
    let cnt = 0;
    for (let vy = Math.floor(cy - r); vy <= Math.ceil(cy + r); vy++)
      for (let vx = Math.floor(cx - r); vx <= Math.ceil(cx + r); vx++) {
        if (vx < 0 || vy < 0 || vx >= n || vy >= n) continue;
        if (Math.hypot(vx - cx, vy - cy) > r) continue;
        sum += world.heights[vy * n + vx];
        cnt++;
      }
    d.pitBase = cnt ? sum / cnt : 1;
    sim.depositsDirty = true;
  }
  d.pitDepth = depth;
  // Protect vertices under buildings and roads.
  const protectedV = new Set<number>();
  for (const b of state.buildings) {
    const [w, h] = BUILDING[b.type].footprint;
    for (let vy = b.y; vy <= b.y + h; vy++) for (let vx = b.x; vx <= b.x + w; vx++) protectedV.add(vy * n + vx);
  }
  const rect: Rect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const step = 0.5;
  for (let vy = Math.floor(cy - r) - 1; vy <= Math.ceil(cy + r) + 1; vy++)
    for (let vx = Math.floor(cx - r) - 1; vx <= Math.ceil(cx + r) + 1; vx++) {
      if (vx <= 0 || vy <= 0 || vx >= n - 1 || vy >= n - 1) continue;
      const vi = vy * n + vx;
      if (protectedV.has(vi)) continue;
      const dist = Math.hypot(vx - cx, vy - cy) / r;
      if (dist > 1) continue;
      // Flat bottom, terraced walls.
      const shape = dist < 0.5 ? 1 : 1 - (dist - 0.5) / 0.5;
      const target = d.pitBase - Math.round((depth * shape) / step) * step;
      if (target < world.heights[vi] - 0.01) {
        setVertexHeight(world, state, vi, Math.max(target, -2));
        rect.x0 = Math.min(rect.x0, vx);
        rect.y0 = Math.min(rect.y0, vy);
        rect.x1 = Math.max(rect.x1, vx);
        rect.y1 = Math.max(rect.y1, vy);
      }
    }
  if (isFinite(rect.x0)) sim.terrainDirty.push(rect);
}

/** Survey for hidden deposits around a point. */
export function survey(sim: Sim, owner: number, x: number, y: number): { ok: boolean; reason?: string; found?: Deposit[] } {
  const { state } = sim;
  const c = state.companies[owner];
  const cost = INFRA.surveyCost * state.priceLevel;
  if (c.cash < cost) return { ok: false, reason: 'Not enough cash' };
  book(c, 'research', cost);
  const found = state.deposits.filter((d) => d.hidden && Math.hypot(d.x - x, d.y - y) <= INFRA.surveyRadius + d.radius);
  for (const d of found) d.hidden = false;
  if (found.length) {
    const names = [...new Set(found.map((d) => RESOURCES[d.resource].name.toLowerCase()))].join(', ');
    emit(state, 'good', `Survey success! Geologists found ${names}.`, { concept: 'exploration', at: { x, y }, owner });
  } else {
    emit(state, 'bad', `The survey found nothing here. The money is spent either way: a sunk cost.`, {
      concept: 'sunk-cost',
      at: { x, y },
      owner,
    });
  }
  sim.depositsDirty = true;
  return { ok: true, found };
}
