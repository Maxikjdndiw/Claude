import { BUILDING, type BuildingDef } from '../data/buildings';
import { ECON } from '../data/economy';
import { emit } from './events';
import type { Building, GameState } from './state';
import type { World } from './world/types';

export const levelIndex = (b: Building) => Math.max(0, Math.min(2, b.level - 1));

/** Reference workforce for the building at its current level. */
export function refWorkers(b: Building): number {
  const def = BUILDING[b.type];
  return def.refWorkers * ECON.levelWorkers[levelIndex(b)];
}

export function maxWorkers(b: Building): number {
  const def = BUILDING[b.type];
  return Math.round(def.maxWorkers * ECON.levelWorkers[levelIndex(b)]);
}

export function storageCap(b: Building): number {
  return BUILDING[b.type].storage * ECON.levelWorkers[levelIndex(b)];
}

export function maintenance(b: Building): number {
  return BUILDING[b.type].maintenance * ECON.levelMaintenance[levelIndex(b)];
}

export function techFactor(_state: GameState, _b: Building): number {
  return 1;
}

/**
 * Output per day with `workers` workers, ignoring input and storage limits.
 * Cobb-Douglas style: diminishing marginal returns when alpha < 1.
 */
export function potentialOutput(state: GameState, b: Building, workers = b.workers): number {
  const def = BUILDING[b.type];
  if (!def.recipe || workers <= 0) return 0;
  const cap = def.baseRate * ECON.levelRate[levelIndex(b)];
  const skill = 1 + ECON.skillBonus * b.skill - (b.trainingLeft > 0 ? 0.1 : 0);
  return cap * b.siteFactor * skill * techFactor(state, b) * Math.pow(workers / refWorkers(b), def.alpha);
}

/** Extra output from one more worker (marginal product of labor). */
export function marginalProduct(state: GameState, b: Building, workers = b.workers): number {
  return potentialOutput(state, b, workers + 1) - potentialOutput(state, b, workers);
}

/** How suitable a site is for a building type (multiplies output). */
export function siteFactorAt(world: World, def: BuildingDef, x: number, y: number): number {
  if (def.site.kind === 'fertility') {
    let sum = 0;
    let n = 0;
    const [w, h] = def.footprint;
    for (let oy = -1; oy <= h; oy++)
      for (let ox = -1; ox <= w; ox++) {
        const cx = x + ox;
        const cy = y + oy;
        if (cx < 0 || cy < 0 || cx >= world.size || cy >= world.size) continue;
        sum += world.fertility[cy * world.size + cx];
        n++;
      }
    const fert = n ? sum / n : 0;
    return Math.min(1.15, 0.25 + 0.95 * fert);
  }
  return 1;
}

/** Daily production for every operating building; also advances construction. */
export function updateProduction(state: GameState): void {
  for (const b of state.buildings) {
    const def = BUILDING[b.type];
    if (b.buildLeft > 0) {
      b.buildLeft--;
      if (b.buildLeft === 0) {
        b.status = 'Hiring workers';
        emit(state, 'good', `Construction of your ${def.name} is complete. Hire workers to start production.`, {
          at: { x: b.x, y: b.y },
          owner: b.owner,
        });
      }
      continue;
    }
    if (b.trainingLeft > 0) {
      b.trainingLeft--;
      b.skill = Math.min(1, b.skill + 0.35 / ECON.trainingDays);
    }
    const recipe = def.recipe;
    if (!recipe) continue;
    let out = potentialOutput(state, b);
    let status = b.workers === 0 ? 'No workers' : 'Producing';
    for (const [g, per] of Object.entries(recipe.inputs)) {
      const avail = (b.storage[g] ?? 0) / per;
      if (avail < out) {
        out = avail;
        status = `Waiting for ${g}`;
      }
    }
    const outPer = Object.values(recipe.outputs).reduce((a, v) => a + v, 0);
    const used = Object.values(b.storage).reduce((a, v) => a + v, 0);
    const free = Math.max(0, storageCap(b) - used);
    if (free < out * outPer) {
      out = free / outPer;
      status = 'Storage full: output not selling';
    }
    out = Math.max(0, out);
    for (const [g, per] of Object.entries(recipe.inputs)) b.storage[g] = Math.max(0, (b.storage[g] ?? 0) - per * out);
    for (const [g, per] of Object.entries(recipe.outputs)) b.storage[g] = (b.storage[g] ?? 0) + per * out;
    b.rate = out;
    b.month.produced += out;
    b.status = status;
  }
}
