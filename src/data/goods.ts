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
  {
    id: 'wheat',
    name: 'Wheat',
    unit: 't',
    basePrice: 40,
    category: 'raw',
    color: '#e5c35c',
    icon: '🌾',
    perCapita: 0.0011,
    elasticity: 0.6,
    incomeElasticity: 0.2,
    supplyElasticity: 1.4,
    outsideSupply: 1,
  },
  {
    id: 'flour',
    name: 'Flour',
    unit: 't',
    basePrice: 88,
    category: 'intermediate',
    color: '#efe6d2',
    icon: '🥣',
    perCapita: 0.0008,
    elasticity: 0.7,
    incomeElasticity: 0.3,
    supplyElasticity: 1.4,
    outsideSupply: 1,
  },
  {
    id: 'bread',
    name: 'Bread',
    unit: 't',
    basePrice: 140,
    category: 'consumer',
    color: '#c98b4a',
    icon: '🍞',
    perCapita: 0.0006,
    elasticity: 0.5,
    incomeElasticity: 0.3,
    supplyElasticity: 1.5,
    outsideSupply: 1,
  },
];

export const GOOD: Record<string, GoodDef> = Object.fromEntries(GOODS.map((g) => [g.id, g]));
