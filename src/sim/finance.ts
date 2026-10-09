import { BUILDING } from '../data/buildings';
import { ECON } from '../data/economy';
import { GOOD } from '../data/goods';
import { emit } from './events';
import { maintenance } from './production';
import {
  emptyLedger,
  emptyStats,
  type Building,
  type Company,
  type GameState,
  type Ledger,
  type LedgerCat,
} from './state';

const NON_CASH: LedgerCat[] = ['depreciation'];

/**
 * Book an income-statement item. `amount` is always positive: revenue for
 * 'sales', an expense for every other category. Cash moves too, except for
 * non-cash items like depreciation.
 */
export function book(c: Company, cat: LedgerCat, amount: number): void {
  if (!amount) return;
  c.month[cat] += amount;
  if (NON_CASH.includes(cat)) return;
  const delta = cat === 'sales' ? amount : -amount;
  c.cash += delta;
  c.cashflow.operating += delta;
}

/** Capital expenditure (building, upgrading): cash out, investing activity. */
export function invest(c: Company, amount: number): void {
  c.cash -= amount;
  c.cashflow.investing -= amount;
}

export function expenses(l: Ledger): number {
  let s = 0;
  for (const k in l) if (k !== 'sales') s += l[k as LedgerCat];
  return s;
}

/** Revenue minus all expenses (incl. depreciation, interest, tax). */
export function netProfit(l: Ledger): number {
  return l.sales - expenses(l);
}

/** Profit before interest and tax. */
export function operatingProfit(l: Ledger): number {
  return l.sales - l.materials - l.wages - l.transport - l.maintenance - l.training - l.depreciation;
}

export function sumLedgers(ls: Ledger[]): Ledger {
  const out = emptyLedger();
  for (const l of ls) for (const k in l) out[k as LedgerCat] += l[k as LedgerCat];
  return out;
}

/** Depreciation per day for a building (straight line over its useful life). */
export function dailyDepreciation(b: Building): number {
  return b.invested / (BUILDING[b.type].lifeYears * 365);
}

export function inventoryValue(state: GameState, owner: number): number {
  let v = 0;
  for (const b of state.buildings) {
    if (b.owner !== owner) continue;
    for (const [g, q] of Object.entries(b.storage)) v += q * GOOD[g].basePrice * state.priceLevel * 0.8;
  }
  return v;
}

export function debtOf(state: GameState, owner: number): number {
  let d = 0;
  for (const l of state.loans) if (l.owner === owner) d += l.balance;
  return d;
}

/** Market value of shares this company holds in other companies. */
export function investmentsValue(state: GameState, c: Company): number {
  let v = 0;
  for (const o of state.companies) {
    if (o.id === c.id) continue;
    v += (o.equity.holdings[`c${c.id}`] ?? 0) * o.equity.price;
  }
  return v;
}

export function fixedAssets(state: GameState, owner: number): number {
  let book = 0;
  for (const b of state.buildings) if (b.owner === owner) book += b.bookValue;
  for (const l of state.lines) if (l.owner === owner) book += l.bookValue;
  return book;
}

export function companyAssets(state: GameState, c: Company): number {
  return Math.max(0, c.cash) + fixedAssets(state, c.id) + inventoryValue(state, c.id) + investmentsValue(state, c);
}

/** Book equity: assets minus debt (and minus any overdraft). */
export function bookEquity(state: GameState, c: Company): number {
  return companyAssets(state, c) - debtOf(state, c.id) - Math.max(0, -c.cash);
}

/** Price/earnings multiple investors pay: lower when interest rates are high. */
export function peMultiple(state: GameState): number {
  const m = state.macro;
  const base = 11 * (0.06 / (m.baseRate + 0.02));
  const mood = m.phase === 'boom' ? 1.15 : m.phase === 'recession' ? 0.85 : 1;
  return Math.min(22, Math.max(4, base * mood));
}

/** Fundamental value: book equity plus the value of future earnings. */
export function fundamentalValue(state: GameState, c: Company): number {
  const n = Math.min(12, c.history.length);
  const ttm = n ? (netProfit(trailing(c, n)) * 12) / n : 0;
  return Math.max(1000, bookEquity(state, c) + Math.max(0, ttm) * peMultiple(state) * 0.5);
}

/** Sum of the last `months` closed months. */
export function trailing(c: Company, months: number): Ledger {
  return sumLedgers(c.history.slice(-months).map((m) => m.ledger));
}

/**
 * Estimated company value: net assets plus a multiple of (annualized,
 * positive) recent earnings. Before an IPO this is the yardstick for success.
 */
export function companyValue(state: GameState, c: Company): number {
  if (c.bankrupt || c.acquiredBy !== undefined) return 0;
  return c.equity.listed ? c.equity.price * c.equity.shares : fundamentalValue(state, c);
}

/** Daily running costs: wages, upkeep, depreciation, overdraft interest. */
export function updateFinance(state: GameState): void {
  for (const b of state.buildings) {
    if (b.buildLeft > 0) continue;
    const c = state.companies[b.owner];
    const wages = b.workers * b.wage;
    const upkeep = maintenance(b, state);
    const dep = Math.min(b.bookValue, dailyDepreciation(b));
    book(c, 'wages', wages);
    book(c, 'maintenance', upkeep);
    book(c, 'depreciation', dep);
    b.bookValue -= dep;
    b.month.costs += wages + upkeep + dep;
  }
  for (const c of state.companies) {
    if (c.bankrupt) continue;
    if (c.bankrupt || c.acquiredBy !== undefined) continue;
    if (c.cash < 0) {
      book(c, 'interest', (-c.cash * (state.macro.baseRate + 0.12)) / 365);
      c.negativeDays++;
      if (c.negativeDays === 1 && c.isPlayer)
        emit(state, 'bad', 'Your cash is negative. The bank charges expensive overdraft interest; take a loan or cut costs before it is too late.', {
          concept: 'cashflow',
        });
      // Small overdrafts are tolerated; a deep hole for too long is fatal.
      const limit = Math.max(5000, companyAssets(state, c) * 0.1);
      if (c.negativeDays >= ECON.bankruptcyDays && c.cash < -limit) {
        c.bankrupt = true;
        if (c.isPlayer) state.gameOver = { reason: 'Your company ran out of cash and went bankrupt.', day: state.day };
      }
    } else c.negativeDays = 0;
  }
}

/** Close the month: corporate tax, history snapshot, reset counters. */
export function closeMonth(state: GameState): void {
  for (const c of state.companies) {
    const pre = operatingProfit(c.month) - c.month.interest;
    if (pre > 0) book(c, 'tax', pre * ECON.taxRate);
    c.history.push({
      day: state.day,
      ledger: c.month,
      cashflow: c.cashflow,
      cash: c.cash,
      value: 0,
    });
    if (c.history.length > 240) c.history.shift();
    c.history[c.history.length - 1].value = companyValue(state, c);
    c.month = emptyLedger();
    c.cashflow = { operating: 0, investing: 0, financing: 0 };
  }
  for (const b of state.buildings) {
    b.last = b.month;
    b.month = emptyStats();
  }
}
