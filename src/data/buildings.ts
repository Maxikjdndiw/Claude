import type { Part } from '../render/meshkit';

/**
 * Building types. Production per day =
 *   baseRate * siteFactor * skillFactor * techFactor * (workers / refWorkers)^alpha
 * (capped by available inputs and storage). alpha < 1 gives diminishing
 * marginal returns to labor. Upgrading raises capacity more than fixed costs,
 * so average cost per unit falls: economies of scale.
 *
 * To add content: add goods in goods.ts, then a building here. Nothing else
 * needs to change.
 */
export interface Recipe {
  /** Input tons per ton of output. */
  inputs: Record<string, number>;
  /** Output goods (ratio per production unit). */
  outputs: Record<string, number>;
}

export type SiteKind = 'fertility' | 'forest' | 'fish' | 'deposit' | 'coast' | 'none';
export type Category = 'hq' | 'food' | 'forestry' | 'mining' | 'industry' | 'logistics';

export interface BuildingDef {
  id: string;
  name: string;
  category: Category;
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
  /** Parts that spin (e.g. windmill blades), positioned relative to the pivot. */
  spinner?: { pivot: [number, number, number]; axis: 'x' | 'z' | 'y'; parts: Part[] };
  /** Paint the footprint as fields in this color. */
  fields?: string;
  /** Digs an open pit into the terrain as the deposit is mined. */
  pit?: boolean;
  /** Technology required before it can be built. */
  requires?: string;
  /** Can store and ship any good (harbors, depots). */
  warehouse?: boolean;
  /** Not available in the build menu (e.g. HQ). */
  hidden?: boolean;
}

export const CATEGORIES: { id: Category; name: string; icon: string }[] = [
  { id: 'food', name: 'Food', icon: '🌾' },
  { id: 'forestry', name: 'Forestry', icon: '🌲' },
  { id: 'mining', name: 'Mining', icon: '⛏' },
  { id: 'industry', name: 'Industry', icon: '🏭' },
  { id: 'logistics', name: 'Logistics', icon: '⚓' },
];

const roofRed = '#c7634f';
const wall = '#f3ece0';
const wood = '#a7774f';
const stone = '#c9c3b8';
const steelGrey = '#9aa4ae';
const darkGrey = '#7d8894';

