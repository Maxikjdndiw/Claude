import { ECON } from '../data/economy';

const DAY_MS = 86_400_000;
const START = Date.UTC(ECON.startYear, 0, 1);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dateOf(day: number): Date {
  return new Date(START + day * DAY_MS);
}

export function formatDate(day: number): string {
  const d = dateOf(day);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function monthLabel(day: number): string {
  const d = dateOf(day);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** True when `day` is the first day of a month. */
export function isMonthStart(day: number): boolean {
  return dateOf(day).getUTCDate() === 1;
}

export function isYearStart(day: number): boolean {
  const d = dateOf(day);
  return d.getUTCDate() === 1 && d.getUTCMonth() === 0;
}

export function yearOf(day: number): number {
  return dateOf(day).getUTCFullYear();
}
