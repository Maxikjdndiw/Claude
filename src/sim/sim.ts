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
    updateLabor(s, this.rng);
    updateResearch(s);
    updateProduction(this);
    regrow(this);
    updateLocalLogistics(s);
    updateTransport(s);
    updateMarkets(s);
    updateFinance(s);
    s.day++;
    if (isMonthStart(s.day)) {
      closeMonth(s);
      closeMarketMonth(s);
      closeLinesMonth(s);
      if (updateTowns(s)) {
        this.occ.rebuild(s);
        this.townsDirty = true;
      }
    }
    s.rng = this.rng.state;
  }
}