const shed = (color: string, roof: string, size: [number, number, number], pos: [number, number, number]): Part[] => [
  { shape: 'box', color, size, pos },
  { shape: 'prism', color: roof, size: [size[0] + 0.06, size[1] * 0.55, size[2] + 0.06], pos: [pos[0], pos[1] + size[1], pos[2]] },
];

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
  // ------------------------------------------------------------------ food
  {
    id: 'farm',
    name: 'Wheat Farm',
    category: 'food',
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
    category: 'food',
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
      ...shed(wall, roofRed, [0.7, 0.5, 0.6], [0.7, 0, 0.3]),
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
    category: 'food',
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
      ...shed('#e9c9a6', '#a65442', [1.4, 0.75, 1.0], [0, 0, 0]),
      { shape: 'box', color: '#b9644c', size: [0.22, 0.6, 0.22], pos: [0.45, 0.9, 0.2] },
      { shape: 'box', color: '#f7e7c4', size: [0.5, 0.06, 0.3], pos: [-0.3, 0.5, 0.52] },
    ],
  },
  {
    id: 'fishery',
    name: 'Fishery',
    category: 'food',
    description: 'Fishing boats and a fish market on the shore. Overfishing depletes the stocks, which regrow slowly.',
    cost: 30000,
    buildDays: 18,
    footprint: [2, 2],
    maintenance: 20,
    maxWorkers: 12,
    refWorkers: 6,
    alpha: 0.6,
    recipe: { inputs: {}, outputs: { fish: 1 } },
    baseRate: 4.5,
    site: { kind: 'fish', label: 'Fish stocks' },
    storage: 90,
    lifeYears: 20,
    maxLevel: 3,
    model: [
      ...shed('#dbe7ec', '#4f7d91', [1.2, 0.5, 0.9], [-0.2, 0, -0.2]),
      { shape: 'box', color: wood, size: [0.25, 0.12, 1.6], pos: [0.65, 0, 0.1] },
      { shape: 'box', color: '#e9eef2', size: [0.3, 0.14, 0.55], pos: [0.65, 0.12, 0.5] },
      { shape: 'cyl', color: wood, size: [0.03, 0.45, 0.03], pos: [0.65, 0.26, 0.5], segments: 4 },
    ],
  },
  // ------------------------------------------------------------------ forestry
  {
    id: 'lumber',
    name: 'Lumber Camp',
    category: 'forestry',
    description: 'Fells trees for logs. Needs forest around it; trees regrow slowly, so over-logging lowers output.',
    cost: 28000,
    buildDays: 15,
    footprint: [2, 2],
    maintenance: 18,
    maxWorkers: 14,
    refWorkers: 6,
    alpha: 0.6,
    recipe: { inputs: {}, outputs: { logs: 1 } },
    baseRate: 7,
    site: { kind: 'forest', label: 'Forest density' },
    storage: 150,
    lifeYears: 20,
    maxLevel: 3,
    model: [
      ...shed('#b98a5e', '#6e4b33', [1.0, 0.45, 0.7], [-0.3, 0, -0.3]),
      { shape: 'cyl', color: '#9c6b43', size: [0.18, 0.9, 0.18], pos: [0.5, 0.09, 0.45], rotY: 0, segments: 6 },
      { shape: 'box', color: '#9c6b43', size: [0.9, 0.16, 0.16], pos: [0.3, 0, 0.55] },
      { shape: 'box', color: '#8f5f3a', size: [0.9, 0.16, 0.16], pos: [0.3, 0.16, 0.55] },
    ],
  },
  {
    id: 'sawmill',
    name: 'Sawmill',
    category: 'forestry',
    description: 'Cuts logs into planks (1.6 t logs → 1 t planks).',
    cost: 46000,
    buildDays: 22,
    footprint: [2, 2],
    maintenance: 28,
    maxWorkers: 14,
    refWorkers: 6,
    alpha: 0.62,
    recipe: { inputs: { logs: 1.6 }, outputs: { planks: 1 } },
    baseRate: 6,
    site: { kind: 'none', label: '' },
    storage: 200,
    lifeYears: 25,
    maxLevel: 3,
    model: [
      ...shed('#d6b48a', '#7a5a3c', [1.5, 0.6, 0.9], [0, 0, -0.2]),
      { shape: 'box', color: '#d9b07a', size: [0.7, 0.25, 0.4], pos: [-0.3, 0, 0.6] },
      { shape: 'cyl', color: '#8b939b', size: [0.12, 0.7, 0.12], pos: [0.55, 0.6, -0.3], segments: 6 },
    ],
  },
  {
    id: 'furniture',
    name: 'Furniture Factory',
    category: 'forestry',
    description: 'Turns planks into furniture (1.2 t planks → 1 t). A luxury good: demand is very sensitive to price and income.',
    cost: 70000,
    buildDays: 30,
    footprint: [2, 2],
    maintenance: 40,
    maxWorkers: 24,
    refWorkers: 10,
    alpha: 0.65,
    recipe: { inputs: { planks: 1.2 }, outputs: { furniture: 1 } },
    baseRate: 2.5,
    site: { kind: 'none', label: '' },
    storage: 90,
    lifeYears: 25,
    maxLevel: 3,
    model: [
      { shape: 'box', color: '#efe3d0', size: [1.6, 0.8, 1.2] },
      { shape: 'box', color: '#b5651d', size: [1.66, 0.1, 1.26], pos: [0, 0.8, 0] },
      { shape: 'box', color: '#cfa57a', size: [0.6, 0.3, 0.02], pos: [0, 0.4, 0.61] },
    ],
  },
  // ------------------------------------------------------------------ mining
  {
    id: 'iron_mine',
    name: 'Iron Mine',
    category: 'mining',
    description: 'Digs iron ore out of a deposit. Place it next to an iron deposit; an open pit grows as you mine. Deposits run out.',
    cost: 60000,
    buildDays: 30,
    footprint: [2, 2],
    maintenance: 45,
    maxWorkers: 24,
    refWorkers: 10,
    alpha: 0.6,
    recipe: { inputs: {}, outputs: { iron_ore: 1 } },
    baseRate: 9,
    site: { kind: 'deposit', resource: 'iron', label: 'Deposit' },
    storage: 200,
    lifeYears: 20,
    maxLevel: 3,
    pit: true,
    model: [
      ...shed('#c9b8a3', '#7d5b4a', [1.0, 0.5, 0.8], [-0.35, 0, -0.3]),
      { shape: 'box', color: darkGrey, size: [0.12, 1.4, 0.12], pos: [0.45, 0, 0.35] },
      { shape: 'box', color: darkGrey, size: [0.12, 1.4, 0.12], pos: [0.75, 0, 0.35] },
      { shape: 'box', color: darkGrey, size: [0.5, 0.1, 0.18], pos: [0.6, 1.35, 0.35] },
      { shape: 'cyl', color: '#b5654a', size: [0.35, 0.18, 0.35], pos: [0.6, 1.45, 0.35], segments: 8 },
    ],
  },
  {
    id: 'coal_mine',
    name: 'Coal Mine',
    category: 'mining',
    description: 'Mines coal, fuel for steel mills. Place it next to a coal deposit.',
    cost: 55000,
    buildDays: 28,
    footprint: [2, 2],
    maintenance: 40,
    maxWorkers: 24,
    refWorkers: 10,
    alpha: 0.6,
    recipe: { inputs: {}, outputs: { coal: 1 } },
    baseRate: 10,
    site: { kind: 'deposit', resource: 'coal', label: 'Deposit' },
    storage: 200,
    lifeYears: 20,
    maxLevel: 3,
    pit: true,
    model: [
      ...shed('#b9b4ad', '#4b4f55', [1.0, 0.5, 0.8], [-0.35, 0, -0.3]),
      { shape: 'box', color: darkGrey, size: [0.12, 1.4, 0.12], pos: [0.45, 0, 0.35] },
      { shape: 'box', color: darkGrey, size: [0.12, 1.4, 0.12], pos: [0.75, 0, 0.35] },
      { shape: 'box', color: darkGrey, size: [0.5, 0.1, 0.18], pos: [0.6, 1.35, 0.35] },
      { shape: 'cone', color: '#3f3f46', size: [0.5, 0.35, 0.5], pos: [-0.4, 0, 0.55], segments: 6 },
    ],
  },
  {
    id: 'quarry',
    name: 'Stone Quarry',
    category: 'mining',
    description: 'Cuts building stone. Cheap per ton, so it only pays to sell it nearby.',
    cost: 40000,
    buildDays: 20,
    footprint: [2, 2],
    maintenance: 30,
    maxWorkers: 18,
    refWorkers: 8,
    alpha: 0.6,
    recipe: { inputs: {}, outputs: { stone: 1 } },
    baseRate: 14,
    site: { kind: 'deposit', resource: 'stone', label: 'Deposit' },
    storage: 240,
    lifeYears: 25,
    maxLevel: 3,
    pit: true,
    model: [
      ...shed('#d4d0c8', '#8a8f96', [0.9, 0.45, 0.7], [-0.4, 0, -0.4]),
      { shape: 'box', color: '#b9b9b9', size: [0.5, 0.35, 0.5], pos: [0.45, 0, 0.4] },
      { shape: 'box', color: '#a9a9a9', size: [0.4, 0.3, 0.4], pos: [0.4, 0.35, 0.35] },
      { shape: 'box', color: '#c4c4c4', size: [0.35, 0.25, 0.35], pos: [-0.3, 0, 0.55] },
    ],
  },
  {
    id: 'oil_well',
    name: 'Oil Well',
    category: 'mining',
    description: 'Pumps crude oil from a (usually hidden) oil field. Survey to find one.',
    cost: 90000,
    buildDays: 35,
    footprint: [2, 2],
    maintenance: 60,
    maxWorkers: 12,
    refWorkers: 6,
    alpha: 0.5,
    recipe: { inputs: {}, outputs: { crude: 1 } },
    baseRate: 10,
    site: { kind: 'deposit', resource: 'oil', label: 'Oil field' },
    storage: 220,
    lifeYears: 20,
    maxLevel: 3,
    model: [
      { shape: 'box', color: '#5c6670', size: [1.4, 0.12, 0.3], pos: [0, 0, 0] },
      { shape: 'box', color: '#e0a43a', size: [0.12, 0.8, 0.12], pos: [0, 0.1, 0] },
      { shape: 'cyl', color: '#cfd5da', size: [0.5, 0.6, 0.5], pos: [-0.5, 0, 0.5], segments: 8 },
    ],
    spinner: {
      pivot: [0, 0.9, 0],
      axis: 'z',
      parts: [{ shape: 'box', color: '#2f3740', size: [1.3, 0.14, 0.14], pos: [0, -0.07, 0] }],
    },
  },
  // ------------------------------------------------------------------ industry
  {
    id: 'steel_mill',
    name: 'Steel Mill',
    category: 'industry',
    description: 'Smelts iron ore with coal into steel (1.5 ore + 1 coal → 1 steel). Capital intensive: high fixed costs.',
    cost: 140000,
    buildDays: 45,
    footprint: [3, 2],
    maintenance: 120,
    maxWorkers: 30,
    refWorkers: 14,
    alpha: 0.65,
    recipe: { inputs: { iron_ore: 1.5, coal: 1 }, outputs: { steel: 1 } },
    baseRate: 6,
    site: { kind: 'none', label: '' },
    storage: 300,
    lifeYears: 30,
    maxLevel: 3,
    model: [
      { shape: 'box', color: '#c9ccd1', size: [2.2, 0.9, 1.3], pos: [0, 0, -0.1] },
      { shape: 'box', color: '#8a3b2b', size: [2.26, 0.1, 1.36], pos: [0, 0.9, -0.1] },
      { shape: 'cyl', color: '#9b9fa4', size: [0.3, 1.9, 0.3], pos: [-0.7, 0, 0.6], segments: 8 },
      { shape: 'cyl', color: '#9b9fa4', size: [0.3, 1.6, 0.3], pos: [-0.25, 0, 0.6], segments: 8 },
      { shape: 'cyl', color: '#c0613f', size: [0.6, 1.2, 0.6], pos: [0.7, 0, 0.55], segments: 8 },
    ],
  },
  {
    id: 'tool_factory',
    name: 'Tool Factory',
    category: 'industry',
    description: 'Makes tools from steel and planks (0.6 steel + 0.4 planks → 1 t tools).',
    cost: 110000,
    buildDays: 35,
    footprint: [2, 2],
    maintenance: 70,
    maxWorkers: 26,
    refWorkers: 12,
    alpha: 0.65,
    recipe: { inputs: { steel: 0.6, planks: 0.4 }, outputs: { tools: 1 } },
    baseRate: 2.5,
    site: { kind: 'none', label: '' },
    storage: 120,
    lifeYears: 25,
    maxLevel: 3,
    model: [
      { shape: 'box', color: '#dfe3e8', size: [1.6, 0.7, 1.3] },
      { shape: 'prism', color: steelGrey, size: [0.55, 0.35, 1.3], pos: [-0.53, 0.7, 0] },
      { shape: 'prism', color: steelGrey, size: [0.55, 0.35, 1.3], pos: [0, 0.7, 0] },
      { shape: 'prism', color: steelGrey, size: [0.55, 0.35, 1.3], pos: [0.53, 0.7, 0] },
    ],
  },
  {
    id: 'machine_works',
    name: 'Machine Works',
    category: 'industry',
    description: 'Builds machines from steel and tools (0.8 steel + 0.5 tools → 1 t). Very high value added.',
    cost: 200000,
    buildDays: 50,
    footprint: [3, 2],
    maintenance: 130,
    maxWorkers: 32,
    refWorkers: 16,
    alpha: 0.7,
    recipe: { inputs: { steel: 0.8, tools: 0.5 }, outputs: { machines: 1 } },
    baseRate: 0.9,
    site: { kind: 'none', label: '' },
    storage: 60,
    lifeYears: 30,
    maxLevel: 3,
    requires: 'precision',
    model: [
      { shape: 'box', color: '#e6eaee', size: [2.3, 0.9, 1.4] },
      { shape: 'box', color: '#4b5d73', size: [2.36, 0.12, 1.46], pos: [0, 0.9, 0] },
      { shape: 'box', color: '#9fb4c8', size: [1.6, 0.35, 0.02], pos: [0, 0.4, 0.71] },
      { shape: 'cyl', color: steelGrey, size: [0.2, 0.6, 0.2], pos: [0.8, 1.0, -0.3], segments: 6 },
    ],
  },
  {
    id: 'refinery',
    name: 'Oil Refinery',
    category: 'industry',
    description: 'Refines crude oil into fuel (1.2 t crude → 1 t fuel). Fuel prices feed into everyone\'s transport costs.',
    cost: 160000,
    buildDays: 45,
    footprint: [3, 2],
    maintenance: 120,
    maxWorkers: 26,
    refWorkers: 12,
    alpha: 0.6,
    recipe: { inputs: { crude: 1.2 }, outputs: { fuel: 1 } },
    baseRate: 8,
    site: { kind: 'none', label: '' },
    storage: 300,
    lifeYears: 30,
    maxLevel: 3,
    model: [
      { shape: 'cyl', color: '#e8ecef', size: [0.8, 0.7, 0.8], pos: [-0.8, 0, -0.3], segments: 10 },
      { shape: 'cyl', color: '#e8ecef', size: [0.8, 0.7, 0.8], pos: [0.1, 0, -0.3], segments: 10 },
      { shape: 'cyl', color: '#cfd5da', size: [0.25, 1.8, 0.25], pos: [0.85, 0, 0.3], segments: 8 },
      { shape: 'box', color: '#e0a43a', size: [1.0, 0.25, 0.3], pos: [-0.3, 0, 0.5] },
    ],
  },
  // ------------------------------------------------------------------ logistics
  {
    id: 'harbor',
    name: 'Harbor',
    category: 'logistics',
    description: 'A port on the coast. Trucks or trains bring goods here; ships carry them to other harbors and coastal towns.',
    cost: 65000,
    buildDays: 30,
    footprint: [2, 2],
    maintenance: 50,
    maxWorkers: 0,
    refWorkers: 1,
    alpha: 1,
    recipe: null,
    baseRate: 0,
    site: { kind: 'coast', label: 'Coast' },
    storage: 900,
    lifeYears: 40,
    maxLevel: 1,
    warehouse: true,
    requires: 'shipping',
    model: [
      { shape: 'box', color: '#c9c3b8', size: [1.9, 0.18, 1.9] },
      { shape: 'box', color: '#d08a5c', size: [0.5, 0.35, 0.5], pos: [-0.5, 0.18, -0.5] },
      { shape: 'box', color: '#5b8fb9', size: [0.5, 0.35, 0.5], pos: [-0.5, 0.53, -0.5] },
      { shape: 'box', color: '#7bb37a', size: [0.5, 0.35, 0.5], pos: [0.05, 0.18, -0.5] },
      { shape: 'box', color: '#e2b23c', size: [0.08, 1.5, 0.08], pos: [0.6, 0.18, 0.3] },
      { shape: 'box', color: '#e2b23c', size: [0.9, 0.08, 0.08], pos: [0.3, 1.6, 0.3] },
    ],
  },
  {
    id: 'depot',
    name: 'Warehouse',
    category: 'logistics',
    description: 'Stores any goods. Use it as a hub to switch goods between trucks, trains and ships.',
    cost: 22000,
    buildDays: 12,
    footprint: [2, 2],
    maintenance: 15,
    maxWorkers: 0,
    refWorkers: 1,
    alpha: 1,
    recipe: null,
    baseRate: 0,
    site: { kind: 'none', label: '' },
    storage: 600,
    lifeYears: 30,
    maxLevel: 1,
    warehouse: true,
    model: [
      { shape: 'box', color: '#e4dccb', size: [1.6, 0.7, 1.2] },
      { shape: 'prism', color: '#7d8a99', size: [1.66, 0.4, 1.26], pos: [0, 0.7, 0] },
      { shape: 'box', color: '#8a7a66', size: [0.5, 0.45, 0.02], pos: [0, 0, 0.61] },
    ],
  },
];

export const BUILDING: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
