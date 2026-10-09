import type { BiomeId } from './biomes';

/**
 * Natural resources.
 * - "deposit" resources are discrete, finite clusters (ore, oil...). Some are hidden
 *   until the player surveys the area.
 * - "field" resources are continuous per-cell values derived from terrain
 *   (soil fertility, timber, fish stocks).
 */
export interface DepositResourceDef {
  id: string;
  name: string;
  kind: 'deposit';
  color: string;
  /** Relative likelihood of a cluster spawning on each biome. */
  biomes: Partial<Record<BiomeId, number>>;
  /** Clusters per 10,000 cells. */
  density: number;
  radius: [number, number];
  /** Tons in a cluster. */
  amount: [number, number];
  /** Probability a cluster is hidden until surveyed. */
  hiddenChance: number;
  description: string;
}

export interface FieldResourceDef {
  id: string;
  name: string;
  kind: 'field';
  color: string;
  description: string;
}

export type ResourceDef = DepositResourceDef | FieldResourceDef;

export const DEPOSITS: DepositResourceDef[] = [
  {
    id: 'iron',
    name: 'Iron ore',
    kind: 'deposit',
    color: '#c0674b',
    biomes: { mountain: 1, hills: 0.45 },
    density: 3.2,
    radius: [2, 4],
    amount: [6000, 16000],
    hiddenChance: 0.4,
    description: 'Found in mountains and rugged hills. Smelted with coal into steel.',
  },
  {
    id: 'coal',
    name: 'Coal',
    kind: 'deposit',
    color: '#3f3f46',
    biomes: { mountain: 0.8, hills: 0.7 },
    density: 3.2,
    radius: [2, 4],
    amount: [7000, 18000],
    hiddenChance: 0.4,
    description: 'Fuel for steelworks. Common in hills and mountain foothills.',
  },
  {
    id: 'stone',
    name: 'Stone',
    kind: 'deposit',
    color: '#9aa0a6',
    biomes: { mountain: 1, hills: 0.8 },
    density: 3,
    radius: [2, 4],
    amount: [12000, 30000],
    hiddenChance: 0.1,
    description: 'Quarried for construction. Plentiful in rocky terrain.',
  },
  {
    id: 'sand',
    name: 'Sand & gravel',
    kind: 'deposit',
    color: '#e3c27a',
    biomes: { beach: 1, plains: 0.12 },
    density: 3,
    radius: [2, 3],
    amount: [8000, 20000],
    hiddenChance: 0.05,
    description: 'Dredged from coasts and riverbanks. Used for glass and construction.',
  },
  {
    id: 'oil',
    name: 'Crude oil',
    kind: 'deposit',
    color: '#1f2937',
    biomes: { plains: 0.5, beach: 0.6, hills: 0.3, fertile: 0.3 },
    density: 0.9,
    radius: [2, 3],
    amount: [10000, 26000],
    hiddenChance: 0.85,
    description: 'Rare and valuable. Almost always hidden: survey to find it.',
  },
];

export const FIELDS: FieldResourceDef[] = [
  { id: 'fertility', name: 'Fertile soil', kind: 'field', color: '#7cb342', description: 'Best near rivers and lakes. Farms produce more on fertile land.' },
  { id: 'timber', name: 'Timber', kind: 'field', color: '#2e7d32', description: 'Forests provide wood. Trees regrow slowly after felling.' },
  { id: 'fish', name: 'Fish stocks', kind: 'field', color: '#0288d1', description: 'Coastal waters and lakes. Overfishing depletes stocks.' },
];

export const RESOURCES: Record<string, ResourceDef> = Object.fromEntries(
  [...DEPOSITS, ...FIELDS].map((r) => [r.id, r]),
);
