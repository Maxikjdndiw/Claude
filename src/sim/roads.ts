import { BIOMES, BIOME_IDS } from '../data/biomes';
import { BUILDING } from '../data/buildings';
import { INFRA } from '../data/transport';
import { emit } from './events';
import { invest } from './finance';
import { TOWN_CELL } from './grid';
import { astar, pathLength } from './pathfinding';
import type { Sim } from './sim';
import type { Building, Endpoint, GameState } from './state';
import { cellSlope } from './world/generate';
import type { World } from './world/types';

/** Terrain difficulty for building a road through a cell (Infinity = impossible). */
export function roadTerrainCost(world: World, cell: number): number {
  const b = BIOMES[BIOME_IDS[world.biome[cell]]];
  if (b.water && BIOME_IDS[world.biome[cell]] !== 'river') return Infinity;
  if (BIOME_IDS[world.biome[cell]] === 'river') return INFRA.bridgePerCell / INFRA.roadPerCell;
  const x = cell % world.size;
  const y = (cell / world.size) | 0;
  return b.pathCost * (1 + cellSlope(world, x, y) * 1.5);
}

export function isBridge(world: World, cell: number): boolean {
  return BIOME_IDS[world.biome[cell]] === 'river';
}

export interface RoadPlan {
  path: number[];
  newCells: number[];
  cost: number;
  length: number;
}

/**
 * Plan the cheapest road between two cells. Existing roads are reused almost
 * for free; houses and buildings are obstacles.
 */
export function planRoad(sim: Sim, fromCell: number, toCell: number): RoadPlan | null {
  const froms = snapRoadEnds(sim, fromCell, toCell);
  const tos = snapRoadEnds(sim, toCell, fromCell);
  // A snapped end may sit in an enclosed pocket: try the next candidates.
  for (const from of froms.slice(0, 4))
    for (const to of tos.slice(0, 2)) {
      const plan = planRoadCells(sim, from, to);
      if (plan) return plan;
    }
  return null;
}

function planRoadCells(sim: Sim, from: number, to: number): RoadPlan | null {
  const { world, occ } = sim;
  const cost = (_a: number, c: number) => {
    if (occ.road[c]) return 0.12;
    const o = occ.cells[c];
    if (o > 0 || o === TOWN_CELL) return Infinity;
    return roadTerrainCost(world, c);
  };
  if (!isFinite(cost(-1, from)) && !occ.road[from]) return null;
  const path = astar(world.size, from, new Set([to]), cost, 0.12, 60_000, true);
  if (!path) return null;
  const newCells = path.filter((c) => !occ.road[c]);
  const money = newCells.reduce((a, c) => a + roadTerrainCost(world, c) * INFRA.roadPerCell, 0) * sim.state.priceLevel;
  return { path, newCells, cost: Math.round(money / 10) * 10, length: pathLength(world.size, path) };
}

/**
 * Clicking on a building or a town snaps the road end to a free cell next to
 * the building, or to the town's existing street.
 */
export function snapRoadEnds(sim: Sim, cell: number, towards: number): number[] {
  const { world, occ, state } = sim;
  const size = world.size;
  const o = occ.cells[cell];
  if (occ.road[cell] || (o === 0 && isFinite(roadTerrainCost(world, cell)))) return [cell];
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
          if (occ.road[c] || (occ.cells[c] === 0 && isFinite(roadTerrainCost(world, c)))) candidates.push(c);
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
    candidates = townAccess(sim, best);
  }
  const dist = (c: number) => Math.hypot((c % size) - tx, ((c / size) | 0) - ty);
  return candidates.sort((a, b) => dist(a) - dist(b));
}

export function addRoadCells(sim: Sim, cells: number[]): void {
  for (const c of cells) {
    if (sim.occ.road[c]) continue;
    sim.occ.road[c] = 1;
    sim.state.roads.push(c);
  }
  sim.roadsDirty = true;
}

export function buildRoad(sim: Sim, owner: number, from: number, to: number): { ok: boolean; reason?: string } {
  const plan = planRoad(sim, from, to);
  if (!plan) return { ok: false, reason: 'No route possible here' };
  if (!plan.newCells.length) return { ok: false, reason: 'Already connected by road' };
  const c = sim.state.companies[owner];
  if (c.cash < plan.cost) return { ok: false, reason: 'Not enough cash' };
  invest(c, plan.cost);
  addRoadCells(sim, plan.newCells);
  emit(sim.state, 'info', `Built ${plan.newCells.length} km of road for $${plan.cost.toLocaleString()}.`, {
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
  const cost = (_a: number, c: number) => (sim.occ.road[c] ? 0.3 : roadTerrainCost(world, c));
  for (const [d, i, j] of edges) {
    if (find(i) === find(j)) continue;
    // Skip very long links (towns separated by mountains or sea stay unconnected).
    if (d > world.size * 0.55) continue;
    const a = towns[i].y * world.size + towns[i].x;
    const b = towns[j].y * world.size + towns[j].x;
    const path = astar(world.size, a, new Set([b]), cost, 0.3, 80_000);
    if (!path) continue;
    const terrain = path.reduce((acc, c) => acc + (sim.occ.road[c] ? 0 : roadTerrainCost(world, c)), 0);
    if (terrain > d * 6) continue;
    parent[find(i)] = find(j);
    addRoadCells(sim, path);
  }
}

// ---------------------------------------------------------------- access points

/** Road cells touching a building's footprint. */
export function buildingAccess(sim: Sim, b: Building): number[] {
  const [w, h] = BUILDING[b.type].footprint;
  const size = sim.world.size;
  const out: number[] = [];
  for (let y = b.y - 1; y <= b.y + h; y++)
    for (let x = b.x - 1; x <= b.x + w; x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const c = y * size + x;
      if (sim.occ.road[c]) out.push(c);
    }
  return out;
}

/** Road cells inside a town. */
export function townAccess(sim: Sim, townId: number): number[] {
  const t = sim.state.towns[townId];
  const r = sim.occ.townRadius[townId] ?? 4;
  const size = sim.world.size;
  const out: number[] = [];
  const ri = Math.ceil(r);
  for (let y = t.y - ri; y <= t.y + ri; y++)
    for (let x = t.x - ri; x <= t.x + ri; x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      if (Math.hypot(x - t.x, y - t.y) > r) continue;
      const c = y * size + x;
      if (sim.occ.road[c]) out.push(c);
    }
  return out;
}

export function endpointAccess(sim: Sim, e: Endpoint): number[] {
  if (e.kind === 'town') return townAccess(sim, e.id);
  const b = sim.state.buildings.find((x) => x.id === e.id);
  return b ? buildingAccess(sim, b) : [];
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

/** Route along existing roads between two endpoints. */
export function roadRoute(sim: Sim, from: Endpoint, to: Endpoint): number[] | null {
  const a = endpointAccess(sim, from);
  const b = new Set(endpointAccess(sim, to));
  if (!a.length || !b.size) return null;
  const cost = (_x: number, c: number) => (sim.occ.road[c] ? 1 : Infinity);
  let best: number[] | null = null;
  // Try a few start cells; keep the shortest route.
  for (const start of a.slice(0, 6)) {
    const p = astar(sim.world.size, start, b, cost, 1, 40_000, true);
    if (p && (!best || pathLength(sim.world.size, p) < pathLength(sim.world.size, best))) best = p;
  }
  return best;
}
