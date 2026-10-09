import { ECON } from '../data/economy';
import { isYearStart } from './time';
import type { GameState } from './state';

/**
 * Monthly town growth. Towns grow faster when jobs are plentiful (low
 * unemployment attracts people) and shrink when work is scarce.
 * Returns true when the town layout should be rebuilt (once a year).
 */
export function updateTowns(state: GameState): boolean {
  for (const t of state.towns) {
    const u = t.unemployed / Math.max(1, t.workforce);
    const growth = Math.min(0.006, Math.max(-0.004, 0.0012 + 0.05 * (ECON.naturalUnemployment - u)));
    const before = t.population;
    t.population = Math.round(t.population * (1 + growth));
    const dWork = Math.round((t.population - before) * ECON.laborShare);
    t.workforce += dWork;
    // Newcomers arrive looking for work.
    t.unemployed = Math.max(0, t.unemployed + dWork * 0.5);
  }
  return isYearStart(state.day);
}
