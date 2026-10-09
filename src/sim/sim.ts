import { Occupancy } from './grid';
import { SimRng } from './rng';
import type { GameState } from './state';
import type { World } from './world/types';
import { updateLabor } from './labor';
import { updateProduction } from './production';
import { updateLocalLogistics } from './logistics';
import { closeMarketMonth, updateMarkets } from './market';
import { closeMonth, updateFinance } from './finance';
import { isMonthStart } from './time';
import { applyTerrainEdits, type Rect } from './terrainEdit';
import { closeLinesMonth, updateTransport } from './transport';
import { updateTowns } from './towns';
import { updateResearch } from './tech';
import { regrow } from './resources';
import { botsMonthly, updateBots } from './ai';
import { updateMacroDaily, updateMacroMonthly } from './macro';
import { runEvents } from './eventsys';
import { serviceLoans } from './bank';
import { earningsReaction, governance, updateStocks } from './stocks';
import { detectConcepts } from './learning';
import { marketShares } from './ai';
import { GOODS } from '../data/goods';

/** Simulation context: static world + mutable state + derived caches. */
export class Sim {
  readonly occ: Occupancy;
  readonly rng: SimRng;
  /** Terrain regions changed since the renderer last looked (rendering hint). */
  terrainDirty: Rect[] = [];
  roadsDirty = true;
  forestDirty = true;
  depositsDirty = true;
  townsDirty = true;

  constructor(
    readonly world: World,
    readonly state: GameState,
  ) {
    applyTerrainEdits(world, state);
    this.occ = new Occupancy(world);
    this.occ.rebuild(state);
    this.rng = new SimRng(state.rng);
  }

  /** Advance the simulation by one day. Systems run in a fixed order. */
  step(): void {
    const s = this.state;
    if (s.gameOver) return;
    updateMacroDaily(s, this.rng);
    updateBots(this);
    updateLabor(s, this.rng);
    updateResearch(s);
    updateProduction(this);
    regrow(this);
    updateLocalLogistics(s);
    updateTransport(s);
    updateMarkets(s);
    updateFinance(s);
    updateStocks(s, this.rng);
    s.day++;
    if (isMonthStart(s.day)) {
      serviceLoans(s);
      closeMonth(s);
      closeMarketMonth(s);
      closeLinesMonth(s);
      updateMacroMonthly(s, this.rng);
      runEvents(this);
      earningsReaction(s);
      governance(this);
      botsMonthly(this);
      this.recordStats();
      if (updateTowns(s)) {
        this.occ.rebuild(s);
        this.townsDirty = true;
      }
    }
    if (s.day % 5 === 0) detectConcepts(this);
    s.rng = this.rng.state;
  }

  /** Monthly market share snapshot for charts. */
  private recordStats(): void {
    const s = this.state;
    const shares: Record<string, Record<number, number>> = {};
    for (const g of GOODS) {
      const sh = marketShares(s, g.id);
      const row: Record<number, number> = {};
      for (const [k, v] of sh) if (v > 0.001) row[k] = Math.round(v * 1000) / 1000;
      shares[g.id] = row;
    }
    s.stats.push({ day: s.day, shares });
    if (s.stats.length > 240) s.stats.shift();
  }
}
