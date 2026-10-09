import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/sim/world/generate';
import { createGame } from '../src/sim/setup';
import { Sim } from '../src/sim/sim';
import { build, checkPlacement, foundCompany } from '../src/sim/commands';
import { marginalProduct, potentialOutput } from '../src/sim/production';
import { sellToMarket } from '../src/sim/market';
import { netProfit } from '../src/sim/finance';

function newSim(seed = 42) {
  const world = generateWorld(seed);
  const state = createGame(world, 'Test Co');
  return new Sim(world, state);
}

/** Find a valid spot for `type` near (x, y). */
function place(sim: Sim, type: string, x: number, y: number) {
  for (let r = 0; r < 20; r++)
    for (let oy = -r; oy <= r; oy++)
      for (let ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        if (checkPlacement(sim, 0, type, x + ox, y + oy).ok) return build(sim, 0, type, x + ox, y + oy).building!;
      }
  throw new Error('no spot for ' + type);
}

describe('markets', () => {
  it('price falls when a town is flooded with supply', () => {
    const sim = newSim();
    const town = sim.state.towns[0];
    const before = town.market.bread.price;
    sellToMarket(sim.state, town, 'bread', town.market.bread.consumed * 10, 0);
    expect(town.market.bread.price).toBeLessThan(before * 0.6);
  });

  it('sustained extra supply settles at a lower equilibrium price', () => {
    const sim = newSim();
    const town = sim.state.towns[0];
    const d0 = town.market.bread.consumed;
    for (let i = 0; i < 200; i++) {
      sellToMarket(sim.state, town, 'bread', d0 * 0.5, 0);
      sim.step();
    }
    const rel = town.market.bread.price / 140;
    // Analytic equilibrium for +50% supply with elasticities 0.5 / 1.5 is ~0.80.
    expect(rel).toBeGreaterThan(0.7);
    expect(rel).toBeLessThan(0.9);
    // Consumers buy more at the lower price.
    expect(town.market.bread.consumed).toBeGreaterThan(d0);
  });
});

describe('production chain', () => {
  it('shows diminishing marginal returns to labor', () => {
    const sim = newSim();
    const t = sim.state.towns[0];
    foundCompany(sim, 0, t.x + 4, t.y + 4);
    const farm = place(sim, 'farm', t.x + 5, t.y + 5);
    const mp = [2, 6, 10, 14].map((n) => marginalProduct(sim.state, farm, n));
    for (let i = 1; i < mp.length; i++) expect(mp[i]).toBeLessThan(mp[i - 1]);
    expect(potentialOutput(sim.state, farm, 16)).toBeGreaterThan(potentialOutput(sim.state, farm, 8));
  });

  it('a farm-mill-bakery chain near a town produces and sells bread profitably', () => {
    const sim = newSim();
    const t = sim.state.towns[0];
    expect(foundCompany(sim, 0, t.x + 3, t.y + 3).ok).toBe(true);
    sim.state.companies[0].cash = 250_000;
    const farm = place(sim, 'farm', t.x + 5, t.y + 3);
    const mill = place(sim, 'mill', t.x + 3, t.y + 6);
    const bakery = place(sim, 'bakery', t.x + 6, t.y + 6);
    const startCash = sim.state.companies[0].cash;
    for (let i = 0; i < 366; i++) sim.step();
    const c = sim.state.companies[0];
    const last3 = c.history.slice(-3).reduce((a, m) => a + netProfit(m.ledger), 0);
    // eslint-disable-next-line no-console
    console.log({
      cash: Math.round(c.cash), startCash, last3: Math.round(last3),
      farm: [farm.workers, farm.rate.toFixed(2), farm.status], mill: [mill.workers, mill.rate.toFixed(2), mill.status],
      bakery: [bakery.workers, bakery.rate.toFixed(2), bakery.status, JSON.stringify(bakery.storage), JSON.stringify(mill.storage), farm.siteFactor],
      bread: t.market.bread.price.toFixed(1), flour: t.market.flour.price.toFixed(1), wheat: t.market.wheat.price.toFixed(1),
      ledger: c.history[c.history.length - 1].ledger,
    });
    expect(bakery.month.produced + bakery.last.produced).toBeGreaterThan(0);
    expect(c.history.length).toBe(12);
    expect(last3).toBeGreaterThan(0);
  });
});
