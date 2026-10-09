import { BUILDING } from '../data/buildings';
import { GOOD } from '../data/goods';
import { INFRA, MODE_VEHICLE, VEHICLES } from '../data/transport';
import { emit, learn } from './events';
import { book, invest } from './finance';
import { buyable, buyFromMarket, sellToMarket } from './market';
import { pathLength } from './pathfinding';
import { storageCap } from './production';
import { endpointPos, networkRoute } from './roads';
import { transportFactors } from './tech';
import type { Sim } from './sim';
import { emptyLineStats, type Building, type Company, type Endpoint, type GameState, type Line, type Mode, type Vehicle } from './state';

export interface Result {
  ok: boolean;
  reason?: string;
}

export function endpointName(state: GameState, e: Endpoint): string {
  if (e.kind === 'town') return state.towns[e.id]?.name ?? '?';
  const b = state.buildings.find((x) => x.id === e.id);
  return b ? BUILDING[b.type].name : '(demolished)';
}

/** Goods that can be shipped from an endpoint. */
export function shippableGoods(state: GameState, from: Endpoint, to: Endpoint): string[] {
  let goods: string[] = Object.keys(GOOD);
  if (from.kind === 'building') {
    const b = state.buildings.find((x) => x.id === from.id);
    const def = b && BUILDING[b.type];
    if (def && def.warehouse) {
      // Ship what is in stock first, then everything else.
      goods = [...goods].sort((a, c) => (b!.storage[c] ?? 0) - (b!.storage[a] ?? 0));
    } else goods = def?.recipe ? Object.keys(def.recipe.outputs) : [];
  }
  if (to.kind === 'building') {
    const b = state.buildings.find((x) => x.id === to.id);
    const def = b && BUILDING[b.type];
    if (!def?.warehouse) {
      const ins = def?.recipe ? Object.keys(def.recipe.inputs) : [];
      goods = goods.filter((g) => ins.includes(g));
    }
  }
  return goods;
}

export interface LineEstimate {
  length: number;
  roundTripDays: number;
  tonsPerDayPerVehicle: number;
  costPerTon: number;
}

/**
 * Fuel price relative to normal (average over all towns). Running costs per
 * km scale with it, so a fuel price shock raises everyone's transport costs.
 */
export function fuelIndex(state: GameState): number {
  if (!state.towns.length) return 1;
  const avg = state.towns.reduce((a, t) => a + t.market.fuel.price, 0) / state.towns.length;
  return avg / (GOOD.fuel.basePrice * state.priceLevel);
}

function runningFactors(state: GameState, c: Company | null, mode: Mode) {
  const tf = c ? transportFactors(c, mode) : { perKm: 1, daily: 1 };
  return {
    perKm: tf.perKm * (0.5 + 0.5 * fuelIndex(state)) * state.priceLevel,
    daily: tf.daily * state.priceLevel,
  };
}

export function estimateLine(length: number, vehicle = 'truck', state?: GameState, owner = 0): LineEstimate {
  const v = VEHICLES[vehicle];
  const f = state ? runningFactors(state, state.companies[owner], v.mode) : { perKm: 1, daily: 1 };
  const roundTripDays = (2 * length) / v.speed + 0.25;
  const tonsPerDayPerVehicle = v.capacity / roundTripDays;
  const depreciation = v.price / (v.lifeYears * 365);
  const costPerTon = (2 * length * v.perKm * f.perKm + (v.dailyCost * f.daily + depreciation) * roundTripDays) / v.capacity;
  return { length, roundTripDays, tonsPerDayPerVehicle, costPerTon };
}

const NOT_CONNECTED: Record<Mode, string> = {
  road: 'Not connected by road: build a road to both places first',
  rail: 'Not connected by rail: lay track to both places first',
  sea: 'No sea route: both ends must be a harbor or a coastal town on the same sea',
};

export function planLine(sim: Sim, from: Endpoint, to: Endpoint, mode: Mode = 'road'): { path: number[]; length: number } | { reason: string } {
  if (from.kind === to.kind && from.id === to.id) return { reason: 'Pick two different places' };
  const path = networkRoute(sim, from, to, mode);
  if (!path) return { reason: NOT_CONNECTED[mode] };
  return { path, length: pathLength(sim.world.size, path) };
}

