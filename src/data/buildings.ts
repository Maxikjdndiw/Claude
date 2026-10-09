import type { Part } from '../render/meshkit';

/**
 * Building types. Production per day =
 *   baseRate * siteFactor * skillFactor * techFactor * (workers / refWorkers)^alpha
 * (capped by available inputs and storage). alpha < 1 gives diminishing
 * marginal returns to labor. Upgrading raises capacity more than fixed costs,
 * so average cost per unit falls: economies of scale.
 */
export interface Recipe {
  /** Input tons per ton of the first output. */
  inputs: Record<string, number>;
  /** Output goods (ratio per production unit). */
  outputs: Record<string, number>;
}

export type SiteKind = 'fertility' | 'forest' | 'fish' | 'deposit' | 'coast' | 'none';

export interface BuildingDef {
  id: string;
  name: string;
  category: 'hq' | 'farm' | 'industry' | 'extraction' | 'logistics';
  description: string;
  cost: number;
  buildDays: number;
  footprint: [number, number];
  /** Fixed cost per day (upkeep, insurance, rent). */
  maintenance: number;
  maxWorkers: number;
  refWorkers: number;
  alpha: number;
  recipe: Recipe | null;
  /** Production units per day at refWorkers with a perfect site. */
  baseRate: number;
  site: { kind: SiteKind; resource?: string; label: string };
  /** Storage capacity in tons (inputs + outputs). */
  storage: number;
  /** Useful life in years (straight-line depreciation). */
  lifeYears: number;
  maxLevel: number;
  model: Part[];
  /** Parts that spin around the Y axis (e.g. windmill blades), positioned relative to the pivot. */
  spinner?: { pivot: [number, number, number]; axis: 'x' | 'z'; parts: Part[] };
  /** Paint the footprint as fields in this color. */
  fields?: string;
  /** Not available in the build menu (e.g. HQ). */
  hidden?: boolean;
}

