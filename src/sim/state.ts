import type { DepositSeed } from './world/types';
import type { Difficulty, Personality } from '../data/ai';
import type { Category } from '../data/buildings';

export const SAVE_VERSION = 8;

export const LEDGER_CATS = [
  'sales',
  'materials',
  'wages',
  'transport',
  'maintenance',
  'training',
  'research',
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
  techs: string[];
  research: { tech: string; daysLeft: number } | null;
  /** Present for computer-controlled competitors. */
  ai?: AiState;
  equity: Equity;
  /** Dividends and sale proceeds received personally by the founders. */
  founderWealth: number;
  /** Set when another company took this one over. */
  acquiredBy?: number;
}

/** Shares and ownership. Holder keys: 'founder', 'public', or 'c<companyId>'. */
export interface Equity {
  shares: number;
  holdings: Record<string, number>;
  listed: boolean;
  price: number;
  /** Market mood multiplier on fundamental value (listed companies). */
  sentiment: number;
  /** Weekly share price history. */
  history: number[];
  ipoDay?: number;
}

export interface Loan {
  id: number;
  owner: number;
  principal: number;
  balance: number;
  /** Annual interest rate currently charged. */
  rate: number;
  /** Variable-rate loans follow the central bank rate plus the spread. */
  variable: boolean;
  spread: number;
  monthsLeft: number;
  takenDay: number;
}

export type Phase = 'boom' | 'normal' | 'recession';

export interface Macro {
  phase: Phase;
  /** Output gap: + boom, - recession (fraction of normal output). */
  gap: number;
  /** Annual inflation rate. */
  inflation: number;
  /** Central bank policy rate (annual). */
  baseRate: number;
  history: { day: number; gap: number; inflation: number; baseRate: number; phase: Phase; priceLevel: number }[];
}

export interface ActiveEvent {
  id: string;
  start: number;
  until: number;
  town?: number;
}

export interface AiState {
  personality: Personality;
  /** Industry a specialist focuses on. */
  specialty?: Category;
  nextThink: number;
  /** Consecutive loss-making months per building id. */
  losses: Record<number, number>;
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
  /** Day of the last 'workers quit' notice (avoids spamming the news). */
  quitNotice?: number;
  /** Out of action (disaster repairs) until this day. */
  disabledUntil?: number;
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

/** A deposit as tracked during play. */
export interface Deposit extends DepositSeed {
  /** Tons at discovery (amount is what remains). */
  initial: number;
  /** Terrain height of the pit rim, set when digging starts. */
  pitBase?: number;
  /** Current pit depth/radius (for rendering and terrain edits). */
  pitDepth?: number;
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
export type Mode = 'road' | 'rail' | 'sea';

export interface Line {
  id: number;
  owner: number;
  mode: Mode;
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
  /** Railway cells. */
  rails: number[];
  /** Renewable resources that changed from their initial value (cell -> value). */
  fields: { forest: Record<number, number>; fish: Record<number, number> };
  lines: Line[];
  deposits: Deposit[];
  /** Terrain height overrides (vertex index -> height): flattened pads, mine pits. */
  terrainEdits: Record<number, number>;
  /** Price level index (1 = start). */
  priceLevel: number;
  macro: Macro;
  activeEvents: ActiveEvent[];
  loans: Loan[];
  /** Events produced since the UI last drained them (not essential to save). */
  events: GameEvent[];
  /** Log of recent notable events (kept short). */
  log: GameEvent[];
  gameOver: null | { reason: string; day: number; won?: boolean };
  scenario?: { id: string; deadline: number; streak: number; result?: 'won' | 'lost' };
  achievements: string[];
  /** Flags used by achievement checks. */
  flags: Record<string, boolean>;
  settings: { difficulty: Difficulty; bots: number };
  /** Learning layer: concepts encountered (with the live example) and pending pop-ups. */
  learning: { seen: Record<string, { day: number; example: string }>; queue: { concept: string; example: string }[] };
  /** Monthly statistics for charts. */
  stats: { day: number; shares: Record<string, Record<number, number>> }[];
}

export const PLAYER = 0;

export const emptyLedger = (): Ledger =>
  Object.fromEntries(LEDGER_CATS.map((c) => [c, 0])) as Ledger;

export const emptyStats = (): BuildingStats => ({ revenue: 0, costs: 0, produced: 0 });
export const emptyLineStats = (): LineStats => ({ revenue: 0, costs: 0, delivered: 0 });
