import type { DepositSeed } from './world/types';

export const SAVE_VERSION = 3;

export const LEDGER_CATS = [
  'sales',
  'materials',
  'wages',
  'transport',
  'maintenance',
  'training',
  'depreciation',
  'interest',
  'tax',
] as const;
export type LedgerCat = (typeof LEDGER_CATS)[number];
export type Ledger = Record<LedgerCat, number>;

export interface CashFlow {
  operating: number;
  investing: number;
  financing: number;
}

export interface MonthRecord {
  /** Day at which the month closed. */
  day: number;
  ledger: Ledger;
  cashflow: CashFlow;
  cash: number;
  value: number;
}

export interface Company {
  id: number;
  name: string;
  color: string;
  isPlayer: boolean;
  cash: number;
  /** Current (open) month. */
  month: Ledger;
  cashflow: CashFlow;
  history: MonthRecord[];
  negativeDays: number;
  bankrupt: boolean;
  hq: { x: number; y: number } | null;
}

export interface BuildingStats {
  revenue: number;
  costs: number;
  produced: number;
}

export interface Building {
  id: number;
  type: string;
  owner: number;
  /** Top-left cell of the footprint. */
  x: number;
  y: number;
  level: number;
  /** Construction days remaining (0 = operating). */
  buildLeft: number;
  workers: number;
  targetWorkers: number;
  wage: number;
  /** 0..1 average training level of the workforce. */
  skill: number;
  trainingLeft: number;
  /** Town that supplies this building's workers (-1 = none in range). */
  town: number;
  storage: Record<string, number>;
  /** Minimum price per output good below which it is held in storage. */
  sellMin: Record<string, number>;
  /** Buy missing inputs from the local market. */
  buyInputs: boolean;
  /** Total capital spent (construction + upgrades), the depreciation base. */
  invested: number;
  bookValue: number;
  siteFactor: number;
  /** Output in the last day (tons). */
  rate: number;
  /** Why production is limited (for the UI). */
  status: string;
  month: BuildingStats;
  last: BuildingStats;
}

export interface MarketState {
  stock: number;
  price: number;
  /** Tons consumed yesterday. */
  consumed: number;
  /** Tons supplied by the outside world yesterday. */
  outside: number;
  /** Deliveries this month by company id, and by the outside world. */
  soldMonth: Record<number, number>;
  outsideMonth: number;
  /** Market share snapshot of the previous month (company id -> share). */
  share: Record<number, number>;
  /** Weekly price history. */
  history: number[];
}

export interface Town {
  id: number;
  name: string;
  x: number;
  y: number;
  population: number;
  /** Relative income level (1 = average). */
  wealth: number;
  coastal: boolean;
  workforce: number;
  unemployed: number;
  /** Market wage for a worker per day. */
  wage: number;
  market: Record<string, MarketState>;
}

export interface Endpoint {
  kind: 'building' | 'town';
  id: number;
}

export interface Vehicle {
  /** Distance travelled along the path from the line's start (km). */
  pos: number;
  /** +1 heading to the destination, -1 heading back. */
  dir: 1 | -1;
  cargo: number;
  /** Paid for the current cargo (when bought in a town), for per-line accounting. */
  cargoCost: number;
  idle: boolean;
}

/** A transport line: vehicles shuttle one good from `from` to `to`. */
export interface Line {
  id: number;
  owner: number;
  vehicle: string;
  from: Endpoint;
  to: Endpoint;
  good: string;
  /** Road cells from the source access point to the destination. */
  path: number[];
  length: number;
  vehicles: Vehicle[];
  invested: number;
  bookValue: number;
  status: string;
  month: LineStats;
  last: LineStats;
}

export interface LineStats {
  revenue: number;
  costs: number;
  delivered: number;
}

export type EventKind = 'info' | 'good' | 'bad';

export interface GameEvent {
  day: number;
  kind: EventKind;
  text: string;
  /** Optional economics concept this event illustrates (learning layer). */
  concept?: string;
  at?: { x: number; y: number };
}

/**
 * The complete, JSON-serializable game state. Static terrain is regenerated
 * from `seed`; everything that can change during play lives here.
 */
export interface GameState {
  version: number;
  seed: number;
  /** Days elapsed since the start date. */
  day: number;
  rng: number;
  nextId: number;
  companies: Company[];
  buildings: Building[];
  towns: Town[];
  /** Road cells (shared infrastructure). */
  roads: number[];
  lines: Line[];
  deposits: DepositSeed[];
  /** Terrain height overrides (vertex index -> height): flattened pads, mine pits. */
  terrainEdits: Record<number, number>;
  /** Price level index (1 = start). */
  priceLevel: number;
  /** Events produced since the UI last drained them (not essential to save). */
  events: GameEvent[];
  /** Log of recent notable events (kept short). */
  log: GameEvent[];
  gameOver: null | { reason: string; day: number };
}

export const PLAYER = 0;

export const emptyLedger = (): Ledger =>
  Object.fromEntries(LEDGER_CATS.map((c) => [c, 0])) as Ledger;

export const emptyStats = (): BuildingStats => ({ revenue: 0, costs: 0, produced: 0 });
export const emptyLineStats = (): LineStats => ({ revenue: 0, costs: 0, delivered: 0 });
