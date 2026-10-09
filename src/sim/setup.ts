import { ECON } from '../data/economy';
import { GOODS } from '../data/goods';
import { newMarket } from './market';
import { marketWage } from './labor';
import { mulberry32 } from './rng';
import { SAVE_VERSION, type GameState, type Town } from './state';
import { newCompany } from './company';
import type { World } from './world/types';
import { Sim } from './sim';
import { generateCountryRoads } from './roads';
import { DIFFICULTIES, type Difficulty } from '../data/ai';
import { SCENARIO } from '../data/scenarios';

export const PLAYER_COLOR = '#008aa0';

/** Create a fresh game state for a generated world. */
export function createGame(world: World, companyName: string): GameState {
  const rng = mulberry32(world.seed ^ 0x51ed270b);
  const state: GameState = {
    version: SAVE_VERSION,
    seed: world.seed,
    day: 0,
    rng: (world.seed ^ 0x9e3779b9) >>> 0,
    nextId: 1,
    companies: [newCompany(0, companyName, PLAYER_COLOR, true, ECON.startCash)],
    buildings: [],
    towns: [],
    roads: [],
    lines: [],
    deposits: world.deposits.map((d) => ({ ...d, initial: d.amount })),
    rails: [],
    fields: { forest: {}, fish: {} },
    terrainEdits: {},
    priceLevel: 1,
    macro: { phase: 'normal', gap: 0, inflation: 0.02, baseRate: 0.04, history: [] },
    activeEvents: [],
    loans: [],
    events: [],
    log: [],
    gameOver: null,
    settings: { difficulty: 'normal', bots: 3 },
    learning: { seen: {}, queue: [] },
    achievements: [],
    flags: {},
    stats: [],
  };
  const maxPop = Math.max(...world.towns.map((t) => t.population));
  for (const site of world.towns) {
    const town: Town = {
      id: site.id,
      name: site.name,
      x: site.x,
      y: site.y,
      population: site.population,
      // Bigger towns are a bit richer; some randomness on top.
      wealth: 0.85 + 0.25 * (site.population / maxPop) + (rng() - 0.5) * 0.15,
      coastal: site.coastal,
      workforce: Math.round(site.population * ECON.laborShare),
      unemployed: Math.round(site.population * ECON.laborShare * ECON.naturalUnemployment),
      wage: 0,
      market: {},
    };
    for (const g of GOODS) town.market[g.id] = newMarket(state, town, g.id);
    town.wage = marketWage(state, town);
    state.towns.push(town);
  }
  return state;
}

/** Create the state and simulation for a new game, including country roads between towns. */
export function startNewGame(world: World, companyName: string, difficulty: Difficulty = 'normal'): Sim {
  const state = createGame(world, companyName);
  state.settings = { difficulty, bots: DIFFICULTIES[difficulty].bots };
  const sim = new Sim(world, state);
  generateCountryRoads(sim);
  sim.occ.rebuild(sim.state);
  return sim;
}

/** Apply a scenario's starting conditions to a new game. */
export function applyScenario(sim: Sim, id: string): void {
  const sc = SCENARIO[id];
  if (!sc) return;
  const s = sim.state;
  const me = s.companies[0];
  if (sc.startCash) me.cash = sc.startCash;
  if (sc.startLoan) {
    me.cash += sc.startLoan;
    s.loans.push({
      id: s.nextId++,
      owner: 0,
      principal: sc.startLoan,
      balance: sc.startLoan,
      rate: s.macro.baseRate + 0.03,
      variable: false,
      spread: 0.03,
      monthsLeft: 72,
      takenDay: 0,
    });
  }
  if (sc.techs) me.techs.push(...sc.techs);
  if (sc.recession) s.activeEvents.push({ id: 'recession', start: sc.recession.day, until: sc.recession.day + sc.recession.days });
  s.scenario = { id, deadline: sc.years * 365, streak: 0 };
}
