import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/sim/world/generate';
import { startNewGame } from '../src/sim/setup';
import { build, checkPlacement, foundCompany } from '../src/sim/commands';
import { spawnBots } from '../src/sim/ai';
import { annuity, creditRating, serviceLoans, takeLoan } from '../src/sim/bank';
import { updateMacroMonthly } from '../src/sim/macro';
import { buyShares, ipo, payDividend } from '../src/sim/stocks';
import { companyValue, netProfit } from '../src/sim/finance';
import { SimRng } from '../src/sim/rng';
import type { Sim } from '../src/sim/sim';

function newGame(difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
  const sim = startNewGame(generateWorld(42), 'P', difficulty);
  const t = sim.state.towns[0];
  [[7, 2], [-7, 2], [2, 7], [2, -7]].some(([dx, dy]) => foundCompany(sim, 0, t.x + dx, t.y + dy).ok);
  return sim;
}

function placeNear(sim: Sim, owner: number, type: string, x: number, y: number) {
  for (let d = 0; d < 14; d++)
    for (let oy = -d; oy <= d; oy++)
      for (let ox = -d; ox <= d; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== d) continue;
        if (checkPlacement(sim, owner, type, x + ox, y + oy).ok) return build(sim, owner, type, x + ox, y + oy).building!;
      }
  return null;
}

describe('milestone 6: banks, macro and stocks', () => {
  it('an annuity loan is fully repaid by its installments', () => {
    const sim = newGame();
    const c = sim.state.companies[0];
    expect(takeLoan(sim.state, 0, 50000, 24, false).ok).toBe(true);
    const loan = sim.state.loans[0];
    const pay = annuity(50000, loan.rate, 24);
    let interest = 0;
    for (let m = 0; m < 24; m++) {
      const before = c.month.interest;
      serviceLoans(sim.state);
      interest += c.month.interest - before;
    }
    expect(sim.state.loans.length).toBe(0);
    expect(interest).toBeCloseTo(pay * 24 - 50000, 0);
  });

  it('the central bank raises rates when inflation is high', () => {
    const sim = newGame();
    const m = sim.state.macro;
    m.inflation = 0.08;
    const before = m.baseRate;
    const rng = new SimRng(1);
    for (let i = 0; i < 6; i++) updateMacroMonthly(sim.state, rng);
    expect(m.baseRate).toBeGreaterThan(before + 0.01);
  });

  it('more debt worsens the credit rating', () => {
    const sim = newGame();
    const c = sim.state.companies[0];
    for (let i = 0; i < 90; i++) sim.step();
    const r0 = creditRating(sim.state, c).index;
    sim.state.loans.push({ id: 999, owner: 0, principal: 1e6, balance: 1e6, rate: 0.08, variable: false, spread: 0.04, monthsLeft: 60, takenDay: 0 });
    expect(creditRating(sim.state, c).index).toBeGreaterThan(r0);
  });

  it('IPO raises cash; buying a majority of a rival takes it over', () => {
    const sim = newGame();
    spawnBots(sim);
    const me = sim.state.companies[0];
    const bot = sim.state.companies[1];
    // Fake a successful history for both.
    for (const c of [me, bot]) {
      c.cash = 2_000_000;
      for (let i = 0; i < 8; i++) c.history.push({ day: i * 30, ledger: { ...c.month, sales: 50000 }, cashflow: c.cashflow, cash: c.cash, value: 0 });
    }
    sim.step();
    const cash = me.cash;
    expect(ipo(sim.state, 0, 0.3).ok).toBe(true);
    expect(me.cash).toBeGreaterThan(cash);
    expect(me.equity.holdings.founder / me.equity.shares).toBeCloseTo(0.7, 5);
    expect(payDividend(sim.state, 0, 0.01).ok).toBe(true);
    expect(me.founderWealth).toBeGreaterThan(0);

    expect(ipo(sim.state, 1, 0.6).ok).toBe(true);
    const plant = placeNear(sim, 1, 'farm', bot.hq!.x + 4, bot.hq!.y + 4);
    me.cash = 1e9;
    expect(buyShares(sim, 0, 1, bot.equity.holdings.public).ok).toBe(true);
    expect(bot.acquiredBy).toBe(0);
    if (plant) expect(plant.owner).toBe(0);
    expect(companyValue(sim.state, bot)).toBe(0);
  });

  it('a 5-year game with bots stays numerically sane', () => {
    const sim = newGame('hard');
    spawnBots(sim);
    for (let i = 0; i < 365 * 5; i++) sim.step();
    const s = sim.state;
    expect(s.priceLevel).toBeGreaterThan(1);
    expect(Number.isFinite(s.priceLevel)).toBe(true);
    expect(s.macro.history.length).toBeGreaterThan(50);
    for (const c of s.companies) expect(Number.isFinite(c.cash)).toBe(true);
    for (const t of s.towns) for (const m of Object.values(t.market)) expect(Number.isFinite(m.price) && m.price > 0).toBe(true);
    // eslint-disable-next-line no-console
    console.log(
      'priceLevel', s.priceLevel.toFixed(3), 'rate', s.macro.baseRate, 'phase', s.macro.phase,
      'events', s.log.filter((e) => e.text.includes(':')).length,
      s.companies.map((c) => `${c.name}: value ${Math.round(companyValue(s, c))} listed ${c.equity.listed} debt ${Math.round(s.loans.filter((l) => l.owner === c.id).reduce((a, l) => a + l.balance, 0))} ${c.bankrupt ? 'BANKRUPT' : ''} ${c.acquiredBy !== undefined ? 'ACQUIRED' : ''} profit ${c.history.length ? Math.round(netProfit(c.history[c.history.length - 1].ledger)) : 0}`).join('\n'),
    );
  });
});
