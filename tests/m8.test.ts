import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/sim/world/generate';
import { applyScenario, startNewGame } from '../src/sim/setup';
import { build, checkPlacement, foundCompany } from '../src/sim/commands';
import { spawnBots } from '../src/sim/ai';
import { Sim } from '../src/sim/sim';
import type { GameState } from '../src/sim/state';
import { goalProgress } from '../src/sim/goals';

function game() {
  const sim = startNewGame(generateWorld(42), 'P', 'normal');
  const t = sim.state.towns[0];
  [[7, 2], [-7, 2], [2, 7], [2, -7]].some(([dx, dy]) => foundCompany(sim, 0, t.x + dx, t.y + dy).ok);
  spawnBots(sim);
  const hq = sim.state.companies[0].hq!;
  for (const type of ['farm', 'mill', 'bakery']) {
    let done = false;
    for (let d = 0; d < 12 && !done; d++)
      for (let oy = -d; oy <= d && !done; oy++)
        for (let ox = -d; ox <= d && !done; ox++)
          if (checkPlacement(sim, 0, type, hq.x + ox, hq.y + oy).ok) done = build(sim, 0, type, hq.x + ox, hq.y + oy).ok;
  }
  return sim;
}

describe('milestone 8', () => {
  it('save -> load round trip continues identically (deterministic)', () => {
    const sim = game();
    for (let i = 0; i < 200; i++) sim.step();
    const saved = JSON.parse(JSON.stringify({ ...sim.state, events: [] })) as GameState;
    const loaded = new Sim(generateWorld(saved.seed), saved);
    for (let i = 0; i < 120; i++) {
      sim.step();
      loaded.step();
    }
    sim.state.events = [];
    loaded.state.events = [];
    expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(sim.state));
  });

  it('scenarios set up start conditions and track goals', () => {
    const sim = startNewGame(generateWorld(42), 'P', 'normal');
    applyScenario(sim, 'storm');
    expect(sim.state.loans.length).toBe(1);
    expect(sim.state.scenario?.deadline).toBe(5 * 365);
    expect(sim.state.activeEvents.some((e) => e.id === 'recession' && e.start === 420)).toBe(true);
    expect(goalProgress(sim.state).length).toBe(2);
    // The recession must not act before it starts.
    for (let i = 0; i < 60; i++) sim.step();
    expect(sim.state.macro.phase).toBe('normal');
  });
});
