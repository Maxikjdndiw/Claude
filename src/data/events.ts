/**
 * Random economic events. Each has a monthly probability, an optional
 * condition, a duration and effects (modifiers the simulation applies while
 * the event lasts). Add new events here.
 */
export type EventEffect =
  | { kind: 'phase'; phase: 'boom' | 'recession' }
  | { kind: 'inflation'; add: number }
  | { kind: 'supply'; good: string; mult: number }
  | { kind: 'demand'; good: string; mult: number }
  | { kind: 'maintenance'; target: string; mult: number }
  | { kind: 'wageFloor'; mult: number }
  | { kind: 'discovery' }
  | { kind: 'disaster'; disaster: 'flood' | 'fire' | 'storm' };

export interface EventDef {
  id: string;
  title: string;
  /** Text shown in the news; {town} and {good} are filled in. */
  text: string;
  /** Probability per month. */
  chance: number;
  days: number;
  kind: 'good' | 'bad' | 'info';
  concept: string;
  effects: EventEffect[];
  /** Only one of these can be active at a time. */
  exclusive?: boolean;
  /** Earliest day it may happen (give the player a calm start). */
  minDay?: number;
}

export const EVENTS: EventDef[] = [
  {
    id: 'recession',
    title: 'Recession',
    text: 'A recession hits: consumers cut spending and luxury demand falls the most.',
    chance: 0.012,
    days: 360,
    kind: 'bad',
    concept: 'business-cycle',
    effects: [{ kind: 'phase', phase: 'recession' }],
    exclusive: true,
    minDay: 540,
  },
  {
    id: 'boom',
    title: 'Economic boom',
    text: 'The economy is booming: incomes rise and demand grows across the board.',
    chance: 0.012,
    days: 300,
    kind: 'good',
    concept: 'business-cycle',
    effects: [{ kind: 'phase', phase: 'boom' }],
    exclusive: true,
    minDay: 360,
  },
  {
    id: 'inflation_spike',
    title: 'Inflation spike',
    text: 'Prices are rising fast. Cash loses value; borrowers gain as debts shrink in real terms.',
    chance: 0.008,
    days: 240,
    kind: 'bad',
    concept: 'inflation',
    effects: [{ kind: 'inflation', add: 0.06 }],
    minDay: 400,
  },
  {
    id: 'oil_shock',
    title: 'Oil supply shock',
    text: 'Foreign oil supplies are disrupted. Fuel prices jump, and with them every transport bill.',
    chance: 0.008,
    days: 150,
    kind: 'bad',
    concept: 'supply-shock',
    effects: [
      { kind: 'supply', good: 'fuel', mult: 0.35 },
      { kind: 'supply', good: 'crude', mult: 0.4 },
      { kind: 'inflation', add: 0.02 },
    ],
    minDay: 300,
  },
  {
    id: 'harvest_failure',
    title: 'Poor harvest abroad',
    text: 'A drought abroad cut grain imports. Wheat and flour are scarce: good news for local farmers.',
    chance: 0.01,
    days: 150,
    kind: 'info',
    concept: 'supply-shock',
    effects: [
      { kind: 'supply', good: 'wheat', mult: 0.5 },
      { kind: 'supply', good: 'flour', mult: 0.7 },
    ],
    minDay: 200,
  },
  {
    id: 'building_boom',
    title: 'Construction boom',
    text: 'A wave of construction: demand for stone, planks and steel surges.',
    chance: 0.008,
    days: 240,
    kind: 'good',
    concept: 'demand-shock',
    effects: [
      { kind: 'demand', good: 'stone', mult: 1.6 },
      { kind: 'demand', good: 'planks', mult: 1.4 },
      { kind: 'demand', good: 'steel', mult: 1.3 },
    ],
    minDay: 200,
  },
  {
    id: 'furniture_fad',
    title: 'Interior design craze',
    text: 'Home makeovers are the new trend: furniture demand jumps.',
    chance: 0.008,
    days: 180,
    kind: 'good',
    concept: 'demand-shock',
    effects: [{ kind: 'demand', good: 'furniture', mult: 1.7 }],
    minDay: 200,
  },
  {
    id: 'emissions_tax',
    title: 'New emissions regulation',
    text: 'Parliament introduces an emissions levy: steel mills, refineries and coal mines face higher running costs.',
    chance: 0.006,
    days: 720,
    kind: 'bad',
    concept: 'regulation',
    effects: [
      { kind: 'maintenance', target: 'steel_mill', mult: 1.6 },
      { kind: 'maintenance', target: 'refinery', mult: 1.6 },
      { kind: 'maintenance', target: 'coal_mine', mult: 1.4 },
    ],
    minDay: 500,
  },
  {
    id: 'minimum_wage',
    title: 'Minimum wage raised',
    text: 'A new minimum wage law: nobody may be paid less than 115% of the old base wage.',
    chance: 0.005,
    days: 99999,
    kind: 'info',
    concept: 'minimum-wage',
    effects: [{ kind: 'wageFloor', mult: 1.15 }],
    minDay: 700,
  },
  {
    id: 'discovery',
    title: 'Resource discovery',
    text: 'Prospectors report a new deposit!',
    chance: 0.015,
    days: 1,
    kind: 'good',
    concept: 'exploration',
    effects: [{ kind: 'discovery' }],
    minDay: 120,
  },
  {
    id: 'flood',
    title: 'Flood',
    text: 'Heavy rain floods the river valley near {town}. Buildings on low ground stop working while repairs are made.',
    chance: 0.007,
    days: 25,
    kind: 'bad',
    concept: 'disaster',
    effects: [{ kind: 'disaster', disaster: 'flood' }],
    minDay: 240,
  },
  {
    id: 'fire',
    title: 'Forest fire',
    text: 'A forest fire burns near {town}. Forests are lost and nearby buildings are damaged.',
    chance: 0.006,
    days: 20,
    kind: 'bad',
    concept: 'disaster',
    effects: [{ kind: 'disaster', disaster: 'fire' }],
    minDay: 240,
  },
  {
    id: 'storm',
    title: 'Coastal storm',
    text: 'A storm batters the coast near {town}. Harbors and fisheries are damaged.',
    chance: 0.006,
    days: 15,
    kind: 'bad',
    concept: 'disaster',
    effects: [{ kind: 'disaster', disaster: 'storm' }],
    minDay: 240,
  },
];

export const EVENT: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
