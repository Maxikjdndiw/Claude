import { BUILDING } from '../data/buildings';
import { GOOD, GOODS } from '../data/goods';
import { learn } from './events';
import { marginalProduct, refWorkers } from './production';
import { localTowns } from './logistics';
import { forestAt, fishAt } from './resources';
import type { Sim } from './sim';
import type { GameState } from './state';
import { isYearStart } from './time';

const $ = (v: number) => `$${Math.round(v).toLocaleString()}`;
const pc = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Detectors that notice when an economic concept is at work in *your* game
 * and explain it with your own numbers. Each concept is explained once.
 */
export function detectConcepts(sim: Sim): void {
  const { state } = sim;
  const seen = state.learning.seen;
  const me = state.companies[0];
  if (me.bankrupt) return;
  const mine = state.buildings.filter((b) => b.owner === 0 && b.buildLeft === 0);

  // Supply and demand: a price you sell into fell a lot.
  if (!seen['supply-demand']) {
    for (const t of state.towns)
      for (const g of GOODS) {
        const m = t.market[g.id];
        const share = m.share[0] ?? 0;
        if (share < 0.12 || m.history.length < 10) continue;
        const before = m.history[m.history.length - 9];
        const drop = 1 - m.price / before;
        if (drop >= 0.15) {
          learn(
            state,
            'supply-demand',
            `Your ${g.name.toLowerCase()} price in ${t.name} dropped ${pc(drop)} in two months (from ${$(before)} to ${$(m.price)} per ton). You now supply ${pc(share)} of all ${g.name.toLowerCase()} sold there, and supply grew faster than demand.`,
          );
          return;
        }
      }
  }

  // Elasticity: after seeing a price move, explain why some goods react more.
  if (seen['supply-demand'] && !seen['elasticity']) {
    const sold = GOODS.filter((g) => state.towns.some((t) => (t.market[g.id].share[0] ?? 0) > 0.05));
    if (sold.length) {
      const g = sold[0];
      const dq = 0.2 * g.elasticity;
      learn(
        state,
        'elasticity',
        `${g.name} has a price elasticity of about ${g.elasticity}: if its price falls 20%, people buy only about ${pc(dq)} more. ${g.elasticity < 1 ? 'Demand is inelastic, so extra supply mostly pushes the price down.' : 'Demand is elastic, so lower prices win many more buyers.'}`,
      );
      return;
    }
  }

  // Diminishing returns: a building where the next worker adds little.
  if (!seen['diminishing-returns']) {
    for (const b of mine) {
      const def = BUILDING[b.type];
      if (!def.recipe || b.workers < Math.max(3, refWorkers(b) * 0.8)) continue;
      const first = marginalProduct(state, b, 1);
      const next = marginalProduct(state, b, b.workers);
      learn(
        state,
        'diminishing-returns',
        `At your ${def.name}, the 2nd worker adds ${first.toFixed(2)} t/day, but worker number ${b.workers + 1} would add only ${next.toFixed(2)} t/day. Same machines, more people: each extra worker contributes less.`,
      );
      return;
    }
  }

  // Value added: a processing plant is running.
  if (!seen['value-added']) {
    for (const b of mine) {
      const r = BUILDING[b.type].recipe;
      if (!r || !Object.keys(r.inputs).length || b.rate <= 0) continue;
      const out = Object.keys(r.outputs)[0];
      const local = localTowns(state, b)[0]?.town ?? state.towns[0];
      const inCost = Object.entries(r.inputs).reduce((a, [g, q]) => a + q * local.market[g].price, 0);
      const outVal = local.market[out].price;
      learn(
        state,
        'value-added',
        `Your ${BUILDING[b.type].name} turns ${$(inCost)} of inputs into a ton of ${GOOD[out].name.toLowerCase()} worth ${$(outVal)}: ${$(outVal - inCost)} of value added per ton to pay workers, upkeep and profit.`,
      );
      return;
    }
  }

  // Tragedy of the commons: a renewable stock around you is badly depleted.
  if (!seen['commons']) {
    for (const b of mine) {
      const kind = BUILDING[b.type].site.kind;
      if (kind !== 'forest' && kind !== 'fish') continue;
      const cx = b.x + 1;
      const cy = b.y + 1;
      let now = 0;
      let cap = 0;
      for (let y = cy - 4; y <= cy + 4; y++)
        for (let x = cx - 4; x <= cx + 4; x++) {
          if (x < 0 || y < 0 || x >= sim.world.size || y >= sim.world.size) continue;
          const c = y * sim.world.size + x;
          now += kind === 'forest' ? forestAt(state, sim.world, c) : fishAt(state, sim.world, c);
          cap += kind === 'forest' ? sim.world.forest[c] : sim.world.fish[c];
        }
      if (cap > 0 && now / cap < 0.6) {
        const rivals = state.buildings.some((o) => o.owner !== 0 && o.type === b.type && Math.hypot(o.x - b.x, o.y - b.y) < 12);
        learn(
          state,
          'commons',
          `The ${kind === 'forest' ? 'forest' : 'fish stock'} around your ${BUILDING[b.type].name} is down to ${pc(now / cap)} of its natural level${rivals ? ', and a competitor harvests the same area' : ''}. Harvest faster than it regrows and output collapses for everyone.`,
        );
        return;
      }
    }
  }

  // Monthly accounting lessons.
  const last = me.history[me.history.length - 1];
  if (last && last.ledger.sales > 0) {
    const l = last.ledger;
    const variable = l.materials + l.transport + l.wages;
    const fixed = l.maintenance + l.depreciation + l.training + l.research;
    if (!seen['fixed-costs']) {
      learn(
        state,
        'fixed-costs',
        `Last month: revenue ${$(l.sales)} − variable costs ${$(variable)} (wages, materials, transport) = contribution margin ${$(l.sales - variable)}. That must cover fixed costs of ${$(fixed)} (upkeep, depreciation) before you make a profit.`,
      );
      return;
    }
    if (!seen['depreciation'] && l.depreciation > 0) {
      learn(
        state,
        'depreciation',
        `Your buildings lost ${$(l.depreciation)} of book value last month. You paid for them in cash up front, but the income statement spreads that cost over their useful life.`,
      );
      return;
    }
    if (!seen['cashflow'] && last.cashflow.investing < -10000 && l.sales - variable - fixed > 0) {
      learn(
        state,
        'cashflow',
        `Last month you made an operating profit, but investments took ${$(-last.cashflow.investing)} of cash. Profit and cash are different things: watch both.`,
      );
      return;
    }
  }

  // Macro lessons.
  const m = state.macro;
  if (isYearStart(state.day) && state.day > 300 && !seen['inflation'] && me.cash > 10000) {
    const yr = m.history.slice(-12);
    const infl = yr.length ? yr[yr.length - 1].priceLevel / yr[0].priceLevel - 1 : m.inflation;
    learn(
      state,
      'inflation',
      `Prices rose about ${(infl * 100).toFixed(1)}% over the past year. Your ${$(me.cash)} in cash now buys ${$(me.cash * (infl / (1 + infl)))} less than a year ago.`,
    );
    return;
  }
  if (!seen['monetary-policy'] && m.history.length > 2) {
    const first = m.history[0].baseRate;
    if (Math.abs(m.baseRate - first) >= 0.0075) {
      learn(
        state,
        'monetary-policy',
        `The central bank has ${m.baseRate > first ? 'raised' : 'cut'} its rate from ${(first * 100).toFixed(2)}% to ${(m.baseRate * 100).toFixed(2)}% because inflation is ${(m.inflation * 100).toFixed(1)}% ${m.inflation > 0.02 ? 'above' : 'below'} its 2% target and the economy is ${m.gap > 0.005 ? 'running hot' : m.gap < -0.005 ? 'weak' : 'near normal'}.`,
      );
      return;
    }
  }
  if (!seen['income-elasticity'] && m.phase !== 'normal') {
    const lux = GOOD.furniture;
    const nec = GOOD.bread;
    const f = (g: typeof lux) => Math.pow(1 + 2 * m.gap, g.incomeElasticity) * (1 + 0.5 * m.gap) - 1;
    learn(
      state,
      'income-elasticity',
      `In this ${m.phase}, demand for furniture (a luxury) changes about ${(f(lux) * 100).toFixed(1)}%, while bread (a necessity) changes only ${(f(nec) * 100).toFixed(1)}%.`,
    );
  }
}

/** Short one-off lessons triggered by the player's own decisions. */
export function lessonOnStart(state: GameState, siteText: string): void {
  learn(state, 'comparative-location', siteText);
}
