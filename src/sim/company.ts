import { emptyLedger, type Company } from './state';

export function newCompany(id: number, name: string, color: string, isPlayer: boolean, cash: number): Company {
  return {
    id,
    name,
    color,
    isPlayer,
    cash,
    month: emptyLedger(),
    cashflow: { operating: 0, investing: 0, financing: 0 },
    history: [],
    negativeDays: 0,
    bankrupt: false,
    hq: null,
    techs: [],
    research: null,
    equity: { shares: 1_000_000, holdings: { founder: 1_000_000 }, listed: false, price: cash / 1_000_000, sentiment: 1, history: [] },
    founderWealth: 0,
  };
}
