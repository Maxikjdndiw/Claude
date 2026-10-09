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

/** Simulation context: static world + mutable state + derived caches. */
export class Sim {
  readonly occ: Occupancy;
  readonly rng: SimRng;
  /** Terrain regions changed since the renderer last looked (rendering hint). */
  terrainDirty: Rect[] = [];

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
    updateProduction(s);
    updateLocalLogistics(s);
    updateMarkets(s);
    updateFinance(s);
    s.day++;
    if (isMonthStart(s.day)) {
      closeMonth(s);
      closeMarketMonth(s);
    }
    s.rng = this.rng.state;
  }
}
