import { BIOMES, BIOME_IDS } from '../data/biomes';
import { BUILDING } from '../data/buildings';
import { INFRA } from '../data/transport';
import { emit } from './events';
import { invest } from './finance';
import { TOWN_CELL } from './grid';
import { astar, pathLength } from './pathfinding';
import type { Sim } from './sim';
import type { Building, Endpoint, GameState, Mode } from './state';
import { cellSlope } from './world/generate';
import type { World } from './world/types';

/**
 * Transport networks: roads and railways are built cell by cell (shared
 * infrastructure); the sea needs no building but only harbors and coastal
 * towns can use it.
 */
export type TrackMode = 'road' | 'rail';

const PER_CELL: Record<TrackMode, number> = { road: INFRA.roadPerCell, rail: INFRA.railPerCell };
const BRIDGE: Record<TrackMode, number> = { road: INFRA.bridgePerCell, rail: INFRA.railBridgePerCell };
/** Railways hate gradients. */
const SLOPE_PENALTY: Record<TrackMode, number> = { road: 1.5, rail: 3.5 };

/** Terrain difficulty for building track through a cell (Infinity = impossible). */
export function terrainCost(world: World, cell: number, mode: TrackMode = 'road'): number {
  const id = BIOME_IDS[world.biome[cell]];
  const b = BIOMES[id];
  if (b.water && id !== 'river') return Infinity;
  if (id === 'river') return BRIDGE[mode] / PER_CELL[mode];
  const x = cell % world.size;
  const y = (cell / world.size) | 0;
  return b.pathCost * (1 + cellSlope(world, x, y) * SLOPE_PENALTY[mode]);
}

/** Backwards-compatible name used by the road tool. */
export const roadTerrainCost = (world: World, cell: number) => terrainCost(world, cell, 'road');

export function isBridge(world: World, cell: number): boolean {
  return BIOME_IDS[world.biome[cell]] === 'river';
}

export function isSea(world: World, cell: number): boolean {
  const id = BIOME_IDS[world.biome[cell]];
  return id === 'ocean' || id === 'deep';
}

function networkOf(sim: Sim, mode: TrackMode): Uint8Array {
  return mode === 'road' ? sim.occ.road : sim.occ.rail;
}

export interface RoadPlan {
  mode: TrackMode;
  path: number[];
  newCells: number[];
  cost: number;
  length: number;
}

/**
 * Plan the cheapest track between two cells. Existing track of the same kind
 * is reused almost for free; houses and buildings are obstacles.
 */
export function planRoad(sim: Sim, fromCell: number, toCell: number, mode: TrackMode = 'road'): RoadPlan | null {
  const froms = snapRoadEnds(sim, fromCell, toCell, mode);
  const tos = snapRoadEnds(sim, toCell, fromCell, mode);
  // A snapped end may sit in an enclosed pocket: try the next candidates.
  for (const from of froms.slice(0, 4))
    for (const to of tos.slice(0, 2)) {
      const plan = planCells(sim, from, to, mode);
      if (plan) return plan;
    }
  return null;
}

function planCells(sim: Sim, from: number, to: number, mode: TrackMode): RoadPlan | null {
  const { world, occ } = sim;
  const net = networkOf(sim, mode);
  const cost = (_a: number, c: number) => {
    if (net[c]) return 0.12;
    const o = occ.cells[c];
    if (o > 0 || o === TOWN_CELL) return Infinity;
    return terrainCost(world, c, mode);
  };
  if (!isFinite(cost(-1, from))) return null;
  const path = astar(world.size, from, new Set([to]), cost, 0.12, 60_000, true);
  if (!path) return null;
  const newCells = path.filter((c) => !net[c]);
  const money = newCells.reduce((a, c) => a + terrainCost(world, c, mode) * PER_CELL[mode], 0) * sim.state.priceLevel;
  return { mode, path, newCells, cost: Math.round(money / 10) * 10, length: pathLength(world.size, path) };
}

/**
 * Clicking on a building or a town snaps the track end to a free cell next to
 * the building, or to the town's existing network. Returns candidates, best first.
 */
