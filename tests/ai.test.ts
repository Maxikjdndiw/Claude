import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/sim/world/generate';
import { startNewGame } from '../src/sim/setup';
import { foundCompany } from '../src/sim/commands';
import { spawnBots } from '../src/sim/ai';
import { companyValue } from '../src/sim/finance';
import { BUILDING } from '../src/data/buildings';

describe('AI competitors', () => {
  it.each(['easy', 'normal', 'hard'] as const)('bots found companies and invest (%s)', (difficulty) => {
    const sim = startNewGame(generateWorld(42), 'Player', difficulty);
    const t = sim.state.towns[0];
    const ok = [[7, 2], [-7, 2], [2, 7], [2, -7], [6, 6], [-6, -6]].some(([dx, dy]) => foundCompany(sim, 0, t.x + dx, t.y + dy).ok);
    expect(ok).toBe(true);
    spawnBots(sim);
    const bots = sim.state.companies.filter((c) => c.ai);
    expect(bots.length).toBe(sim.state.settings.bots);
    expect(bots.every((b) => b.hq)).toBe(true);
    for (let i = 0; i < 365 * 2; i++) sim.step();
    const built = sim.state.buildings.filter((b) => b.owner > 0 && b.type !== 'hq');
    const summary = bots.map((b) => ({
      name: b.name,
      p: b.ai!.personality,
      s: b.ai!.specialty,
      cash: Math.round(b.cash),
      value: Math.round(companyValue(sim.state, b)),
      bankrupt: b.bankrupt,
      buildings: sim.state.buildings.filter((x) => x.owner === b.id).map((x) => BUILDING[x.type].id).join(','),
    }));
    // eslint-disable-next-line no-console
    console.log(difficulty, JSON.stringify(summary, null, 1));
    expect(built.length).toBeGreaterThan(1);
  });
});
