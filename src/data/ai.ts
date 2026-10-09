import type { Category } from './buildings';

export type Personality = 'aggressive' | 'cautious' | 'specialist';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface PersonalityDef {
  name: string;
  description: string;
  /** Minimum expected annual return on investment before building. */
  minRoi: number;
  /** Wage premium over the market wage (to win workers). */
  wagePremium: number;
  /** Cash kept in reserve as a share of start cash. */
  reserve: number;
  /** Months of losses tolerated before closing a building. */
  patience: number;
  /** Probability of researching when idle cash allows. */
  researchAppetite: number;
}

export const PERSONALITIES: Record<Personality, PersonalityDef> = {
  aggressive: {
    name: 'Aggressive',
    description: 'Expands fast, enters any profitable market, pays above market wages.',
    minRoi: 0.22,
    wagePremium: 0.08,
    reserve: 0.05,
    patience: 8,
    researchAppetite: 0.5,
  },
  cautious: {
    name: 'Cautious',
    description: 'Only invests in clearly profitable projects and keeps a cash buffer.',
    minRoi: 0.3,
    wagePremium: 0,
    reserve: 0.3,
    patience: 3,
    researchAppetite: 0.2,
  },
  specialist: {
    name: 'Specialist',
    description: 'Focuses on one industry and dominates it.',
    minRoi: 0.25,
    wagePremium: 0.04,
    reserve: 0.15,
    patience: 6,
    researchAppetite: 0.4,
  },
};

export interface DifficultyDef {
  name: string;
  bots: number;
  /** Bot starting cash relative to the player's. */
  cash: number;
  /** Days between bot decisions. */
  thinkDays: number;
  /** Noise in the bots' profit estimates (worse decisions when high). */
  noise: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { name: 'Easy', bots: 2, cash: 0.7, thinkDays: 30, noise: 0.45 },
  normal: { name: 'Normal', bots: 3, cash: 1.0, thinkDays: 15, noise: 0.2 },
  hard: { name: 'Hard', bots: 4, cash: 1.6, thinkDays: 7, noise: 0.05 },
};

export const BOT_COLORS = ['#d0542a', '#6f4fb5', '#c98500', '#2e7d32', '#2a78d6'];

export const SPECIALTIES: Category[] = ['food', 'forestry', 'mining', 'industry'];