export function snapRoadEnds(sim: Sim, cell: number, towards: number, mode: TrackMode = 'road'): number[] {
  const { world, occ, state } = sim;
  const size = world.size;
  const net = networkOf(sim, mode);
  const free = (c: number) => net[c] === 1 || (occ.cells[c] === 0 && isFinite(terrainCost(world, c, mode)));
  const o = occ.cells[cell];
  if (free(cell)) return [cell];
  const tx = towards % size;
  const ty = (towards / size) | 0;
  let candidates: number[] = [];
  if (o > 0) {
    const bld: Building | undefined = state.buildings.find((q) => q.id === o);
    if (bld) {
      const [w, h] = BUILDING[bld.type].footprint;
      for (let cy: number = bld.y - 1; cy <= bld.y + h; cy++)
        for (let cx: number = bld.x - 1; cx <= bld.x + w; cx++) {
          if (cx < 0 || cy < 0 || cx >= size || cy >= size) continue;
          const c = cy * size + cx;
          if (free(c)) candidates.push(c);
        }
    }
  } else if (o === TOWN_CELL) {
    const x0 = cell % size;
    const y0 = (cell / size) | 0;
    let best = 0;
    let bd = Infinity;
    state.towns.forEach((t, i) => {
      const d = Math.hypot(t.x - x0, t.y - y0);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    candidates = townAccess(sim, best, mode);
    // No track in town yet: any free cell at the town's edge.
    if (!candidates.length) {
      const t = state.towns[best];
      const r = Math.ceil((occ.townRadius[best] ?? 4) + 1);
      for (let cy = t.y - r; cy <= t.y + r; cy++)
        for (let cx = t.x - r; cx <= t.x + r; cx++) {
          if (cx < 0 || cy < 0 || cx >= size || cy >= size) continue;
          const c = cy * size + cx;
          if (free(c)) candidates.push(c);
        }
    }
  }
  const dist = (c: number) => Math.hypot((c % size) - tx, ((c / size) | 0) - ty);
  return candidates.sort((a, b) => dist(a) - dist(b));
}

export function addTrackCells(sim: Sim, cells: number[], mode: TrackMode = 'road'): void {
  const net = networkOf(sim, mode);
  const list = mode === 'road' ? sim.state.roads : sim.state.rails;
  for (const c of cells) {
    if (net[c]) continue;
    net[c] = 1;
    list.push(c);
  }
  sim.roadsDirty = true;
}

export const addRoadCells = (sim: Sim, cells: number[]) => addTrackCells(sim, cells, 'road');

export function buildRoad(sim: Sim, owner: number, from: number, to: number, mode: TrackMode = 'road'): { ok: boolean; reason?: string } {
  const plan = planRoad(sim, from, to, mode);
  if (!plan) return { ok: false, reason: 'No route possible here' };
  if (!plan.newCells.length) return { ok: false, reason: 'Already connected' };
  const c = sim.state.companies[owner];
  if (c.cash < plan.cost) return { ok: false, reason: 'Not enough cash' };
  invest(c, plan.cost);
  addTrackCells(sim, plan.newCells, mode);
  emit(sim.state, 'info', `Built ${plan.newCells.length} km of ${mode === 'road' ? 'road' : 'railway'} for $${plan.cost.toLocaleString()}.`, {
    concept: 'infrastructure',
    owner,
  });
  return { ok: true };
}

/** Connect all towns with a minimum spanning tree of country roads (map setup). */
export function generateCountryRoads(sim: Sim): void {
  const { world, state } = sim;
  const towns = state.towns;
  const edges: [number, number, number][] = [];
  for (let i = 0; i < towns.length; i++)
    for (let j = i + 1; j < towns.length; j++)
      edges.push([Math.hypot(towns[i].x - towns[j].x, towns[i].y - towns[j].y), i, j]);
  edges.sort((a, b) => a[0] - b[0]);
  const parent = towns.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const cost = (_a: number, c: number) => (sim.occ.road[c] ? 0.3 : terrainCost(world, c));
  for (const [d, i, j] of edges) {
    if (find(i) === find(j)) continue;
    // Skip very long links (towns separated by mountains or sea stay unconnected).
    if (d > world.size * 0.55) continue;
    const a = towns[i].y * world.size + towns[i].x;
    const b = towns[j].y * world.size + towns[j].x;
    const path = astar(world.size, a, new Set([b]), cost, 0.3, 80_000);
    if (!path) continue;
    const terrain = path.reduce((acc, c) => acc + (sim.occ.road[c] ? 0 : terrainCost(world, c)), 0);
    if (terrain > d * 6) continue;
    parent[find(i)] = find(j);
    addTrackCells(sim, path, 'road');
  }
}

// ---------------------------------------------------------------- access points

/** Network cells a building can use (adjacent track, or nearby sea for ports). */
export function buildingAccess(sim: Sim, b: Building, mode: Mode = 'road'): number[] {
  const [w, h] = BUILDING[b.type].footprint;
  const size = sim.world.size;
  const out: number[] = [];
  const pad = mode === 'sea' ? 2 : 1;
  if (mode === 'sea' && b.type !== 'harbor') return out;
  for (let y = b.y - pad; y < b.y + h + pad; y++)
    for (let x = b.x - pad; x < b.x + w + pad; x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const c = y * size + x;
      if (mode === 'sea' ? isSea(sim.world, c) : networkOf(sim, mode)[c]) out.push(c);
    }
  return out;
}

/** Network cells inside a town (sea cells along its waterfront for ports). */
export function townAccess(sim: Sim, townId: number, mode: Mode = 'road'): number[] {
  const t = sim.state.towns[townId];
  const r = (sim.occ.townRadius[townId] ?? 4) + (mode === 'sea' ? 3 : mode === 'rail' ? 1.5 : 0);
  const size = sim.world.size;
  const out: number[] = [];
  const ri = Math.ceil(r);
  for (let y = t.y - ri; y <= t.y + ri; y++)
    for (let x = t.x - ri; x <= t.x + ri; x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      if (Math.hypot(x - t.x, y - t.y) > r) continue;
      const c = y * size + x;
      if (mode === 'sea' ? isSea(sim.world, c) : networkOf(sim, mode)[c]) out.push(c);
    }
  return out;
}

export function endpointAccess(sim: Sim, e: Endpoint, mode: Mode = 'road'): number[] {
  if (e.kind === 'town') return townAccess(sim, e.id, mode);
  const b = sim.state.buildings.find((x) => x.id === e.id);
  return b ? buildingAccess(sim, b, mode) : [];
}

export function endpointPos(state: GameState, e: Endpoint): { x: number; y: number } | null {
  if (e.kind === 'town') {
    const t = state.towns[e.id];
    return t ? { x: t.x + 0.5, y: t.y + 0.5 } : null;
  }
  const b = state.buildings.find((x) => x.id === e.id);
  if (!b) return null;
  const [w, h] = BUILDING[b.type].footprint;
  return { x: b.x + w / 2, y: b.y + h / 2 };
}

/** Route along a network between two endpoints. */
export function networkRoute(sim: Sim, from: Endpoint, to: Endpoint, mode: Mode): number[] | null {
  const a = endpointAccess(sim, from, mode);
  const b = new Set(endpointAccess(sim, to, mode));
  if (!a.length || !b.size) return null;
  const world = sim.world;
  const cost =
    mode === 'sea'
      ? (_x: number, c: number) => (isSea(world, c) ? 1 : Infinity)
      : (_x: number, c: number) => (networkOf(sim, mode)[c] ? 1 : Infinity);
  // Try a few start cells (nearest to the destination first); keep the shortest route.
  const dest = endpointPos(sim.state, to)!;
  const size = world.size;
  const d2 = (p: number) => Math.hypot((p % size) - dest.x, ((p / size) | 0) - dest.y);
  const starts = [...a].sort((p, q) => d2(p) - d2(q));
  let best: number[] | null = null;
  for (const start of starts.slice(0, mode === 'sea' ? 2 : 6)) {
    const p = astar(size, start, b, cost, 1, mode === 'sea' ? 80_000 : 40_000, true);
    if (p && (!best || pathLength(size, p) < pathLength(size, best))) best = p;
  }
  return best;
}

export const roadRoute = (sim: Sim, from: Endpoint, to: Endpoint) => networkRoute(sim, from, to, 'road');
