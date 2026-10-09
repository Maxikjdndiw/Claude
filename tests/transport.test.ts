import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/sim/world/generate';
import { startNewGame } from '../src/sim/setup';
import { build, checkPlacement, foundCompany } from '../src/sim/commands';
import { buildRoad, planRoad, townAccess } from '../src/sim/roads';
import { createLine, estimateLine } from '../src/sim/transport';
import type { Sim } from '../src/sim/sim';

function place(sim: Sim, type: string, x: number, y: number) {
  for (let r = 0; r < 20; r++)
    for (let oy = -r; oy <= r; oy++)
      for (let ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        if (checkPlacement(sim, 0, type, x + ox, y + oy).ok) return build(sim, 0, type, x + ox, y + oy).building!;
      }
  throw new Error('no spot for ' + type);
}

describe('roads and trucks', () => {
  it('generates country roads that connect towns', () => {
    const sim = startNewGame(generateWorld(42), 'T');
    expect(sim.state.roads.length).toBeGreaterThan(50);
    const connected = sim.state.towns.filter((t) => townAccess(sim, t.id).length > 0);
    expect(connected.length).toBeGreaterThanOrEqual(sim.state.towns.length - 1);
  });

  it('longer routes cost more per ton', () => {
    expect(estimateLine(60).costPerTon).toBeGreaterThan(estimateLine(20).costPerTon * 2);
  });

  it('trucks carry flour from a mill to a distant town and earn revenue', () => {
    const sim = startNewGame(generateWorld(42), 'T');
    const [a, b] = [sim.state.towns[0], sim.state.towns[1]];
    expect(foundCompany(sim, 0, a.x + 4, a.y + 4).ok).toBe(true);
    sim.state.companies[0].cash = 1e6;
    const mill = place(sim, 'mill', a.x + 5, a.y + 6);
    // Road from the mill to the nearest road cell of town A.
    const millCell = mill.y * sim.world.size + mill.x; // clicking the building snaps to a free neighbor cell
    const target = townAccess(sim, a.id)[0];
    expect(planRoad(sim, millCell, target)).not.toBeNull();
    expect(buildRoad(sim, 0, millCell, target).ok).toBe(true);
    const res = createLine(sim, 0, { kind: 'building', id: mill.id }, { kind: 'town', id: b.id }, 'flour', 3);
    expect(res.ok, res.reason).toBe(true);
    for (let i = 0; i < 120; i++) sim.step();
    const line = res.line!;
    expect(line.last.delivered + line.month.delivered).toBeGreaterThan(10);
    expect(line.last.revenue).toBeGreaterThan(0);
  });
});
