import { ACHIEVEMENT } from '../data/achievements';
import { BUILDING } from '../data/buildings';
import { GOOD } from '../data/goods';
import { SCENARIO } from '../data/scenarios';
import { CONCEPTS } from '../data/concepts';
import { marketShares } from './ai';
import { emit } from './events';
import { companyValue, netProfit } from './finance';
import type { Sim } from './sim';
import type { GameState } from './state';

/** Progress of each scenario goal, 0..1, plus whether it is met right now. */
export function goalProgress(state: GameState): { label: string; progress: number; met: boolean }[] {
  const sc = state.scenario && SCENARIO[state.scenario.id];
  if (!sc) return [];
  const me = state.companies[0];
  return sc.goals.map((g) => {
    switch (g.kind) {
      case 'value': {
        const v = companyValue(state, me);
        return { label: `Company value $${g.amount.toLocaleString()}`, progress: Math.min(1, v / g.amount), met: v >= g.amount };
      }
      case 'cash':
        return { label: `Cash $${g.amount.toLocaleString()}`, progress: Math.min(1, me.cash / g.amount), met: me.cash >= g.amount };
      case 'survive': {
        const left = state.scenario!.deadline - state.day;
        const total = sc.years * 365;
        return { label: 'Stay solvent until the deadline', progress: Math.min(1, 1 - left / total), met: !me.bankrupt };
      }
      case 'share': {
        const sh = marketShares(state, g.good).get(0) ?? 0;
        const streak = state.scenario!.streak;
        return {
          label: `${Math.round(g.share * 100)}% of ${GOOD[g.good].name.toLowerCase()} sales for ${g.months} months (now ${Math.round(sh * 100)}%, ${streak}/${g.months})`,
          progress: Math.min(1, (sh / g.share) * 0.5 + (streak / g.months) * 0.5),
          met: streak >= g.months,
        };
      }
      case 'ipoFirst': {
        const rival = state.companies.some((c) => c.id !== 0 && (c.equity.ipoDay ?? Infinity) < (me.equity.ipoDay ?? Infinity));
        return { label: 'List your company before any rival', progress: me.equity.listed ? 1 : 0, met: me.equity.listed && !rival };
      }
    }
  });
}

/** Monthly scenario evaluation. */
export function checkScenario(sim: Sim): void {
  const { state } = sim;
  const sc = state.scenario && SCENARIO[state.scenario.id];
  if (!sc || state.scenario!.result || state.gameOver) return;
  // Market-share streaks.
  for (const g of sc.goals) {
    if (g.kind !== 'share') continue;
    const sh = marketShares(state, g.good).get(0) ?? 0;
    state.scenario!.streak = sh >= g.share ? state.scenario!.streak + 1 : 0;
  }
  // A rival listing first ends an IPO race.
  const lostRace = sc.goals.some(
    (g) => g.kind === 'ipoFirst' && !state.companies[0].equity.listed && state.companies.some((c) => c.id !== 0 && c.equity.listed),
  );
  const progress = goalProgress(state);
  const timeUp = state.day >= state.scenario!.deadline;
  const onlySurvival = sc.goals.some((g) => g.kind === 'survive');
  const allMet = progress.every((p) => p.met);
  if (lostRace) return finish(state, false, 'A rival listed its shares before you.');
  if (allMet && (!onlySurvival || timeUp)) return finish(state, true, `You completed "${sc.title}"!`);
  if (timeUp) return finish(state, false, `Time is up: "${sc.title}" was not completed.`);
}

function finish(state: GameState, won: boolean, reason: string): void {
  state.scenario!.result = won ? 'won' : 'lost';
  state.gameOver = { reason, day: state.day, won };
  if (won) unlock(state, 'scenario');
}

export function unlock(state: GameState, id: string): void {
  if (state.achievements.includes(id) || !ACHIEVEMENT[id]) return;
  state.achievements.push(id);
  const a = ACHIEVEMENT[id];
  emit(state, 'good', `🏆 Achievement unlocked: ${a.icon} ${a.title}. ${a.description}`);
}

/** Achievement checks (run every few days). */
export function checkAchievements(sim: Sim): void {
  const { state } = sim;
  const me = state.companies[0];
  if (me.hq) unlock(state, 'founder');
  const mine = state.buildings.filter((b) => b.owner === 0 && b.buildLeft === 0 && BUILDING[b.type].recipe);
  if (mine.length >= 1) unlock(state, 'first_plant');
  if (mine.length >= 5) unlock(state, 'five_plants');
  const cats = new Set(mine.filter((b) => b.rate > 0).flatMap((b) => Object.keys(BUILDING[b.type].recipe!.outputs).map((g) => GOOD[g].category)));
  if (cats.has('raw') && cats.has('intermediate') && cats.has('consumer')) unlock(state, 'chain');
  const lines = state.lines.filter((l) => l.owner === 0);
  if (lines.length) unlock(state, 'trucker');
  if (lines.some((l) => l.mode === 'rail')) unlock(state, 'rail');
  if (lines.some((l) => l.mode === 'sea')) unlock(state, 'ship');
  if (me.techs.length >= 5) unlock(state, 'researcher');
  const v = companyValue(state, me);
  if (v >= 500_000) unlock(state, 'value_500k');
  if (v >= 1_000_000) unlock(state, 'value_1m');
  if (v >= 10_000_000) unlock(state, 'value_10m');
  const last = me.history[me.history.length - 1];
  if (last && netProfit(last.ledger) > 0) {
    unlock(state, 'profit');
    if (state.macro.phase === 'recession') unlock(state, 'survivor');
  }
  const hasDebt = state.loans.some((l) => l.owner === 0);
  if (hasDebt) {
    unlock(state, 'borrower');
    state.flags.borrowed = true;
  } else if (state.flags.borrowed) unlock(state, 'debt_free');
  if (me.equity.listed) unlock(state, 'ipo');
  if (me.founderWealth > 0) unlock(state, 'dividend');
  if (state.companies.some((c) => c.acquiredBy === 0)) unlock(state, 'takeover');
  if (Object.keys(state.learning.seen).length >= Math.min(20, CONCEPTS.length)) unlock(state, 'scholar');
  for (const d of state.deposits) {
    if (d.pitDepth !== undefined && d.amount < d.initial * 0.5 && state.buildings.some((b) => b.owner === 0 && BUILDING[b.type].pit)) {
      unlock(state, 'miner');
      break;
    }
  }
  if (state.day % 30 === 0) {
    for (const g of Object.keys(GOOD)) {
      if ((marketShares(state, g).get(0) ?? 0) >= 0.5) {
        unlock(state, 'dominant');
        break;
      }
    }
  }
}
