import { BUILDING } from '../data/buildings';
import { ECON } from '../data/economy';
import { book } from './finance';
import { buyFromMarket, refPrice, sellToMarket } from './market';
import { potentialOutput } from './production';
import type { Building, GameState, Town } from './state';

export function center(b: Building): { x: number; y: number } {
  const [w, h] = BUILDING[b.type].footprint;
  return { x: b.x + w / 2, y: b.y + h / 2 };
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Towns within local delivery range of a building, nearest first. */
export function localTowns(state: GameState, b: Building): { town: Town; dist: number }[] {
  const c = center(b);
  return state.towns
    .map((town) => ({ town, dist: distance(c, { x: town.x + 0.5, y: town.y + 0.5 }) }))
    .filter((t) => t.dist <= ECON.localRange)
    .sort((a, b2) => a.dist - b2.dist);
}

/** Reference price of a good near a building (used for internal transfer pricing). */
function transferPrice(state: GameState, b: Building, good: string): number {
  const t = localTowns(state, b)[0];
  return t ? t.town.market[good].price : refPrice(state, good);
}

/**
 * Local logistics for one day:
 *  1. Buildings pull missing inputs from your other buildings nearby
 *     (booked at the local market price: transfer pricing).
 *  2. If still short, they buy from a nearby town market (if allowed).
 *  3. Remaining outputs are sold to the best nearby town market.
 */
export function updateLocalLogistics(state: GameState): void {
  const operating = state.buildings.filter((b) => b.buildLeft === 0);

  for (const b of operating) {
    const recipe = BUILDING[b.type].recipe;
    if (!recipe) continue;
    const company = state.companies[b.owner];
    const daily = Math.max(potentialOutput(state, b), 0.5);
    for (const [g, per] of Object.entries(recipe.inputs)) {
      const buffer = daily * per * 4;
      let need = buffer - (b.storage[g] ?? 0);
      if (need <= 0.01) continue;
      // 1. Internal supply.
      const bc = center(b);
      const sources = operating
        .filter((s) => s !== b && s.owner === b.owner && (s.storage[g] ?? 0) > 0.01 && !(BUILDING[s.type].recipe?.inputs[g]))
        .map((s) => ({ s, d: distance(bc, center(s)) }))
        .filter((x) => x.d <= ECON.localRange)
        .sort((a, c) => a.d - c.d);
      for (const { s, d } of sources) {
        if (need <= 0.01) break;
        const q = Math.min(need, s.storage[g]);
        s.storage[g] -= q;
        b.storage[g] = (b.storage[g] ?? 0) + q;
        need -= q;
        const value = q * transferPrice(state, b, g);
        s.month.revenue += value;
        b.month.costs += value;
        const haul = q * d * ECON.localHaulCost;
        book(company, 'transport', haul);
        b.month.costs += haul;
      }
      // 2. Buy from a local market.
      if (need > 0.01 && b.buyInputs) {
        const t = localTowns(state, b)[0];
        if (t) {
          const [q, cost] = buyFromMarket(state, t.town, g, need);
          if (q > 0) {
            b.storage[g] = (b.storage[g] ?? 0) + q;
            const haul = q * t.dist * ECON.localHaulCost;
            book(company, 'materials', cost);
            book(company, 'transport', haul);
            b.month.costs += cost + haul;
          }
        }
      }
    }
  }

  // 3. Sell outputs.
  for (const b of operating) {
    const recipe = BUILDING[b.type].recipe;
    if (!recipe) continue;
    const company = state.companies[b.owner];
    for (const g of Object.keys(recipe.outputs)) {
      const q = b.storage[g] ?? 0;
      if (q < 0.01) continue;
      const towns = localTowns(state, b);
      if (!towns.length) continue;
      // Best net price after haulage.
      let best = towns[0];
      let bestNet = -Infinity;
      for (const t of towns) {
        const net = t.town.market[g].price - t.dist * ECON.localHaulCost;
        if (net > bestNet) {
          bestNet = net;
          best = t;
        }
      }
      if (bestNet < (b.sellMin[g] ?? 0)) continue;
      const revenue = sellToMarket(state, best.town, g, q, b.owner);
      const haul = q * best.dist * ECON.localHaulCost;
      b.storage[g] = 0;
      book(company, 'sales', revenue);
      book(company, 'transport', haul);
      b.month.revenue += revenue;
      b.month.costs += haul;
    }
  }
}
