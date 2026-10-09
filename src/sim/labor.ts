import { BUILDING } from '../data/buildings';
import { ECON } from '../data/economy';
import { emit } from './events';
import type { SimRng } from './rng';
import type { Building, GameState, Town } from './state';
import { wageFloor } from './macro';

/**
 * Labor market per town. The market wage rises when unemployment is low
 * (workers are scarce) and with the town's wealth and the price level.
 */
export function marketWage(state: GameState, town: Town): number {
  const u = Math.max(0.005, town.unemployed / Math.max(1, town.workforce));
  const scarcity = Math.min(1.7, Math.max(0.75, Math.pow(u / ECON.naturalUnemployment, -0.3)));
  return Math.max(wageFloor(state), ECON.baseWage * Math.pow(town.wealth, 0.8) * state.priceLevel * scarcity);
}

export function townOf(state: GameState, b: Building): Town | undefined {
  return b.town >= 0 ? state.towns[b.town] : undefined;
}

/** Daily hiring, layoffs and quits for all operating buildings. */
export function updateLabor(state: GameState, rng: SimRng): void {
  const employedBy = new Map<number, number>();
  for (const b of state.buildings) {
    const def = BUILDING[b.type];
    if (b.buildLeft > 0 || def.maxWorkers === 0) continue;
    const town = townOf(state, b);
    if (!town) continue;
    const mw = marketWage(state, town);
    const floor = wageFloor(state);
    if (b.wage < floor) b.wage = Math.ceil(floor * 10) / 10;

    // Layoffs.
    if (b.workers > b.targetWorkers) {
      const fired = b.workers - b.targetWorkers;
      b.workers = b.targetWorkers;
      town.unemployed += fired;
    }

    // Quits: the further the wage is below the market wage, the more people leave.
    if (b.workers > 0) {
      const gap = Math.max(0, 1 - b.wage / mw);
      const p = 0.0006 + 0.15 * Math.pow(gap, 1.5);
      const expected = b.workers * p;
      let quits = Math.floor(expected);
      if (rng.next() < expected - quits) quits++;
      if (quits > 0) {
        b.workers -= quits;
        town.unemployed += quits;
        if (gap > 0.05 && b.owner === 0 && (b.quitNotice === undefined || state.day - b.quitNotice > 30)) {
          b.quitNotice = state.day;
          emit(state, 'bad', `Workers are quitting your ${def.name}: pay is ${Math.round(gap * 100)}% below the ${town.name} market wage.`, {
            concept: 'wages',
            at: { x: b.x, y: b.y },
            owner: b.owner,
          });
        }
      }
    }

    // Hiring: applicants depend on unemployment and how attractive the wage is.
    const want = b.targetWorkers - b.workers;
    if (want > 0 && town.unemployed >= 1) {
      const attract = Math.min(3, Math.max(0.05, Math.pow(b.wage / mw, 3)));
      const expected = Math.max(attract >= 0.85 ? 0.6 : 0, town.unemployed * 0.004 * attract);
      let hires = Math.floor(expected);
      if (rng.next() < expected - hires) hires++;
      hires = Math.min(hires, want, Math.floor(town.unemployed));
      if (hires > 0) {
        // New hires are untrained.
        b.skill = (b.skill * b.workers) / (b.workers + hires);
        b.workers += hires;
        town.unemployed -= hires;
      }
    }
    employedBy.set(town.id, (employedBy.get(town.id) ?? 0) + b.workers);
  }

  // The rest of the town economy slowly adapts (migration, other employers).
  for (const town of state.towns) {
    const companyJobs = employedBy.get(town.id) ?? 0;
    // Recessions push unemployment up, booms pull it down.
    const natural = Math.max(0.02, ECON.naturalUnemployment - 0.8 * state.macro.gap);
    const target = Math.max(town.workforce * 0.01, town.workforce * natural - 0.35 * companyJobs);
    town.unemployed += (target - town.unemployed) * 0.01;
    town.wage = marketWage(state, town);
  }
}

/** Nearest town within commuting range of a building (or -1). */
export function laborTownFor(state: GameState, x: number, y: number): number {
  let best = -1;
  let bestD = ECON.commuteRange;
  for (const t of state.towns) {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d <= bestD) {
      bestD = d;
      best = t.id;
    }
  }
  return best;
}
