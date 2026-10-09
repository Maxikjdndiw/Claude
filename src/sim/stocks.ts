import { emit } from './events';
import { fundamentalValue, netProfit, trailing } from './finance';
import type { SimRng } from './rng';
import type { Sim } from './sim';
import type { Company, GameState } from './state';

/**
 * The stock market. Share prices follow fundamental value (book equity plus
 * capitalized earnings) times a mood factor (sentiment) that wanders and
 * swings with the business cycle. Owning more than 50% of a company means
 * control; selling too many of your own shares puts control at risk.
 */

export const IPO_MIN_VALUE = 600_000;
export const IPO_MIN_MONTHS = 6;

const key = (id: number) => `c${id}`;

export function holderName(state: GameState, holder: string): string {
  if (holder === 'founder') return 'Founders';
  if (holder === 'public') return 'Public investors';
  return state.companies[Number(holder.slice(1))]?.name ?? holder;
}

/** Share of a company controlled by a holder (0..1). */
export function stake(c: Company, holder: string): number {
  return (c.equity.holdings[holder] ?? 0) / c.equity.shares;
}

/** Fraction of the player's own company the player (founder) still owns. */
export function founderStake(c: Company): number {
  return stake(c, 'founder');
}

export function listed(state: GameState): Company[] {
  return state.companies.filter((c) => c.equity.listed && !c.bankrupt && c.acquiredBy === undefined);
}

/** Daily: prices drift with fundamentals and sentiment. */
export function updateStocks(state: GameState, rng: SimRng): void {
  const mood = state.macro.phase === 'boom' ? 1.08 : state.macro.phase === 'recession' ? 0.88 : 1;
  for (const c of state.companies) {
    if (c.bankrupt || c.acquiredBy !== undefined) continue;
    const e = c.equity;
    const fps = fundamentalValue(state, c) / e.shares;
    if (e.listed) {
      e.sentiment *= Math.exp(rng.normal() * 0.012);
      e.sentiment += (mood - e.sentiment) * 0.02;
      e.sentiment = Math.min(1.8, Math.max(0.5, e.sentiment));
      e.price = Math.max(0.01, fps * e.sentiment);
    } else e.price = fps;
    if (state.day % 7 === 0) {
      e.history.push(e.price);
      if (e.history.length > 520) e.history.shift();
    }
  }
}

/** Monthly earnings reaction: surprises move sentiment. */
export function earningsReaction(state: GameState): void {
  for (const c of listed(state)) {
    if (c.history.length < 2) continue;
    const now = netProfit(c.history[c.history.length - 1].ledger);
    const before = netProfit(trailing(c, Math.min(4, c.history.length)) ) / Math.min(4, c.history.length);
    const surprise = before !== 0 ? (now - before) / Math.abs(before) : 0;
    const move = Math.max(-0.12, Math.min(0.12, surprise * 0.08));
    const old = c.equity.price;
    c.equity.sentiment = Math.min(1.8, Math.max(0.5, c.equity.sentiment * (1 + move)));
    if (c.isPlayer && Math.abs(move) > 0.03)
      emit(state, move > 0 ? 'good' : 'bad', `Monthly results: your share price ${move > 0 ? 'jumps' : 'drops'} about ${Math.round(Math.abs(move) * 100)}% as profits came in ${move > 0 ? 'above' : 'below'} expectations (was $${old.toFixed(2)}).`, {
        concept: 'share-price',
      });
  }
}

export function ipoCheck(state: GameState, c: Company): { ok: boolean; reason?: string } {
  if (c.equity.listed) return { ok: false, reason: 'Already listed' };
  if (fundamentalValue(state, c) < IPO_MIN_VALUE * state.priceLevel)
    return { ok: false, reason: `Company value must reach $${Math.round(IPO_MIN_VALUE * state.priceLevel).toLocaleString()}` };
  if (c.history.length < IPO_MIN_MONTHS) return { ok: false, reason: `Needs ${IPO_MIN_MONTHS} months of trading history` };
  const n = Math.min(12, c.history.length);
  if (netProfit(trailing(c, n)) <= 0) return { ok: false, reason: 'Investors want to see a profit first' };
  return { ok: true };
}

/**
 * Initial public offering: new shares are sold to the public so the company
 * raises cash. IPOs are usually priced at a discount to attract buyers.
 */
export function ipo(state: GameState, owner: number, fraction: number): { ok: boolean; reason?: string } {
  const c = state.companies[owner];
  const chk = ipoCheck(state, c);
  if (!chk.ok) return chk;
  fraction = Math.min(0.6, Math.max(0.05, fraction));
  const e = c.equity;
  const price = (fundamentalValue(state, c) / e.shares) * 0.9;
  const newShares = Math.round((fraction / (1 - fraction)) * e.shares);
  const raised = newShares * price;
  e.shares += newShares;
  e.holdings.public = (e.holdings.public ?? 0) + newShares;
  e.listed = true;
  e.ipoDay = state.day;
  e.sentiment = 1;
  e.price = price;
  c.cash += raised;
  c.cashflow.financing += raised;
  emit(state, 'good', `${c.name} is now listed on the stock exchange! ${Math.round(fraction * 100)}% sold to investors at $${price.toFixed(2)} per share, raising $${Math.round(raised).toLocaleString()}.`, {
    concept: 'ipo',
  });
  return { ok: true };
}

