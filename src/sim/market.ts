import { ECON } from '../data/economy';
import { GOOD, GOODS } from '../data/goods';
import type { GameState, MarketState, Town } from './state';
import { demandMultiplier, incomeFactor, supplyMultiplier } from './macro';

/**
 * Supply & demand in a town market.
 *
 * - Households and local businesses consume  Qd = D0 * p^(-elasticity)
 * - Outside producers deliver               Qs = D0 * share * p^(supplyElasticity)
 * - The price follows inventory pressure:   p = (stock / targetStock)^(-k)
 *   where p is the price relative to the reference price.
 *
 * Delivering goods raises the stock, which lowers the price, which raises
 * consumption and pushes outside suppliers out: the market finds a new
 * equilibrium. Prices are bounded by an export floor and an import ceiling.
 */

/** Base daily demand (tons) at the reference price. */
export function baseDemand(town: Town, goodId: string, state?: GameState): number {
  const g = GOOD[goodId];
  const income = state ? incomeFactor(state) : 1;
  const cycle = state ? demandMultiplier(state, goodId) * (1 + 0.5 * state.macro.gap) : 1;
  return ECON.demandScale * g.perCapita * town.population * Math.pow(town.wealth * income, g.incomeElasticity) * cycle;
}

export function refPrice(state: GameState, goodId: string): number {
  return GOOD[goodId].basePrice * state.priceLevel;
}

export function targetStock(town: Town, goodId: string): number {
  return Math.max(1, baseDemand(town, goodId) * ECON.stockDays);
}

/** Relative price (1 = reference) implied by a stock level. */
export function relPriceForStock(town: Town, goodId: string, stock: number): number {
  const t = targetStock(town, goodId);
  const rel = Math.pow(Math.max(stock, t * 0.01) / t, -ECON.priceSensitivity);
  return Math.min(ECON.priceCeiling, Math.max(ECON.priceFloor, rel));
}

/** Stock level at which the relative price equals `rel`. */
function stockForRelPrice(town: Town, goodId: string, rel: number): number {
  return targetStock(town, goodId) * Math.pow(rel, -1 / ECON.priceSensitivity);
}

export function newMarket(state: GameState, town: Town, goodId: string): MarketState {
  const stock = targetStock(town, goodId);
  return {
    stock,
    price: refPrice(state, goodId),
    consumed: baseDemand(town, goodId),
    outside: baseDemand(town, goodId),
    soldMonth: {},
    outsideMonth: 0,
    share: {},
    history: [refPrice(state, goodId)],
  };
}

function updatePrice(state: GameState, town: Town, goodId: string): void {
  const m = town.market[goodId];
  m.price = refPrice(state, goodId) * relPriceForStock(town, goodId, m.stock);
}

/**
 * Sell `qty` tons into a town. The price you get is the price at the midpoint
 * of the delivery (big deliveries move the price against you).
 * Returns revenue.
 */
export function sellToMarket(state: GameState, town: Town, goodId: string, qty: number, company: number): number {
  if (qty <= 0) return 0;
  const m = town.market[goodId];
  m.stock += qty / 2;
  updatePrice(state, town, goodId);
  const unit = m.price;
  m.stock += qty / 2;
  updatePrice(state, town, goodId);
  m.soldMonth[company] = (m.soldMonth[company] ?? 0) + qty;
  return unit * qty;
}

/** Most you can buy from a town at once (the market keeps a reserve). */
export function buyable(town: Town, goodId: string): number {
  return Math.max(0, town.market[goodId].stock * 0.5);
}

/** Buy up to `qty` tons from a town. Returns [tons bought, cost]. */
export function buyFromMarket(state: GameState, town: Town, goodId: string, qty: number): [number, number] {
  const q = Math.min(qty, buyable(town, goodId));
  if (q <= 0) return [0, 0];
  const m = town.market[goodId];
  m.stock -= q / 2;
  updatePrice(state, town, goodId);
  const unit = m.price;
  m.stock -= q / 2;
  updatePrice(state, town, goodId);
  return [q, unit * q];
}

/** Price you would get selling `qty` now, without changing the market. */
export function quoteSell(state: GameState, town: Town, goodId: string, qty: number): number {
  const m = town.market[goodId];
  return refPrice(state, goodId) * relPriceForStock(town, goodId, m.stock + qty / 2);
}

/** Daily market clearing: consumption, outside supply, exports at the floor. */
export function updateMarkets(state: GameState): void {
  for (const town of state.towns) {
    for (const g of GOODS) {
      const m = town.market[g.id];
      const d0 = baseDemand(town, g.id, state);
      const rel = m.price / refPrice(state, g.id);
      const demand = d0 * Math.pow(rel, -g.elasticity);
      const consumed = Math.min(m.stock, demand);
      // Outside supply is anchored to normal demand (not the cycle) and hit by supply shocks.
      const outside = baseDemand(town, g.id) * g.outsideSupply * supplyMultiplier(state, g.id) * Math.pow(rel, g.supplyElasticity);
      m.stock += outside - consumed;
      // Exporters buy up surplus that would push the price below the floor.
      const floorStock = stockForRelPrice(town, g.id, ECON.priceFloor);
      if (m.stock > floorStock) m.stock -= (m.stock - floorStock) * 0.25;
      m.consumed = consumed;
      m.outside = outside;
      m.outsideMonth += outside;
      updatePrice(state, town, g.id);
      if (state.day % 7 === 0) {
        m.history.push(m.price);
        if (m.history.length > 520) m.history.shift();
      }
    }
  }
}

/** Monthly: snapshot market shares and reset counters. */
export function closeMarketMonth(state: GameState): void {
  for (const town of state.towns) {
    for (const g of GOODS) {
      const m = town.market[g.id];
      let total = m.outsideMonth;
      for (const k in m.soldMonth) total += m.soldMonth[k];
      const share: Record<number, number> = {};
      if (total > 0) for (const k in m.soldMonth) share[Number(k)] = m.soldMonth[k] / total;
      m.share = share;
      m.soldMonth = {};
      m.outsideMonth = 0;
    }
  }
}
