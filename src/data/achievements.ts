/** Achievements. Checked in sim/goals.ts; unlocked ones are remembered across games. */
export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'founder', title: 'Founder', description: 'Found your company.', icon: '🏁' },
  { id: 'first_plant', title: 'Breaking Ground', description: 'Complete your first production building.', icon: '🏗' },
  { id: 'profit', title: 'In the Black', description: 'Make a monthly net profit.', icon: '📗' },
  { id: 'chain', title: 'Supply Chain', description: 'Run a full chain: a raw material, an intermediate and a finished good.', icon: '🔗' },
  { id: 'five_plants', title: 'Industrialist', description: 'Operate 5 production buildings.', icon: '🏭' },
  { id: 'trucker', title: 'On the Road', description: 'Open your first transport line.', icon: '🚚' },
  { id: 'rail', title: 'Iron Horse', description: 'Run a train line.', icon: '🚆' },
  { id: 'ship', title: 'Ahoy!', description: 'Run a ship line.', icon: '🚢' },
  { id: 'miner', title: 'Deep Digger', description: 'Mine a deposit until it is half empty.', icon: '⛏' },
  { id: 'researcher', title: 'Innovator', description: 'Acquire 5 technologies.', icon: '🔬' },
  { id: 'value_500k', title: 'Half a Million', description: 'Reach a company value of $500,000.', icon: '💵' },
  { id: 'value_1m', title: 'Millionaire', description: 'Reach a company value of $1,000,000.', icon: '💰' },
  { id: 'value_10m', title: 'Tycoon', description: 'Reach a company value of $10,000,000.', icon: '👑' },
  { id: 'dominant', title: 'Market Leader', description: 'Supply half of all sales of any good.', icon: '🥇' },
  { id: 'borrower', title: 'Leverage', description: 'Take a bank loan.', icon: '🏦' },
  { id: 'debt_free', title: 'Debt Free', description: 'Repay all your loans after borrowing.', icon: '🕊' },
  { id: 'ipo', title: 'Going Public', description: 'List your company on the stock exchange.', icon: '🔔' },
  { id: 'dividend', title: 'Shareholder Value', description: 'Pay a dividend.', icon: '💸' },
  { id: 'takeover', title: 'Corporate Raider', description: 'Take over a competitor.', icon: '🦈' },
  { id: 'survivor', title: 'Survivor', description: 'Make a profit during a recession.', icon: '🌂' },
  { id: 'scholar', title: 'Economist', description: 'Discover 20 economics concepts.', icon: '🎓' },
  { id: 'scenario', title: 'Mission Accomplished', description: 'Win a scenario.', icon: '🏆' },
];

export const ACHIEVEMENT: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
