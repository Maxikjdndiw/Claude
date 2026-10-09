import { ECON } from '../data/economy';
import { EVENT, EVENTS, type EventEffect } from '../data/events';
import type { SimRng } from './rng';
import type { GameState, Phase } from './state';

/**
 * The macroeconomy:
 *  - A business cycle (boom / normal / recession) moves the output gap, which
 *    shifts household incomes (demand) and unemployment (wages).
 *  - Inflation rises when the economy runs hot and drifts toward 2% otherwise;
 *    the price level compounds daily, so all nominal prices and wages rise.
 *  - The central bank follows a Taylor rule: it raises its rate when inflation
 *    is above target or the economy overheats, and cuts it in recessions.
 */

const TARGET_GAP: Record<Phase, number> = { boom: 0.04, normal: 0, recession: -0.05 };
export const INFLATION_TARGET = 0.02;
const NEUTRAL_REAL_RATE = 0.015;

/** Effects of all currently active events. */
export function activeEffects(state: GameState): EventEffect[] {
  return state.activeEvents.flatMap((e) => EVENT[e.id]?.effects ?? []);
}

export function supplyMultiplier(state: GameState, good: string): number {
  let m = 1;
  for (const e of activeEffects(state)) if (e.kind === 'supply' && e.good === good) m *= e.mult;
  return m;
}

export function demandMultiplier(state: GameState, good: string): number {
  let m = 1;
  for (const e of activeEffects(state)) if (e.kind === 'demand' && e.good === good) m *= e.mult;
  return m;
}

export function maintenanceMultiplier(state: GameState, type: string): number {
  let m = 1;
  for (const e of activeEffects(state)) if (e.kind === 'maintenance' && e.target === type) m *= e.mult;
  return m;
}

export function wageFloor(state: GameState): number {
  let f = 0;
  for (const e of activeEffects(state)) if (e.kind === 'wageFloor') f = Math.max(f, e.mult);
  return f * ECON.baseWage * state.priceLevel;
}

/** Household income factor from the business cycle. */
export function incomeFactor(state: GameState): number {
  return 1 + 2 * state.macro.gap;
}

/** Daily: smooth the output gap toward the phase target; compound prices. */
export function updateMacroDaily(state: GameState, rng: SimRng): void {
  const m = state.macro;
  m.gap += (TARGET_GAP[m.phase] - m.gap) * 0.012 + rng.normal() * 0.0006;
  const shock = activeEffects(state).reduce((a, e) => a + (e.kind === 'inflation' ? e.add : 0), 0);
  const target = INFLATION_TARGET + 0.6 * m.gap + shock;
  m.inflation += (target - m.inflation) * 0.01;
  state.priceLevel *= 1 + m.inflation / 365;
}

/** Monthly: phase transitions and central bank decision. */
export function updateMacroMonthly(state: GameState, rng: SimRng): void {
  const m = state.macro;
  const forced = activeEffects(state).find((e) => e.kind === 'phase') as { phase: Phase } | undefined;
  if (forced) m.phase = forced.phase;
  else if (m.phase !== 'normal' && rng.chance(0.08)) m.phase = 'normal';
  // Taylor rule, moved in quarter-point steps.
  const taylor = NEUTRAL_REAL_RATE + m.inflation + 0.5 * (m.inflation - INFLATION_TARGET) + 0.5 * m.gap;
  const target = Math.min(0.14, Math.max(0.0025, taylor));
  const step = Math.max(-0.005, Math.min(0.005, target - m.baseRate));
  m.baseRate = Math.round((m.baseRate + Math.round(step / 0.0025) * 0.0025) * 10000) / 10000;
  m.history.push({ day: state.day, gap: m.gap, inflation: m.inflation, baseRate: m.baseRate, phase: m.phase, priceLevel: state.priceLevel });
  if (m.history.length > 360) m.history.shift();
}

/** Roll for new random events (monthly); returns newly started event ids. */
export function rollEvents(state: GameState, rng: SimRng): string[] {
  state.activeEvents = state.activeEvents.filter((e) => e.until > state.day);
  const started: string[] = [];
  for (const def of EVENTS) {
    if (state.day < (def.minDay ?? 0)) continue;
    if (state.activeEvents.some((e) => e.id === def.id)) continue;
    if (def.exclusive && state.activeEvents.some((e) => EVENT[e.id].exclusive)) continue;
    if (!rng.chance(def.chance)) continue;
    state.activeEvents.push({ id: def.id, start: state.day, until: state.day + def.days });
    started.push(def.id);
  }
  return started;
}