/** Issue new shares (secondary offering): raises cash, dilutes existing owners. */
export function issueShares(state: GameState, owner: number, n: number): { ok: boolean; reason?: string } {
  const c = state.companies[owner];
  if (!c.equity.listed) return { ok: false, reason: 'List the company first (IPO)' };
  n = Math.round(n);
  if (n <= 0) return { ok: false, reason: 'Nothing to issue' };
  const price = c.equity.price * 0.95;
  c.equity.shares += n;
  c.equity.holdings.public = (c.equity.holdings.public ?? 0) + n;
  c.cash += n * price;
  c.cashflow.financing += n * price;
  // Dilution weighs on the price.
  c.equity.sentiment *= 0.97;
  if (c.isPlayer)
    emit(state, 'info', `Issued ${n.toLocaleString()} new shares for $${Math.round(n * price).toLocaleString()}. Your stake is diluted to ${(founderStake(c) * 100).toFixed(1)}%.`, {
      concept: 'dilution',
    });
  return { ok: true };
}

/** Buy back shares from the public: returns cash to investors, raises the founders' stake. */
export function buyback(state: GameState, owner: number, n: number): { ok: boolean; reason?: string } {
  const c = state.companies[owner];
  const e = c.equity;
  n = Math.min(Math.round(n), e.holdings.public ?? 0);
  if (!e.listed || n <= 0) return { ok: false, reason: 'No public shares to buy back' };
  const cost = n * e.price * 1.03;
  if (c.cash < cost) return { ok: false, reason: 'Not enough cash' };
  c.cash -= cost;
  c.cashflow.financing -= cost;
  e.holdings.public -= n;
  e.shares -= n;
  return { ok: true };
}

/** Pay a dividend per share to all shareholders. */
export function payDividend(state: GameState, owner: number, perShare: number): { ok: boolean; reason?: string } {
  const c = state.companies[owner];
  const e = c.equity;
  const total = perShare * e.shares;
  if (perShare <= 0) return { ok: false, reason: 'Enter an amount' };
  if (c.cash < total) return { ok: false, reason: 'Not enough cash' };
  c.cash -= total;
  c.cashflow.financing -= total;
  for (const [holder, n] of Object.entries(e.holdings)) {
    const amount = n * perShare;
    if (holder === 'founder') c.founderWealth += amount;
    else if (holder.startsWith('c')) {
      const h = state.companies[Number(holder.slice(1))];
      h.cash += amount;
      h.cashflow.financing += amount;
    }
  }
  // Investors like a steady payout.
  if (e.listed) e.sentiment = Math.min(1.8, e.sentiment * 1.01);
  if (c.isPlayer)
    emit(state, 'info', `Paid a dividend of $${perShare.toFixed(2)} per share ($${Math.round(total).toLocaleString()}). Your founders' share: $${Math.round((e.holdings.founder ?? 0) * perShare).toLocaleString()}.`, {
      concept: 'dividend',
    });
  return { ok: true };
}

/** Price to buy `n` shares from the public float (big orders move the price). */
export function buyQuote(target: Company, n: number): number {
  const float = Math.max(1, target.equity.holdings.public ?? 0);
  return target.equity.price * (1 + 0.15 * (n / float));
}

/** Company `buyer` buys `n` shares of `target` from public investors. */
export function buyShares(sim: Sim, buyer: number, target: number, n: number): { ok: boolean; reason?: string } {
  const { state } = sim;
  const b = state.companies[buyer];
  const t = state.companies[target];
  if (!t.equity.listed || buyer === target) return { ok: false, reason: 'Not listed' };
  n = Math.min(Math.round(n), t.equity.holdings.public ?? 0);
  if (n <= 0) return { ok: false, reason: 'No shares available on the market' };
  const price = buyQuote(t, n);
  const cost = n * price;
  if (b.cash < cost) return { ok: false, reason: 'Not enough cash' };
  b.cash -= cost;
  b.cashflow.investing -= cost;
  t.equity.holdings.public -= n;
  t.equity.holdings[key(buyer)] = (t.equity.holdings[key(buyer)] ?? 0) + n;
  t.equity.sentiment = Math.min(1.8, t.equity.sentiment * (1 + 0.1 * (n / t.equity.shares)));
  checkControl(sim, target);
  return { ok: true };
}

