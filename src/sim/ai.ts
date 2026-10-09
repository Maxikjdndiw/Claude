import { BOT_COLORS, DIFFICULTIES, PERSONALITIES, SPECIALTIES, type Personality } from '../data/ai';
import { BIOMES, BIOME_IDS } from '../data/biomes';
import { BUILDING, BUILDINGS } from '../data/buildings';
import { ECON } from '../data/economy';
import { GOOD } from '../data/goods';
import { COMPANY_NAMES } from '../data/names';
import { TECHS } from '../data/techs';
import * as cmd from './commands';
import { emit, learn } from './events';
import { debtOf, fundamentalValue, netProfit } from './finance';
import { creditLimit, repayLoan, takeLoan } from './bank';
import { buyQuote, buyShares, ipo, ipoCheck, listed } from './stocks';
import { marketWage } from './labor';
import { center, distance, localTowns } from './logistics';
import { baseDemand } from './market';
import { marginalProduct, maxWorkers } from './production';
import { buildRoad, townAccess } from './roads';
import { newCompany } from './company';
import type { Sim } from './sim';
import type { Building, Company, GameState, Town } from './state';
import { canBuildType, researchable, startResearch, techOutput } from './tech';
import { addVehicle, createLine, estimateLine, removeVehicle } from './transport';

/**
 * Computer-controlled competitors. They use exactly the same commands as the
 * player and react to the same price signals: a market with high prices
 * (high margins) attracts entry, which adds supply and pushes prices down.
 */

const rnd = (sim: Sim) => sim.rng.next();

/** Create the bot companies and place their headquarters away from the player. */
export function spawnBots(sim: Sim): void {
  const { state } = sim;
  const diff = DIFFICULTIES[state.settings.difficulty];
  const names = [...COMPANY_NAMES];
  const personalities: Personality[] = ['aggressive', 'cautious', 'specialist', 'aggressive', 'specialist'];
  for (let i = 0; i < state.settings.bots; i++) {
    const id = state.companies.length;
    const name = names.splice(Math.floor(rnd(sim) * names.length), 1)[0];
    const c = newCompany(id, name, BOT_COLORS[i % BOT_COLORS.length], false, Math.round(ECON.startCash * diff.cash));
    const personality = personalities[i % personalities.length];
    c.ai = {
      personality,
      specialty: personality === 'specialist' ? SPECIALTIES[Math.floor(rnd(sim) * SPECIALTIES.length)] : undefined,
      nextThink: 3 + i * 4,
      losses: {},
    };
    state.companies.push(c);
    const site = chooseHqSite(sim, c);
    if (site) {
      cmd.foundCompany(sim, id, site.x, site.y);
    }
  }
}

