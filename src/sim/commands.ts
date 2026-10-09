import { BIOMES, BIOME_IDS } from '../data/biomes';
import { BUILDING } from '../data/buildings';
import { ECON } from '../data/economy';
import { emit } from './events';
import { book, invest } from './finance';
import { laborTownFor } from './labor';
import { center, distance } from './logistics';
import { maxWorkers, refWorkers, siteFactorAt } from './production';
import type { Sim } from './sim';
import { emptyStats, type Building } from './state';
import { cellSlope } from './world/generate';
import { flattenFootprint } from './terrainEdit';

export interface Result {
  ok: boolean;
  reason?: string;
}

export interface PlacementCheck extends Result {
  cost: number;
  siteFactor: number;
  laborTown: number;
  localTown: number;
  warnings: string[];
}

function footprintCenter(type: string, x: number, y: number) {
  const [w, h] = BUILDING[type].footprint;
  return { x: x + w / 2, y: y + h / 2 };
}

/** Can company `owner` place `type` with its top-left corner at (x, y)? */
export function checkPlacement(sim: Sim, owner: number, type: string, x: number, y: number): PlacementCheck {
  const { world, state, occ } = sim;
  const def = BUILDING[type];
  const [w, h] = def.footprint;
  const res: PlacementCheck = { ok: false, cost: 0, siteFactor: 1, laborTown: -1, localTown: -1, warnings: [] };
  if (x < 1 || y < 1 || x + w >= world.size || y + h >= world.size) return { ...res, reason: 'Too close to the map edge' };

  let costMul = 0;
  let maxSlope = 0;
  for (let oy = 0; oy < h; oy++)
    for (let ox = 0; ox < w; ox++) {
      const cx = x + ox;
      const cy = y + oy;
      const biome = BIOMES[BIOME_IDS[world.biome[cy * world.size + cx]]];
      if (!biome.buildable) return { ...res, reason: `Cannot build on ${biome.name.toLowerCase()}` };
      const o = occ.at(cx, cy);
      if (o !== 0) return { ...res, reason: o < 0 ? 'Town houses are in the way' : 'Another building is in the way' };
      costMul += biome.buildCost;
      maxSlope = Math.max(maxSlope, cellSlope(world, cx, cy));
    }
  if (maxSlope > 1.7) return { ...res, reason: 'Terrain is too steep' };
  costMul /= w * h;

  const c = footprintCenter(type, x, y);
  const company = state.companies[owner];
  if (type !== 'hq') {
    const anchors = state.buildings.filter((b) => b.owner === owner).map(center);
    if (!anchors.some((a) => distance(a, c) <= ECON.buildRange))
      return { ...res, reason: `Out of reach: build within ${ECON.buildRange} km of your HQ or another building` };
  }

  const siteFactor = siteFactorAt(world, def, x, y);
  if (def.site.kind === 'fertility' && siteFactor < 0.45) return { ...res, siteFactor, reason: 'Soil is too poor for farming here' };

  const cost = Math.round((def.cost * costMul * (1 + 0.25 * maxSlope) * state.priceLevel) / 100) * 100;
  const laborTown = laborTownFor(state, c.x, c.y);
  let localTown = -1;
  for (const t of state.towns) if (distance(c, { x: t.x + 0.5, y: t.y + 0.5 }) <= ECON.localRange) localTown = t.id;

  const warnings: string[] = [];
  if (def.maxWorkers > 0 && laborTown < 0) warnings.push('No town within commuting range: you cannot hire workers here');
  if (def.recipe && localTown < 0 && type !== 'farm') warnings.push('No town in local reach to sell to (trucks arrive later)');
  if (def.recipe && localTown < 0 && type === 'farm') warnings.push('No town in local reach: wheat can only go to your own mill nearby');
  if (cost > company.cash) return { ...res, cost, siteFactor, laborTown, localTown, warnings, reason: 'Not enough cash' };
  return { ok: true, cost, siteFactor, laborTown, localTown, warnings };
}

export function build(sim: Sim, owner: number, type: string, x: number, y: number): Result & { building?: Building } {
  const chk = checkPlacement(sim, owner, type, x, y);
  if (!chk.ok) return chk;
  const { state } = sim;
  const def = BUILDING[type];
  const company = state.companies[owner];
  invest(company, chk.cost);
  const town = chk.laborTown >= 0 ? state.towns[chk.laborTown] : null;
  const b: Building = {
    id: state.nextId++,
    type,
    owner,
    x,
    y,
    level: 1,
    buildLeft: def.buildDays,
    workers: 0,
    targetWorkers: 0,
    wage: town ? Math.round(town.wage * 10) / 10 : ECON.baseWage,
    skill: 0,
    trainingLeft: 0,
    town: chk.laborTown,
    storage: {},
    sellMin: {},
    buyInputs: true,
    invested: chk.cost,
    bookValue: chk.cost,
    siteFactor: chk.siteFactor,
    rate: 0,
    status: def.buildDays > 0 ? 'Under construction' : 'Operating',
    month: emptyStats(),
    last: emptyStats(),
  };
  b.targetWorkers = Math.min(maxWorkers(b), Math.round(refWorkers(b)));
  state.buildings.push(b);
  sim.occ.mark(b.id, type, x, y);
  const [fw, fh] = def.footprint;
  sim.terrainDirty.push(flattenFootprint(sim.world, state, x, y, fw, fh));
  if (type !== 'hq') {
    emit(state, 'info', `Construction of a ${def.name} started (${def.buildDays} days, $${chk.cost.toLocaleString()}).`, {
      concept: 'fixed-costs',
      at: { x, y },
      owner,
    });
  }
  return { ok: true, building: b };
}