const roofRed = '#c7634f';
const wall = '#f3ece0';
const wood = '#a7774f';
const stone = '#c9c3b8';

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'hq',
    name: 'Headquarters',
    category: 'hq',
    description: 'Your company office. You can build within reach of your HQ and your other buildings.',
    cost: 0,
    buildDays: 0,
    footprint: [2, 2],
    maintenance: 15,
    maxWorkers: 0,
    refWorkers: 1,
    alpha: 1,
    recipe: null,
    baseRate: 0,
    site: { kind: 'none', label: '' },
    storage: 0,
    lifeYears: 40,
    maxLevel: 1,
    hidden: true,
    model: [
      { shape: 'box', color: '#e8eef2', size: [1.5, 1.4, 1.2] },
      { shape: 'box', color: '#8fb8c8', size: [1.52, 0.12, 1.22], pos: [0, 0.5, 0] },
      { shape: 'box', color: '#8fb8c8', size: [1.52, 0.12, 1.22], pos: [0, 0.95, 0] },
      { shape: 'box', color: '#2f7f8f', size: [1.58, 0.1, 1.28], pos: [0, 1.4, 0] },
      { shape: 'cyl', color: '#cfd8dc', size: [0.05, 0.6, 0.05], pos: [0.55, 1.5, 0.4], segments: 4 },
      { shape: 'box', color: '#3aa3a0', size: [0.3, 0.18, 0.02], pos: [0.7, 1.9, 0.4] },
    ],
  },
  {
    id: 'farm',
    name: 'Wheat Farm',
    category: 'farm',
    description: 'Grows wheat. Output depends on soil fertility: best near rivers and lakes.',
    cost: 36000,
    buildDays: 20,
    footprint: [3, 3],
    maintenance: 22,
    maxWorkers: 16,
    refWorkers: 8,
    alpha: 0.6,
    recipe: { inputs: {}, outputs: { wheat: 1 } },
    baseRate: 5.5,
    site: { kind: 'fertility', label: 'Soil fertility' },
    storage: 160,
    lifeYears: 25,
    maxLevel: 3,
    fields: '#e2c25e',
    model: [
      { shape: 'box', color: '#c45b46', size: [0.8, 0.5, 0.6], pos: [-0.9, 0, -0.9] },
      { shape: 'prism', color: '#8e4436', size: [0.86, 0.35, 0.66], pos: [-0.9, 0.5, -0.9] },
      { shape: 'cyl', color: '#dfe3e6', size: [0.36, 0.95, 0.36], pos: [-0.25, 0, -1.05], segments: 8 },
      { shape: 'cone', color: '#9aa6ad', size: [0.4, 0.2, 0.4], pos: [-0.25, 0.95, -1.05], segments: 8 },
    ],
  },
  {
    id: 'mill',
    name: 'Flour Mill',
    category: 'industry',
    description: 'Grinds wheat into flour (1.25 t wheat → 1 t flour). Adds value to raw grain.',
    cost: 52000,
    buildDays: 30,
    footprint: [2, 2],
    maintenance: 30,
    maxWorkers: 12,
    refWorkers: 5,
    alpha: 0.65,
    recipe: { inputs: { wheat: 1.25 }, outputs: { flour: 1 } },
    baseRate: 8,
    site: { kind: 'none', label: '' },
    storage: 200,
    lifeYears: 30,
    maxLevel: 3,
    model: [
      { shape: 'cyl', color: stone, size: [1.0, 1.5, 1.0], segments: 8 },
      { shape: 'cone', color: roofRed, size: [1.15, 0.6, 1.15], pos: [0, 1.5, 0], segments: 8 },
      { shape: 'box', color: wall, size: [0.7, 0.5, 0.6], pos: [0.7, 0, 0.3] },
      { shape: 'prism', color: roofRed, size: [0.74, 0.3, 0.64], pos: [0.7, 0.5, 0.3] },
    ],
    spinner: {
      pivot: [0, 1.45, 0.55],
      axis: 'z',
      parts: [
        { shape: 'box', color: wood, size: [0.12, 1.9, 0.04], pos: [0, -0.95, 0] },
        { shape: 'box', color: wood, size: [1.9, 0.12, 0.04], pos: [0, -0.06, 0] },
        { shape: 'box', color: '#f6f1e7', size: [0.3, 0.8, 0.02], pos: [0.13, 0.1, 0.02] },
        { shape: 'box', color: '#f6f1e7', size: [0.3, 0.8, 0.02], pos: [-0.13, -0.9, 0.02] },
        { shape: 'box', color: '#f6f1e7', size: [0.8, 0.3, 0.02], pos: [-0.5, 0.06, 0.02] },
        { shape: 'box', color: '#f6f1e7', size: [0.8, 0.3, 0.02], pos: [0.5, -0.36, 0.02] },
      ],
    },
  },
  {
    id: 'bakery',
    name: 'Bakery',
    category: 'industry',
    description: 'Bakes bread from flour (0.7 t flour → 1 t bread). Sells to households.',
    cost: 48000,
    buildDays: 25,
    footprint: [2, 2],
    maintenance: 28,
    maxWorkers: 14,
    refWorkers: 6,
    alpha: 0.6,
    recipe: { inputs: { flour: 0.7 }, outputs: { bread: 1 } },
    baseRate: 6,
    site: { kind: 'none', label: '' },
    storage: 120,
    lifeYears: 25,
    maxLevel: 3,
    model: [
      { shape: 'box', color: '#e9c9a6', size: [1.4, 0.75, 1.0] },
      { shape: 'prism', color: '#a65442', size: [1.46, 0.5, 1.06], pos: [0, 0.75, 0] },
      { shape: 'box', color: '#b9644c', size: [0.22, 0.6, 0.22], pos: [0.45, 0.9, 0.2] },
      { shape: 'box', color: '#f7e7c4', size: [0.5, 0.06, 0.3], pos: [-0.3, 0.5, 0.52] },
    ],
  },
];

export const BUILDING: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