export function createLine(
  sim: Sim,
  owner: number,
  from: Endpoint,
  to: Endpoint,
  good: string,
  vehicles: number,
  mode: Mode = 'road',
): Result & { line?: Line } {
  const { state } = sim;
  const plan = planLine(sim, from, to, mode);
  if ('reason' in plan) return { ok: false, reason: plan.reason };
  if (!shippableGoods(state, from, to).includes(good)) return { ok: false, reason: 'This good cannot be shipped on this line' };
  const v = VEHICLES[MODE_VEHICLE[mode]];
  const cost = v.price * vehicles * state.priceLevel;
  const c = state.companies[owner];
  if (c.cash < cost) return { ok: false, reason: 'Not enough cash for the trucks' };
  invest(c, cost);
  const line: Line = {
    id: state.nextId++,
    owner,
    mode,
    vehicle: v.id,
    from,
    to,
    good,
    path: plan.path,
    length: plan.length,
    vehicles: [],
    invested: cost,
    bookValue: cost,
    status: 'Starting',
    month: emptyLineStats(),
    last: emptyLineStats(),
  };
  for (let i = 0; i < vehicles; i++) line.vehicles.push(newVehicle());
  state.lines.push(line);
  if (owner === 0 && from.kind === 'town' && to.kind === 'town') {
    const a = state.towns[from.id].market[good].price;
    const b = state.towns[to.id].market[good].price;
    learn(
      state,
      'arbitrage',
      `You buy ${GOOD[good].name.toLowerCase()} in ${state.towns[from.id].name} at $${a.toFixed(0)} and sell it in ${state.towns[to.id].name} at $${b.toFixed(0)}. Your buying will push the first price up and your selling the second one down, until the gap only just covers transport.`,
    );
  }
  emit(state, 'info', `New ${v.name.toLowerCase()} line: ${GOOD[good].name} from ${endpointName(state, from)} to ${endpointName(state, to)}.`, {
    concept: 'transport-costs',
    owner,
  });
  return { ok: true, line };
}

/** New vehicles start at the source, heading back so they load first. */
function newVehicle(): Vehicle {
  return { pos: 0, dir: -1, cargo: 0, cargoCost: 0, idle: false };
}

export function addVehicle(sim: Sim, owner: number, lineId: number): Result {
  const line = sim.state.lines.find((l) => l.id === lineId && l.owner === owner);
  if (!line) return { ok: false, reason: 'Unknown line' };
  const cost = VEHICLES[line.vehicle].price * sim.state.priceLevel;
  const c = sim.state.companies[owner];
  if (c.cash < cost) return { ok: false, reason: 'Not enough cash' };
  invest(c, cost);
  line.invested += cost;
  line.bookValue += cost;
  line.vehicles.push(newVehicle());
  return { ok: true };
}

export function removeVehicle(sim: Sim, owner: number, lineId: number): Result {
  const line = sim.state.lines.find((l) => l.id === lineId && l.owner === owner);
  if (!line || line.vehicles.length <= 1) return { ok: false, reason: 'A line needs at least one vehicle' };
  const per = line.bookValue / line.vehicles.length;
  const c = sim.state.companies[owner];
  const resale = per * INFRA.vehicleResale;
  c.cash += resale;
  c.cashflow.investing += resale;
  c.month.depreciation += per - resale;
  line.bookValue -= per;
  line.invested -= line.invested / line.vehicles.length;
  line.vehicles.pop();
  return { ok: true };
}

export function deleteLine(sim: Sim, owner: number, lineId: number): Result {
  const line = sim.state.lines.find((l) => l.id === lineId && l.owner === owner);
  if (!line) return { ok: false, reason: 'Unknown line' };
  const c = sim.state.companies[owner];
  const resale = line.bookValue * INFRA.vehicleResale;
  c.cash += resale;
  c.cashflow.investing += resale;
  c.month.depreciation += line.bookValue - resale;
  sim.state.lines = sim.state.lines.filter((l) => l !== line);
  return { ok: true };
}

/** Does a building ship this good out by a line (then it is not sold locally)? */
export function hasOutgoingLine(state: GameState, b: Building, good: string): boolean {
  return state.lines.some((l) => l.from.kind === 'building' && l.from.id === b.id && l.good === good);
}

function findBuilding(state: GameState, id: number) {
  return state.buildings.find((b) => b.id === id);
}