/** Place the headquarters as close as possible to the chosen cell. */
export function foundCompany(sim: Sim, owner: number, x: number, y: number): Result {
  for (let r = 0; r < 6; r++)
    for (let oy = -r; oy <= r; oy++)
      for (let ox = -r; ox <= r; ox++) {
        const res = build(sim, owner, 'hq', x + ox, y + oy);
        if (res.ok) {
          sim.state.companies[owner].hq = { x: x + ox, y: y + oy };
          return res;
        }
      }
  return { ok: false, reason: 'No room for the headquarters here' };
}

function owned(sim: Sim, owner: number, id: number): Building | undefined {
  return sim.state.buildings.find((b) => b.id === id && b.owner === owner);
}

export function setTargetWorkers(sim: Sim, owner: number, id: number, n: number): Result {
  const b = owned(sim, owner, id);
  if (!b) return { ok: false, reason: 'Unknown building' };
  b.targetWorkers = Math.max(0, Math.min(maxWorkers(b), Math.round(n)));
  return { ok: true };
}

export function setWage(sim: Sim, owner: number, id: number, wage: number): Result {
  const b = owned(sim, owner, id);
  if (!b) return { ok: false, reason: 'Unknown building' };
  b.wage = Math.max(1, Math.round(wage * 10) / 10);
  return { ok: true };
}

export function setSellMin(sim: Sim, owner: number, id: number, good: string, price: number): Result {
  const b = owned(sim, owner, id);
  if (!b) return { ok: false, reason: 'Unknown building' };
  b.sellMin[good] = Math.max(0, price);
  return { ok: true };
}

export function setBuyInputs(sim: Sim, owner: number, id: number, on: boolean): Result {
  const b = owned(sim, owner, id);
  if (!b) return { ok: false, reason: 'Unknown building' };
  b.buyInputs = on;
  return { ok: true };
}

export function trainingCost(b: Building): number {
  return b.workers * ECON.trainingCostPerWorker;
}

export function train(sim: Sim, owner: number, id: number): Result {
  const b = owned(sim, owner, id);
  if (!b) return { ok: false, reason: 'Unknown building' };
  if (b.workers === 0) return { ok: false, reason: 'No workers to train' };
  if (b.trainingLeft > 0) return { ok: false, reason: 'Training already in progress' };
  if (b.skill >= 0.99) return { ok: false, reason: 'Workforce is fully trained' };
  const cost = trainingCost(b) * sim.state.priceLevel;
  const c = sim.state.companies[owner];
  if (c.cash < cost) return { ok: false, reason: 'Not enough cash' };
  book(c, 'training', cost);
  b.month.costs += cost;
  b.trainingLeft = ECON.trainingDays;
  emit(sim.state, 'info', `Training started at your ${BUILDING[b.type].name}. Productivity rises as workers learn.`, {
    concept: 'human-capital',
    owner,
  });
  return { ok: true };
}

export function upgradeCost(sim: Sim, b: Building): number {
  return Math.round((BUILDING[b.type].cost * ECON.upgradeCost * b.level * sim.state.priceLevel) / 100) * 100;
}

export function upgrade(sim: Sim, owner: number, id: number): Result {
  const b = owned(sim, owner, id);
  if (!b) return { ok: false, reason: 'Unknown building' };
  const def = BUILDING[b.type];
  if (b.level >= def.maxLevel) return { ok: false, reason: 'Already at maximum size' };
  if (b.buildLeft > 0) return { ok: false, reason: 'Construction in progress' };
  const cost = upgradeCost(sim, b);
  const c = sim.state.companies[owner];
  if (c.cash < cost) return { ok: false, reason: 'Not enough cash' };
  invest(c, cost);
  b.level++;
  b.invested += cost;
  b.bookValue += cost;
  b.buildLeft = Math.ceil(def.buildDays / 2);
  b.status = 'Expanding';
  emit(sim.state, 'info', `Expanding your ${def.name} to size ${b.level}. Bigger plants spread fixed costs over more output.`, {
    concept: 'economies-of-scale',
    owner,
  });
  return { ok: true };
}

export function demolish(sim: Sim, owner: number, id: number): Result {
  const b = owned(sim, owner, id);
  if (!b) return { ok: false, reason: 'Unknown building' };
  if (b.type === 'hq') return { ok: false, reason: 'You cannot demolish your headquarters' };
  const { state } = sim;
  const c = state.companies[owner];
  const salvage = b.bookValue * ECON.salvage;
  c.cash += salvage;
  c.cashflow.investing += salvage;
  // Writing off the remaining book value is a (non-cash) loss.
  c.month.depreciation += b.bookValue - salvage;
  if (b.town >= 0) state.towns[b.town].unemployed += b.workers;
  state.buildings = state.buildings.filter((x) => x !== b);
  sim.occ.clear(b.id);
  emit(state, 'info', `Demolished your ${BUILDING[b.type].name}. Salvage: $${Math.round(salvage).toLocaleString()}.`, {
    concept: 'sunk-cost',
    owner,
  });
  return { ok: true };
}
