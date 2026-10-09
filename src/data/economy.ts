/** Global economic tuning constants. */
export const ECON = {
  startCash: 150_000,
  startYear: 2000,
  /** Reference daily wage per worker before town wealth / labor scarcity. */
  baseWage: 12,
  /** Natural unemployment rate towns drift back to. */
  naturalUnemployment: 0.07,
  /** Share of the population that is in the labor force. */
  laborShare: 0.5,
  /** Max distance (cells = km) workers commute to a building. */
  commuteRange: 30,
  /** Goods move automatically between your buildings / to towns within this range. */
  localRange: 12,
  /** Cost per ton per km for local handling (carts, forklifts). */
  localHaulCost: 0.35,
  /** You may construct within this distance of your HQ or another building you own. */
  buildRange: 22,
  /** Corporate tax on positive monthly operating profit. */
  taxRate: 0.2,
  trainingCostPerWorker: 180,
  trainingDays: 20,
  /** Productivity bonus of a fully trained workforce. */
  skillBonus: 0.3,
  /** Interest a safe deposit would earn per year (used to show opportunity cost). */
  depositRate: 0.03,
  /** Overdraft interest per year when cash is negative. */
  overdraftRate: 0.18,
  /** Days with negative cash before bankruptcy. */
  bankruptcyDays: 60,
  /** Upgrade: cost (share of base), capacity and fixed-cost multipliers per level. */
  upgradeCost: 0.85,
  levelRate: [1, 2.1, 3.3],
  levelWorkers: [1, 1.9, 2.8],
  levelMaintenance: [1, 1.45, 1.85],
  /** Demolishing returns this share of book value. */
  salvage: 0.3,
  /** Markets: target stock in days of demand, price floor & import ceiling. */
  stockDays: 8,
  priceFloor: 0.3,
  priceCeiling: 1.9,
  /** How strongly price reacts to stock vs target (price = ref * (stock/target)^-k). */
  priceSensitivity: 0.9,
};
