import type { DepositSeed } from './world/types';

export const SAVE_VERSION = 1;

/**
 * The complete, JSON-serializable game state. Static terrain is regenerated
 * from `seed`; everything that can change during play lives here.
 */
export interface GameState {
  version: number;
  seed: number;
  companyName: string;
  /** Days elapsed since the start date. */
  day: number;
  rng: number;
  hq: { x: number; y: number } | null;
  deposits: DepositSeed[];
}

export function createState(seed: number, companyName: string, deposits: DepositSeed[]): GameState {
  return {
    version: SAVE_VERSION,
    seed,
    companyName,
    day: 0,
    rng: (seed ^ 0x9e3779b9) >>> 0,
    hq: null,
    deposits: deposits.map((d) => ({ ...d })),
  };
}