/** Load cargo at the line's source. Returns tons loaded. */
function load(state: GameState, line: Line, v: Vehicle, cap: number): number {
  const want = cap - v.cargo;
  if (want <= 0) return 0;
  const company = state.companies[line.owner];
  if (line.from.kind === 'building') {
    const b = findBuilding(state, line.from.id);
    if (!b) return 0;
    const q = Math.min(want, b.storage[line.good] ?? 0);
    b.storage[line.good] = (b.storage[line.good] ?? 0) - q;
    v.cargo += q;
    return q;
  }
  const town = state.towns[line.from.id];
  if (buyable(town, line.good) < 1) return 0;
  const [q, cost] = buyFromMarket(state, town, line.good, want);
  book(company, 'materials', cost);
  line.month.costs += cost;
  v.cargo += q;
  v.cargoCost += cost;
  return q;
}

/** Unload at the destination. Returns tons unloaded. */
function unload(state: GameState, line: Line, v: Vehicle): number {
  if (v.cargo <= 0) return 0;
  const company = state.companies[line.owner];
  if (line.to.kind === 'town') {
    const town = state.towns[line.to.id];
    const revenue = sellToMarket(state, town, line.good, v.cargo, line.owner);
    book(company, 'sales', revenue);
    line.month.revenue += revenue;
    // The producing building earns the sale; the line carries the transport cost.
    if (line.from.kind === 'building') {
      const src = findBuilding(state, line.from.id);
      if (src) src.month.revenue += revenue;
    }
    const q = v.cargo;
    v.cargo = 0;
    v.cargoCost = 0;
    return q;
  }
  const b = findBuilding(state, line.to.id);
  if (!b) return 0;
  const used = Object.values(b.storage).reduce((a, x) => a + x, 0);
  const q = Math.min(v.cargo, Math.max(0, storageCap(b) - used));
  b.storage[line.good] = (b.storage[line.good] ?? 0) + q;
  v.cargo -= q;
  return q;
}

/** Move all vehicles for one day; load, unload, pay running costs. */
export function updateTransport(state: GameState): void {
  for (const line of state.lines) {
    const def = VEHICLES[line.vehicle];
    const company = state.companies[line.owner];
    const fromOk = line.from.kind === 'town' || !!findBuilding(state, line.from.id);
    const toOk = line.to.kind === 'town' || !!findBuilding(state, line.to.id);
    if (!fromOk || !toOk || !endpointPos(state, line.from) || !endpointPos(state, line.to)) {
      line.status = 'Broken: an endpoint was demolished';
      continue;
    }
    let km = 0;
    let delivered = 0;
    let waiting = 0;
    for (const v of line.vehicles) {
      let budget = def.speed;
      v.idle = false;
      let guard = 0;
      while (budget > 1e-6 && guard++ < 8) {
        const target = v.dir === 1 ? line.length : 0;
        const dist = Math.abs(target - v.pos);
        const step = Math.min(budget, dist);
        v.pos += step * v.dir;
        budget -= step;
        km += step;
        if (Math.abs(target - v.pos) > 1e-6) break;
        // Arrived at an end of the line.
        if (v.dir === 1) {
          delivered += unload(state, line, v);
          if (v.cargo > 0) {
            // Destination full: wait here.
            v.idle = true;
            waiting++;
            break;
          }
          v.dir = -1;
          budget -= def.speed * 0.1;
        } else {
          load(state, line, v, def.capacity);
          if (v.cargo < def.capacity * 0.3) {
            v.idle = true;
            waiting++;
            break;
          }
          v.dir = 1;
          budget -= def.speed * 0.1;
        }
      }
    }
    const f = runningFactors(state, company, line.mode);
    const running = km * def.perKm * f.perKm + line.vehicles.length * def.dailyCost * f.daily;
    const dep = Math.min(line.bookValue, line.invested / (def.lifeYears * 365));
    line.bookValue -= dep;
    book(company, 'transport', running);
    book(company, 'depreciation', dep);
    line.month.costs += running + dep;
    line.month.delivered += delivered;
    line.status =
      waiting === line.vehicles.length
        ? line.vehicles.some((v) => v.dir === 1 && v.cargo > 0)
          ? 'Destination full'
          : 'Waiting for cargo'
        : 'Running';
  }
}

export function closeLinesMonth(state: GameState): void {
  for (const l of state.lines) {
    l.last = l.month;
    l.month = emptyLineStats();
  }
}
