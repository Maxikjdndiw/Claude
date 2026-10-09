/**
 * Technology tree. Research takes time and money (R&D is an expense now for
 * lower costs later); alternatively a license can be bought instantly at a
 * premium.
 */
export type TechEffect =
  | { kind: 'output'; target: string; mult: number }
  | { kind: 'labor'; target: string; mult: number }
  | { kind: 'transport'; mode: 'road' | 'rail' | 'sea' | 'all'; perKm?: number; daily?: number }
  | { kind: 'unlock'; what: string }
  | { kind: 'regrowth'; mult: number };

export interface TechDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  days: number;
  requires: string[];
  effects: TechEffect[];
  /** Column in the tree view. */
  tier: number;
}

export const TECHS: TechDef[] = [
  {
    id: 'mech_farming',
    name: 'Mechanized farming',
    description: 'Tractors and harvesters: farms produce 25% more.',
    cost: 40000,
    days: 90,
    requires: [],
    effects: [{ kind: 'output', target: 'farm', mult: 1.25 }],
    tier: 0,
  },
  {
    id: 'steam',
    name: 'Steam power',
    description: 'Mills, sawmills and factories produce 15% more.',
    cost: 60000,
    days: 120,
    requires: [],
    effects: [{ kind: 'output', target: 'cat:industry', mult: 1.15 }, { kind: 'output', target: 'cat:forestry', mult: 1.1 }, { kind: 'output', target: 'mill', mult: 1.15 }],
    tier: 0,
  },
  {
    id: 'mining_eng',
    name: 'Mining engineering',
    description: 'Better shafts and drills: mines and quarries extract 25% more.',
    cost: 55000,
    days: 120,
    requires: [],
    effects: [{ kind: 'output', target: 'cat:mining', mult: 1.25 }],
    tier: 0,
  },
  {
    id: 'shipping',
    name: 'Shipping',
    description: 'Unlocks harbors and cargo ships: the cheapest way to move bulk goods along the coast.',
    cost: 50000,
    days: 90,
    requires: [],
    effects: [{ kind: 'unlock', what: 'harbor' }, { kind: 'unlock', what: 'ship' }],
    tier: 0,
  },
  {
    id: 'railways',
    name: 'Railways',
    description: 'Unlocks railway track and freight trains: expensive to build, very cheap per ton-km.',
    cost: 80000,
    days: 150,
    requires: ['steam'],
    effects: [{ kind: 'unlock', what: 'rail' }, { kind: 'unlock', what: 'train' }],
    tier: 1,
  },
  {
    id: 'crop_rotation',
    name: 'Crop science',
    description: 'Fertilizers and crop rotation: farms +15%, fisheries +15%.',
    cost: 45000,
    days: 120,
    requires: ['mech_farming'],
    effects: [{ kind: 'output', target: 'farm', mult: 1.15 }, { kind: 'output', target: 'fishery', mult: 1.15 }],
    tier: 1,
  },
  {
    id: 'diesel',
    name: 'Diesel engines',
    description: 'Fuel-efficient engines: running costs per km −25% for all vehicles.',
    cost: 70000,
    days: 120,
    requires: ['steam'],
    effects: [{ kind: 'transport', mode: 'all', perKm: 0.75 }],
    tier: 1,
  },
  {
    id: 'assembly',
    name: 'Assembly line',
    description: 'Division of labor in factories: industry and food processing +20%.',
    cost: 90000,
    days: 150,
    requires: ['steam'],
    effects: [{ kind: 'output', target: 'cat:industry', mult: 1.2 }, { kind: 'output', target: 'bakery', mult: 1.2 }, { kind: 'output', target: 'furniture', mult: 1.2 }],
    tier: 1,
  },
  {
    id: 'forestry',
    name: 'Sustainable forestry',
    description: 'Replanting programs: forests regrow three times faster.',
    cost: 35000,
    days: 90,
    requires: [],
    effects: [{ kind: 'regrowth', mult: 3 }],
    tier: 0,
  },
  {
    id: 'precision',
    name: 'Precision engineering',
    description: 'Unlocks the Machine Works, the highest value-added factory.',
    cost: 120000,
    days: 180,
    requires: ['assembly'],
    effects: [{ kind: 'unlock', what: 'machine_works' }],
    tier: 2,
  },
  {
    id: 'automation',
    name: 'Automation',
    description: 'Machines replace labor: industrial plants need 35% fewer workers for the same output (capital substitutes for labor).',
    cost: 160000,
    days: 200,
    requires: ['assembly'],
    effects: [{ kind: 'labor', target: 'cat:industry', mult: 0.65 }, { kind: 'labor', target: 'cat:forestry', mult: 0.75 }, { kind: 'labor', target: 'cat:food', mult: 0.8 }],
    tier: 2,
  },
  {
    id: 'logistics_it',
    name: 'Logistics software',
    description: 'Route planning and fleet management: vehicle fixed daily costs −30%.',
    cost: 75000,
    days: 120,
    requires: ['diesel'],
    effects: [{ kind: 'transport', mode: 'all', daily: 0.7 }],
    tier: 2,
  },
  {
    id: 'deep_mining',
    name: 'Deep mining',
    description: 'Heavy machinery: mines +25% and slower decline as deposits deplete.',
    cost: 110000,
    days: 180,
    requires: ['mining_eng', 'steam'],
    effects: [{ kind: 'output', target: 'cat:mining', mult: 1.25 }],
    tier: 1,
  },
];

export const TECH: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/** Buying a license instead of researching costs this multiple of the research cost. */
export const LICENSE_PREMIUM = 2.5;
