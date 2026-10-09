import { emit } from './events';
import { book, companyAssets, debtOf, operatingProfit, trailing } from './finance';
import type { Company, GameState, Loan } from './state';

/**
 * Banking: the bank lends at the central bank rate plus a risk spread that
 * depends on your credit rating. Loans are repaid in equal monthly
 * installments (annuities); variable-rate loans follow the central bank.
 */

export const RATINGS = [
  { grade: 'AAA', spread: 0.008 },
  { grade: 'AA', spread: 0.012 },
  { grade: 'A', spread: 0.018 },
  { grade: 'BBB', spread: 0.026 },
  { grade: 'BB', spread: 0.038 },
  { grade: 'B', spread: 0.055 },
  { grade: 'CCC', spread: 0.085 },
] as const;

export { debtOf };

export function creditRating(state: GameState, c: Company): { grade: string; spread: number; index: number; leverage: number; coverage: number } {
  const debt = debtOf(state, c.id);
  const assets = Math.max(1, companyAssets(state, c));
  const leverage = debt / assets;
  const n = Math.min(12, c.history.length);
  const t = trailing(c, Math.max(1, n));
  const ebit = n ? (operatingProfit(t) * 12) / n : 0;
  const interest = n ? (t.interest * 12) / n : 0;
  // Interest coverage: how many times operating profit covers interest.
  const coverage = interest > 500 ? ebit / interest : ebit > 0 ? 20 : ebit < 0 ? 0.5 : 3;
  let score = 0; // 0 = best
  if (leverage > 0.15) score++;
  if (leverage > 0.3) score++;
  if (leverage > 0.45) score++;
  if (leverage > 0.6) score += 2;
  if (coverage < 8) score++;
  if (coverage < 3) score++;
  if (coverage < 1.2) score += 2;
  if (c.cash < 0) score++;
  if (n < 3) score = Math.max(score, 3); // new companies start at BBB
  const index = Math.min(RATINGS.length - 1, score);
  return { ...RATINGS[index], index, leverage, coverage };
}

export function loanRate(state: GameState, c: Company): number {
  return state.macro.baseRate + creditRating(state, c).spread;
}

/** How much more the bank will lend. */
export function creditLimit(state: GameState, c: Company): number {
  const r = creditRating(state, c);
  if (r.grade === 'CCC') return 0;
  const assets = companyAssets(state, c);
  const cap = Math.max(60000 * state.priceLevel, assets * (0.65 - r.index * 0.06));
  return Math.max(0, Math.round((cap - debtOf(state, c.id)) / 1000) * 1000);
}

/** Monthly payment of an annuity loan. */
export function annuity(balance: number, annualRate: number, months: number): number {
  const r = annualRate / 12;
  if (months <= 0) return balance;
  if (r <= 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

export function takeLoan(
  state: GameState,
  owner: number,
  amount: number,
  months: number,
  variable: boolean,
): { ok: boolean; reason?: string } {
  const c = state.companies[owner];
  amount = Math.round(amount);
  if (amount < 1000) return { ok: false, reason: 'Minimum loan is $1,000' };
  if (amount > creditLimit(state, c)) return { ok: false, reason: 'The bank will not lend you that much' };
  const r = creditRating(state, c);
  const loan: Loan = {
    id: state.nextId++,
    owner,
    principal: amount,
    balance: amount,
    rate: state.macro.baseRate + r.spread + (variable ? 0 : 0.004),
    variable,
    spread: r.spread + (variable ? 0 : 0.004),
    monthsLeft: months,
    takenDay: state.day,
  };
  state.loans.push(loan);
  c.cash += amount;
  c.cashflow.financing += amount;
  emit(state, 'info', `Borrowed $${amount.toLocaleString()} at ${(loan.rate * 100).toFixed(2)}% (${variable ? 'variable' : 'fixed'}, ${months} months).`, {
    concept: 'interest',
    owner,
  });
  return { ok: true };
}

export function repayLoan(state: GameState, owner: number, loanId: number, amount?: number): { ok: boolean; reason?: string } {
  const c = state.companies[owner];
  const loan = state.loans.find((l) => l.id === loanId && l.owner === owner);
  if (!loan) return { ok: false, reason: 'Unknown loan' };
  const pay = Math.min(loan.balance, amount ?? loan.balance);
  if (c.cash < pay) return { ok: false, reason: 'Not enough cash' };
  c.cash -= pay;
  c.cashflow.financing -= pay;
  loan.balance -= pay;
  if (loan.balance < 0.5) state.loans = state.loans.filter((l) => l !== loan);
  return { ok: true };
}

/** Monthly installments: interest is an expense, principal is a financing outflow. */
export function serviceLoans(state: GameState): void {
  for (const loan of state.loans) {
    const c = state.companies[loan.owner];
    if (!c || c.bankrupt) continue;
    if (loan.variable) loan.rate = state.macro.baseRate + loan.spread;
    const payment = annuity(loan.balance, loan.rate, loan.monthsLeft);
    const interest = (loan.balance * loan.rate) / 12;
    const principal = Math.min(loan.balance, payment - interest);
    book(c, 'interest', interest);
    c.cash -= principal;
    c.cashflow.financing -= principal;
    loan.balance -= principal;
    loan.monthsLeft--;
  }
  state.loans = state.loans.filter((l) => l.balance > 0.5 && l.monthsLeft > 0);
}

export function monthlyPayment(state: GameState, owner: number): number {
  return state.loans
    .filter((l) => l.owner === owner)
    .reduce((a, l) => a + annuity(l.balance, l.variable ? state.macro.baseRate + l.spread : l.rate, l.monthsLeft), 0);
}

/** Overdraft interest rate (expensive on purpose). */
export function overdraftRate(state: GameState): number {
  return state.macro.baseRate + 0.12;
}
