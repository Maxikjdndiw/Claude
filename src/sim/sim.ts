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
      if (updateTowns(s)) {
        this.occ.rebuild(s);
        this.townsDirty = true;
      }
    }
    s.rng = this.rng.state;
  }
}
