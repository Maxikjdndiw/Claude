import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/sim/world/generate';
import { startNewGame } from '../src/sim/setup';
import { build, checkPlacement } from '../src/sim/commands';
import { estimateLine } from '../src/sim/transport';
import { buyLicense } from '../src/sim/tech';
import { potentialOutput } from '../src/sim/production';
import { forestAt, survey } from '../src/sim/resources';
import type { Sim } from '../src/sim/sim';

function placeNear(sim: Sim, type: string, x: number, y: number, r = 12) {
  for (let d = 0; d < r; d++)
    for (let oy = -d; oy <= d; oy++)
      for (let ox = -d; ox <= d; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== d) continue;
        if (checkPlacement(sim, 0, type, x + ox, y + oy).ok) return build(sim, 0, type, x + ox, y + oy).building!;
      }
  return null;
}

/** Put an HQ next to a point (ignores the build range for test setup). */
function hqAt(sim: Sim, x: number, y: number) {
  for (let d = 0; d < 10; d++)
    for (let oy = -d; oy <= d; oy++)
      for (let ox = -d; ox <= d; ox++) {
        const r = build(sim, 0, 'hq', x + ox, y + oy);
        if (r.ok) return r.building!;
      }
  throw new Error('no hq');
}

describe('milestone 4', () => {
  it('a mine depletes its deposit and digs a pit into the terrain', () => {
    for (const seed of [1, 42, 777, 2024]) {
      const sim = startNewGame(generateWorld(seed), 'T');
      sim.state.companies[0].cash = 1e7;
      const dep = sim.state.deposits.find((d) => d.resource === 'iron' && !d.hidden);
      if (!dep) continue;
      hqAt(sim, dep.x + 6, dep.y);
      const mine = placeNear(sim, 'iron_mine', dep.x + 3, dep.y, 8);
      if (!mine) continue;
      mine.town = sim.state.towns[0].id; // workers from anywhere for the test
      const h0 = sim.world.heights[(dep.y) * sim.world.n + dep.x];
      for (let i = 0; i < 300; i++) sim.step();
      expect(dep.amount).toBeLessThan(dep.initial);
      expect(sim.world.heights[dep.y * sim.world.n + dep.x]).toBeLessThan(h0 - 0.3);
      expect(Object.keys(sim.state.terrainEdits).length).toBeGreaterThan(10);
      return;
    }
    throw new Error('no seed with a minable iron deposit');
  });

  it('logging thins the forest around a lumber camp', () => {
    const sim = startNewGame(generateWorld(42), 'T');
    sim.state.companies[0].cash = 1e7;
    const w = sim.world;
    let cell = -1;
    for (let i = 0; i < w.forest.length; i++) if (w.forest[i] > 0.9) { cell = i; break; }
    const x = cell % w.size;
    const y = Math.floor(cell / w.size);
    hqAt(sim, x + 4, y);
    const camp = placeNear(sim, 'lumber', x, y)!;
    expect(camp).toBeTruthy();
    camp.town = 0;
    camp.buildLeft = 0;
    camp.workers = camp.targetWorkers = 10;
    const before = forestAt(sim.state, w, cell);
    for (let i = 0; i < 15; i++) sim.step();
    expect(camp.rate).toBeGreaterThan(0);
    const thinned = Object.keys(sim.state.fields.forest).map(Number);
    expect(thinned.length).toBeGreaterThan(2);
    expect(thinned.every((k) => sim.state.fields.forest[k] < w.forest[k])).toBe(true);
    expect(before).toBeGreaterThan(0);
  });

  it('technology raises productivity', () => {
    const sim = startNewGame(generateWorld(42), 'T');
    const t = sim.state.towns[0];
    sim.state.companies[0].cash = 1e7;
    hqAt(sim, t.x + 4, t.y + 4);
    const farm = placeNear(sim, 'farm', t.x + 6, t.y + 6)!;
    const before = potentialOutput(sim.state, farm, 8);
    expect(buyLicense(sim.state, 0, 'mech_farming').ok).toBe(true);
    expect(potentialOutput(sim.state, farm, 8)).toBeCloseTo(before * 1.25, 5);
  });

  it('rail and ships are much cheaper per ton than trucks over distance', () => {
    const truck = estimateLine(60, 'truck').costPerTon;
    expect(estimateLine(60, 'train').costPerTon).toBeLessThan(truck * 0.5);
    expect(estimateLine(60, 'ship').costPerTon).toBeLessThan(truck * 0.5);
  });

  it('surveying reveals hidden deposits', () => {
    const sim = startNewGame(generateWorld(42), 'T');
    const hidden = sim.state.deposits.find((d) => d.hidden)!;
    expect(survey(sim, 0, hidden.x, hidden.y).ok).toBe(true);
    expect(hidden.hidden).toBe(false);
  });
});
