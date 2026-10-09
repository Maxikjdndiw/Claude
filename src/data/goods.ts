/**
 * Tradeable goods. Every town is a market for every good.
 *
 * Demand in a town: perCapita * population * wealth^incomeElasticity, scaled by
 * (price / basePrice)^(-elasticity). Elasticity < 1 means a necessity (people
 * keep buying even when it gets expensive); > 1 means a luxury.
 */
export interface GoodDef {
  id: string;
  name: string;
  unit: string;
  /** Reference price at which the outside world trades. */
  basePrice: number;
  category: 'raw' | 'intermediate' | 'consumer';
  color: string;
  icon: string;
  /** Tons per day demanded per inhabitant at the base price. */
  perCapita: number;
  /** Price elasticity of demand (absolute value). */
  elasticity: number;
  /** Income elasticity: how strongly demand grows with town wealth. */
  incomeElasticity: number;
  /** Price elasticity of the town's outside (background) supply. */
  supplyElasticity: number;
  /** Share of demand the outside world supplies at the base price. */
  outsideSupply: number;
}

export const GOODS: GoodDef[] = [
  // --- Food chain
  g('wheat', 'Wheat', 40, 'raw', '#e5c35c', '🌾', 0.0011, 0.6, 0.2),
  g('flour', 'Flour', 95, 'intermediate', '#efe6d2', '🥣', 0.0008, 0.7, 0.3),
  g('bread', 'Bread', 140, 'consumer', '#c98b4a', '🍞', 0.0006, 0.5, 0.3),
  g('fish', 'Fish', 70, 'consumer', '#7fb3c8', '🐟', 0.0004, 0.6, 0.5),
  // --- Wood chain
  g('logs', 'Logs', 30, 'raw', '#9c6b43', '🪵', 0.0008, 0.6, 0.3),
  g('planks', 'Planks', 90, 'intermediate', '#d9b07a', '🪚', 0.0012, 0.7, 0.6),
  g('furniture', 'Furniture', 300, 'consumer', '#b5651d', '🪑', 0.00015, 1.3, 1.4),
  // --- Mining & metal chain
  g('stone', 'Stone', 25, 'raw', '#a9a9a9', '🪨', 0.0015, 0.8, 0.6),
  g('iron_ore', 'Iron ore', 45, 'raw', '#b5654a', '⛏', 0.0008, 0.6, 0.5),
  g('coal', 'Coal', 35, 'raw', '#3f3f46', '⚫', 0.0008, 0.5, 0.4),
  g('steel', 'Steel', 260, 'intermediate', '#8a9bb0', '🔩', 0.0006, 0.8, 0.8),
  g('tools', 'Tools', 480, 'consumer', '#6b7a8f', '🔧', 0.0002, 0.9, 0.9),
  g('machines', 'Machines', 1600, 'consumer', '#4b5d73', '⚙', 0.00006, 1.1, 1.3),
  // --- Energy chain
  g('crude', 'Crude oil', 60, 'raw', '#1f2937', '🛢', 0.0002, 0.4, 0.5),
  g('fuel', 'Fuel', 160, 'consumer', '#e0a43a', '⛽', 0.0012, 0.4, 0.8),
];

function g(
  id: string,
  name: string,
  basePrice: number,
  category: GoodDef['category'],
  color: string,
  icon: string,
  perCapita: number,
  elasticity: number,
  incomeElasticity: number,
): GoodDef {
  return {
    id,
    name,
    unit: 't',
    basePrice,
    category,
    color,
    icon,
    perCapita,
    elasticity,
    incomeElasticity,
    supplyElasticity: 1.4,
    outsideSupply: 1,
  };
}

export const GOOD: Record<string, GoodDef> = Object.fromEntries(GOODS.map((g) => [g.id, g]));