export function sellShares(sim: Sim, seller: number, target: number, n: number): { ok: boolean; reason?: string } {
  const { state } = sim;
  const s = state.companies[seller];
  const t = state.companies[target];
  const held = t.equity.holdings[key(seller)] ?? 0;
  n = Math.min(Math.round(n), held);
  if (n <= 0) return { ok: false, reason: 'You hold no shares' };
  const price = t.equity.price * (1 - 0.1 * (n / t.equity.shares));
  s.cash += n * price;
  s.cashflow.investing += n * price;
  t.equity.holdings[key(seller)] = held - n;
  t.equity.holdings.public = (t.equity.holdings.public ?? 0) + n;
  return { ok: true };
}

/**
 * Tender offer: offer the founders of a listed rival a premium for their
 * shares. They accept if the premium is at least 25%.
 */
export function tenderOffer(sim: Sim, buyer: number, target: number, n: number, premium: number): { ok: boolean; reason?: string } {
  const { state } = sim;
  const b = state.companies[buyer];
  const t = state.companies[target];
  if (!t.equity.listed) return { ok: false, reason: 'Only listed companies can be bought' };
  if (premium < 0.25) return { ok: false, reason: 'The founders reject offers below a 25% premium' };
  n = Math.min(Math.round(n), t.equity.holdings.founder ?? 0);
  if (n <= 0) return { ok: false, reason: 'The founders have no shares left' };
  const cost = n * t.equity.price * (1 + premium);
  if (b.cash < cost) return { ok: false, reason: 'Not enough cash' };
  b.cash -= cost;
  b.cashflow.investing -= cost;
  t.equity.holdings.founder -= n;
  t.founderWealth += cost;
  t.equity.holdings[key(buyer)] = (t.equity.holdings[key(buyer)] ?? 0) + n;
  checkControl(sim, target);
  return { ok: true };
}

/** If any company holds more than half the shares, it takes the target over. */
export function checkControl(sim: Sim, target: number): void {
  const { state } = sim;
  const t = state.companies[target];
  for (const [holder, n] of Object.entries(t.equity.holdings)) {
    if (!holder.startsWith('c') || n / t.equity.shares <= 0.5) continue;
    takeover(sim, Number(holder.slice(1)), target);
    return;
  }
}

function takeover(sim: Sim, buyerId: number, targetId: number): void {
  const { state } = sim;
  const buyer = state.companies[buyerId];
  const t = state.companies[targetId];
  // Squeeze out the remaining shareholders at the market price, paid from the target's cash first.
  const others = t.equity.shares - (t.equity.holdings[key(buyerId)] ?? 0);
  const payout = others * t.equity.price;
  t.cash -= payout;
  for (const b of state.buildings) if (b.owner === targetId) b.owner = buyerId;
  for (const l of state.lines) if (l.owner === targetId) l.owner = buyerId;
  for (const l of state.loans) if (l.owner === targetId) l.owner = buyerId;
  // Shares the target held in others pass to the buyer.
  for (const o of state.companies) {
    const h = o.equity.holdings[key(targetId)];
    if (h) {
      o.equity.holdings[key(buyerId)] = (o.equity.holdings[key(buyerId)] ?? 0) + h;
      delete o.equity.holdings[key(targetId)];
    }
  }
  buyer.cash += t.cash;
  buyer.cashflow.investing += t.cash;
  t.cash = 0;
  t.acquiredBy = buyerId;
  t.equity.listed = false;
  // Clean up: HQ of the target is kept as a branch office.
  sim.occ.rebuild(state);
  if (targetId === 0) {
    state.gameOver = { reason: `${buyer.name} bought a majority of your shares and took over your company.`, day: state.day };
  } else {
    emit(state, buyerId === 0 ? 'good' : 'info', `${buyer.name} has taken over ${t.name}! All its plants, vehicles and debts now belong to ${buyerId === 0 ? 'you' : buyer.name}.`, {
      concept: 'takeover',
    });
  }
}

/**
 * Monthly governance: if the founders no longer hold a majority and the
 * company loses money, the board may vote the CEO out.
 */
export function governance(sim: Sim): void {
  const { state } = sim;
  const me = state.companies[0];
  if (!me.equity.listed || state.gameOver) return;
  const fs = founderStake(me);
  const n = Math.min(6, me.history.length);
  const recent = n ? netProfit(trailing(me, n)) : 0;
  if (fs < 0.5 && recent < 0) {
    if (sim.rng.chance(0.2)) {
      state.gameOver = {
        reason: `You own only ${(fs * 100).toFixed(0)}% of your company and it has been losing money. The board voted you out as CEO.`,
        day: state.day,
      };
    } else
      emit(state, 'bad', `Shareholders are restless: you own only ${(fs * 100).toFixed(0)}% and the company is losing money. The board may replace you.`, {
        concept: 'corporate-control',
      });
  }
}