function chooseHqSite(sim: Sim, c: Company): { x: number; y: number } | null {
  const { world, state } = sim;
  const anchors = state.companies.filter((o) => o.hq && o.id !== c.id).map((o) => o.hq!);
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 400; i++) {
    const x = 4 + Math.floor(rnd(sim) * (world.size - 8));
    const y = 4 + Math.floor(rnd(sim) * (world.size - 8));
    const b = BIOMES[BIOME_IDS[world.biome[y * world.size + x]]];
    if (!b.buildable || sim.occ.at(x, y) !== 0) continue;
    const near = state.towns.map((t) => Math.hypot(t.x - x, t.y - y)).sort((a, z) => a - z)[0];
    if (near < 6 || near > 18) continue;
    const minAnchor = Math.min(...anchors.map((a) => Math.hypot(a.x - x, a.y - y)), 999);
    if (minAnchor < 22) continue;
    const town = state.towns.reduce((a, t) => (Math.hypot(t.x - x, t.y - y) < Math.hypot(a.x - x, a.y - y) ? t : a));
    const score = Math.log(town.population) * 1.5 - near * 0.05 + world.fertility[y * world.size + x] + rnd(sim) * 0.8;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

// ------------------------------------------------------------------ estimates

export interface Estimate {
  type: string;
  x: number;
  y: number;
  cost: number;
  /** Expected daily profit. */
  profit: number;
  roi: number;
  town: Town | null;
}

/**
 * Expected daily profit of building `type` at (x, y), including the price
 * drop our own extra supply will cause (linearized supply & demand).
 */
export function estimateProject(sim: Sim, owner: number, type: string, x: number, y: number): Estimate | null {
  const chk = cmd.checkPlacement(sim, owner, type, x, y);
  if (!chk.ok || chk.laborTown < 0) return null;
  const { state } = sim;
  const def = BUILDING[type];
  if (!def.recipe) return null;
  const fake = { type, owner, level: 1, siteFactor: chk.siteFactor } as Building;
  const out = def.baseRate * chk.siteFactor * techOutput(state, fake);
  if (out <= 0.05) return null;
  const good = Object.keys(def.recipe.outputs)[0];
  const g = GOOD[good];
  const c = { x: x + def.footprint[0] / 2, y: y + def.footprint[1] / 2 };
  // Our own existing output of this good already weighs on prices.
  const own = state.buildings
    .filter((b) => b.owner === owner && BUILDING[b.type].recipe?.outputs[good])
    .reduce((a, b) => a + Math.max(b.rate, BUILDING[b.type].baseRate * 0.6), 0);
  // Where would we sell? Compare every town in reach: local delivery or by truck.
  let town: Town | null = null;
  let price = -Infinity;
  for (const t of state.towns) {
    const dist = distance(c, t);
    const local = dist <= ECON.localRange;
    if (!local && dist > 45) continue;
    const transport = local ? dist * ECON.localHaulCost : estimateLine(dist * 1.35, 'truck', state, owner).costPerTon;
    const d0 = Math.max(0.01, baseDemand(t, good));
    const impact = Math.max(ECON.priceFloor, 1 - (out + own * 0.5) / (d0 * (g.elasticity + g.supplyElasticity)));
    const net = t.market[good].price * impact - transport;
    if (net > price) {
      price = net;
      town = t;
    }
  }
  if (!town) return null;
  // Inputs bought locally get dearer the more we buy (demand pushes the price up).
  let inputs = 0;
  const buyTown = chk.localTown >= 0 ? state.towns[chk.localTown] : town;
  for (const [ig, per] of Object.entries(def.recipe.inputs)) {
    const q = per * out;
    const gi = GOOD[ig];
    const d0 = Math.max(0.01, baseDemand(buyTown, ig));
    const impact = Math.min(ECON.priceCeiling, 1 + q / (d0 * (gi.elasticity + gi.supplyElasticity)));
    inputs += q * buyTown.market[ig].price * impact * 1.03;
  }
  const wages = def.refWorkers * marketWage(state, state.towns[chk.laborTown]);
  const fixed = def.maintenance + chk.cost / (def.lifeYears * 365);
  const profit = out * price - inputs - wages - fixed;
  return { type, x, y, cost: chk.cost, profit, roi: (profit * 365) / chk.cost, town };
}

// ------------------------------------------------------------------ the bot's turn

export function updateBots(sim: Sim): void {
  const { state } = sim;
  const diff = DIFFICULTIES[state.settings.difficulty];
  for (const c of state.companies) {
    if (!c.ai || c.bankrupt || c.acquiredBy !== undefined) continue;
    if (state.day < c.ai.nextThink) continue;
    c.ai.nextThink = state.day + diff.thinkDays + Math.floor(rnd(sim) * 4);
    manageBuildings(sim, c);
    considerResearch(sim, c);
    considerExpansion(sim, c);
  }
}

/** Hire up to where the marginal worker still pays for himself; pay a competitive wage. */
function manageBuildings(sim: Sim, c: Company): void {
  const { state } = sim;
  const p = PERSONALITIES[c.ai!.personality];
  for (const b of state.buildings) {
    if (b.owner !== c.id || b.buildLeft > 0) continue;
    const def = BUILDING[b.type];
    if (!def.recipe || b.town < 0) continue;
    const town = state.towns[b.town];
    b.wage = Math.round(marketWage(state, town) * (1 + p.wagePremium) * 10) / 10;
    const good = Object.keys(def.recipe.outputs)[0];
    const local = localTowns(state, b)[0];
    const line = state.lines.find((l) => l.from.kind === 'building' && l.from.id === b.id);
    // What a ton is really worth at the factory gate: market price minus delivery cost.
    let price = 0;
    if (local) price = local.town.market[good].price - local.dist * ECON.localHaulCost;
    else if (line && line.to.kind === 'town')
      price = state.towns[line.to.id].market[good].price - estimateLine(line.length, line.vehicle, state, c.id).costPerTon;
    price *= 0.95;
    let inputCost = 0;
    for (const [ig, per] of Object.entries(def.recipe.inputs))
      inputCost += per * (local ? local.town.market[ig].price : GOOD[ig].basePrice * state.priceLevel);
    const net = price - inputCost;
    // Size the truck fleet to the output.
    if (line) {
      const stored = b.storage[good] ?? 0;
      const cap = BUILDING[b.type].storage;
      if (stored > cap * 0.5 && line.vehicles.length < 12 && c.cash > 40000) addVehicle(sim, c.id, line.id);
      else if (stored < 1 && line.status === 'Waiting for cargo' && line.vehicles.length > 1) removeVehicle(sim, c.id, line.id);
    }
    // Marginal product of labor x net price >= wage (the textbook hiring rule).
    let n = 1;
    const max = maxWorkers(b);
    while (n < max && marginalProduct(state, b, n) * net > b.wage) n++;
    b.targetWorkers = net > 0 ? n : Math.max(1, Math.floor(b.targetWorkers / 2));
  }
}

function considerResearch(sim: Sim, c: Company): void {
  const { state } = sim;
  const p = PERSONALITIES[c.ai!.personality];
  if (c.research || c.cash < ECON.startCash * 0.8 || rnd(sim) > p.researchAppetite) return;
  const options = TECHS.filter((t) => researchable(c, t.id) && t.cost * 2 < c.cash);
  if (!options.length) return;
  startResearch(state, c.id, options[Math.floor(rnd(sim) * options.length)].id);
}

function considerExpansion(sim: Sim, c: Company): void {
  const { state, world } = sim;
  const ai = c.ai!;
  const p = PERSONALITIES[ai.personality];
  const diff = DIFFICULTIES[state.settings.difficulty];
  // Keep working capital for wages and inputs until the new plant pays off.
  const reserve = Math.max(30000, ECON.startCash * p.reserve) * state.priceLevel;
  if (c.cash < reserve + 20000) return;
  const anchors = state.buildings.filter((b) => b.owner === c.id).map(center);
  if (!anchors.length) return;
  const types = BUILDINGS.filter(
    (d) =>
      d.recipe &&
      canBuildType(c, d.id) &&
      d.cost * state.priceLevel < c.cash - reserve &&
      (ai.personality !== 'specialist' || d.category === ai.specialty || rnd(sim) < 0.3),
  ).map((d) => d.id);
  if (!types.length) return;
  let best: Estimate | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 70; i++) {
    const a = anchors[Math.floor(rnd(sim) * anchors.length)];
    const ang = rnd(sim) * Math.PI * 2;
    const r = 3 + rnd(sim) * (ECON.buildRange - 3);
    const x = Math.round(a.x + Math.cos(ang) * r);
    const y = Math.round(a.y + Math.sin(ang) * r);
    if (x < 2 || y < 2 || x >= world.size - 4 || y >= world.size - 4) continue;
    const type = types[Math.floor(rnd(sim) * types.length)];
    const e = estimateProject(sim, c.id, type, x, y);
    if (!e) continue;
    const bias = ai.personality === 'specialist' && BUILDING[type].category === ai.specialty ? 0.1 : 0;
    const score = e.roi * (1 + (rnd(sim) - 0.5) * 2 * diff.noise) + bias;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (!best || bestScore < p.minRoi) return;
  const res = cmd.build(sim, c.id, best.type, best.x, best.y);
  if (!res.ok || !res.building) return;
  const b = res.building;
  const def = BUILDING[best.type];
  const outGood = Object.keys(def.recipe!.outputs)[0];
  if (best.town && (best.town.market[outGood].share[0] ?? 0) > 0.05)
    learn(
      state,
      'competition',
      `${c.name} is building a ${def.name} to sell ${GOOD[outGood].name.toLowerCase()} in ${best.town.name}, where you already have ${Math.round((best.town.market[outGood].share[0] ?? 0) * 100)}% of the market. More supply will push the price down for both of you.`,
    );
  emit(state, 'info', `${c.name} is building a ${def.name} near ${best.town?.name ?? 'the wilds'}.`, {
    concept: best.town && best.town.market[Object.keys(def.recipe!.outputs)[0]].price > GOOD[Object.keys(def.recipe!.outputs)[0]].basePrice * 1.1 ? 'market-entry' : 'competition',
    at: { x: b.x, y: b.y },
  });
  // Far from any town: connect by road and ship by truck.
  if (best.town && localTowns(state, b).length === 0) {
    const access = townAccess(sim, best.town.id)[0];
    if (access !== undefined) {
      const from = b.y * world.size + b.x;
      buildRoad(sim, c.id, from, access);
      const good = Object.keys(def.recipe!.outputs)[0];
      const est = estimateLine(distance(center(b), best.town) * 1.35);
      const trucks = Math.max(1, Math.ceil((def.baseRate * b.siteFactor) / est.tonsPerDayPerVehicle));
      createLine(sim, c.id, { kind: 'building', id: b.id }, { kind: 'town', id: best.town.id }, good, Math.min(trucks, 6));
    }
  }
}

/** Monthly: close persistently unprofitable buildings; handle bankrupt bots. */
export function botsMonthly(sim: Sim): void {
  const { state } = sim;
  for (const c of state.companies) {
    if (!c.ai || c.acquiredBy !== undefined) continue;
    if (c.bankrupt) {
      liquidate(sim, c);
      continue;
    }
    const p = PERSONALITIES[c.ai.personality];
    botFinance(sim, c);
    for (const b of state.buildings) {
      if (b.owner !== c.id || b.type === 'hq' || b.buildLeft > 0) continue;
      const profit = b.last.revenue - b.last.costs;
      c.ai.losses[b.id] = profit < 0 ? (c.ai.losses[b.id] ?? 0) + 1 : 0;
      if (c.ai.losses[b.id] > p.patience) {
        cmd.demolish(sim, c.id, b.id);
        delete c.ai.losses[b.id];
        emit(state, 'info', `${c.name} closed a loss-making ${BUILDING[b.type].name}. Firms exit markets where they cannot cover their costs.`, {
          concept: 'market-exit',
          at: { x: b.x, y: b.y },
        });
      }
    }
  }
}

function liquidate(sim: Sim, c: Company): void {
  const { state } = sim;
  if (!state.buildings.some((b) => b.owner === c.id) && !state.lines.some((l) => l.owner === c.id)) return;
  for (const b of state.buildings.filter((x) => x.owner === c.id)) {
    if (b.town >= 0) state.towns[b.town].unemployed += b.workers;
    sim.occ.clear(b.id);
  }
  state.buildings = state.buildings.filter((b) => b.owner !== c.id);
  state.lines = state.lines.filter((l) => l.owner !== c.id);
  emit(state, 'good', `${c.name} has gone bankrupt and closed down. Its customers and workers are up for grabs.`, {
    concept: 'bankruptcy',
  });
}

/** Summary numbers for the competitor panel. */
export function companySummary(state: GameState, c: Company) {
  const last = c.history[c.history.length - 1];
  return {
    buildings: state.buildings.filter((b) => b.owner === c.id && b.type !== 'hq').length,
    workers: state.buildings.filter((b) => b.owner === c.id).reduce((a, b) => a + b.workers, 0),
    profit: last ? netProfit(last.ledger) : 0,
  };
}

/**
 * Market share per company for a good across all towns (last month's
 * deliveries). Key -1 is the outside world (imports / unmodeled producers).
 */
export function marketShares(state: GameState, good: string): Map<number, number> {
  const tons = new Map<number, number>();
  let total = 0;
  for (const t of state.towns) {
    const m = t.market[good];
    const volume = m.consumed * 30;
    let inside = 0;
    for (const [k, sh] of Object.entries(m.share)) {
      tons.set(Number(k), (tons.get(Number(k)) ?? 0) + sh * volume);
      inside += sh;
    }
    tons.set(-1, (tons.get(-1) ?? 0) + Math.max(0, 1 - inside) * volume);
    total += volume;
  }
  const out = new Map<number, number>();
  for (const [k, v] of tons) out.set(k, total > 0 ? v / total : 0);
  return out;
}

/** Bots borrow to expand, repay when flush, go public and buy into rivals. */
function botFinance(sim: Sim, c: Company): void {
  const { state } = sim;
  const ai = c.ai!;
  const last = c.history[c.history.length - 1];
  const profitable = last ? netProfit(last.ledger) > 0 : false;
  const debt = debtOf(state, c.id);
  // Borrow to fund growth (not the cautious ones).
  if (ai.personality !== 'cautious' && profitable && c.cash < 60000 * state.priceLevel && !debt) {
    const limit = creditLimit(state, c) * (ai.personality === 'aggressive' ? 0.5 : 0.25);
    if (limit > 20000) takeLoan(state, c.id, limit, 60, ai.personality === 'aggressive');
  }
  // Pay debt down when cash piles up.
  if (debt > 0 && c.cash > 300000 * state.priceLevel) {
    for (const l of state.loans.filter((x) => x.owner === c.id)) repayLoan(state, c.id, l.id);
  }
  // Go public once big enough.
  if (!c.equity.listed && ipoCheck(state, c).ok && (ai.personality !== 'cautious' || rnd(sim) < 0.2)) {
    ipo(state, c.id, ai.personality === 'aggressive' ? 0.45 : 0.3);
  }
  // Invest spare cash in undervalued listed rivals.
  if (c.cash > 400000 * state.priceLevel) {
    for (const t of listed(state)) {
      if (t.id === c.id) continue;
      const fair = fundamentalValue(state, t) / t.equity.shares;
      const cheap = t.equity.price < fair * (ai.personality === 'aggressive' ? 0.95 : 0.8);
      if (!cheap || rnd(sim) > 0.5) continue;
      const n = Math.min(t.equity.holdings.public ?? 0, Math.floor((c.cash * 0.2) / buyQuote(t, 1)), Math.floor(t.equity.shares * 0.04));
      if (n > 0) {
        buyShares(sim, c.id, t.id, n);
        if (t.isPlayer)
          emit(state, 'bad', `${c.name} bought ${((n / t.equity.shares) * 100).toFixed(1)}% of your shares. Watch out: whoever holds more than 50% controls your company.`, {
            concept: 'corporate-control',
          });
      }
    }
  }
}
