import type { Difficulty } from './ai';

/**
 * Scenario challenges. Goals are checked monthly. Add scenarios here; goal
 * kinds are evaluated in sim/goals.ts.
 */
export type Goal =
  | { kind: 'value'; amount: number }
  | { kind: 'survive' }
  | { kind: 'share'; good: string; share: number; months: number }
  | { kind: 'ipoFirst' }
  | { kind: 'cash'; amount: number };

export interface ScenarioDef {
  id: string;
  title: string;
  icon: string;
  description: string;
  seed: string;
  difficulty: Difficulty;
  years: number;
  goals: Goal[];
  startCash?: number;
  /** Optional debt at the start. */
  startLoan?: number;
  /** Force a recession from this day for a number of days. */
  recession?: { day: number; days: number };
  /** Technologies known from the start. */
  techs?: string[];
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'bread',
    title: 'Daily Bread',
    icon: '🍞',
    description: 'An easy start: become the leading bread maker. Supply 35% of all bread sold on the island within 5 years.',
    seed: '42',
    difficulty: 'easy',
    years: 5,
    goals: [{ kind: 'share', good: 'bread', share: 0.35, months: 3 }],
  },
  {
    id: 'million',
    title: 'The First Million',
    icon: '💰',
    description: 'Grow your company to a value of $1,000,000 within 10 years.',
    seed: 'harbor',
    difficulty: 'normal',
    years: 10,
    goals: [{ kind: 'value', amount: 1_000_000 }],
  },
  {
    id: 'storm',
    title: 'Weather the Storm',
    icon: '🌧',
    description:
      'You start with a loan, and economists warn of a deep recession in your second year. Survive 5 years without going bankrupt and end with a company worth at least $400,000.',
    seed: 'valley',
    difficulty: 'normal',
    years: 5,
    startCash: 220_000,
    startLoan: 120_000,
    recession: { day: 420, days: 540 },
    goals: [{ kind: 'survive' }, { kind: 'value', amount: 400_000 }],
  },
  {
    id: 'steel',
    title: 'Steel Baron',
    icon: '🔩',
    description:
      'Become the main steel supplier of the region: hold at least 50% of all steel sales for 6 months in a row, within 12 years.',
    seed: '777',
    difficulty: 'normal',
    years: 12,
    startCash: 300_000,
    techs: ['mining_eng'],
    goals: [{ kind: 'share', good: 'steel', share: 0.5, months: 6 }],
  },
  {
    id: 'ipo',
    title: 'Race to the Exchange',
    icon: '📊',
    description: 'Ambitious rivals plan to go public. Be the first company on the island to list its shares, within 8 years.',
    seed: '2024',
    difficulty: 'hard',
    years: 8,
    goals: [{ kind: 'ipoFirst' }],
  },
];

export const SCENARIO: Record<string, ScenarioDef> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
