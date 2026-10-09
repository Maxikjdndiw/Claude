import { BUILDING } from '../data/buildings';
import { EVENT } from '../data/events';
import { RESOURCES } from '../data/resources';
import { emit } from './events';
import { book } from './finance';
import { rollEvents } from './macro';
import type { Sim } from './sim';
import type { Building, Town } from './state';

/** Monthly: start random events and apply their one-off effects. */
export function runEvents(sim: Sim): void {
  const { state } = sim;
  for (const id of rollEvents(state, sim.rng)) {
    const def = EVENT[id];
    const active = state.activeEvents.find((e) => e.id === id)!;
    let text = def.text;
    for (const eff of def.effects) {
      if (eff.kind === 'discovery') {
        const hidden = state.deposits.filter((d) => d.hidden);
        if (!hidden.length) continue;
        const d = hidden[Math.floor(sim.rng.next() * hidden.length)];
        d.hidden = false;
        sim.depositsDirty = true;
        text = `Prospectors found ${RESOURCES[d.resource].name.toLowerCase()} in the ${d.y < sim.world.size / 2 ? 'north' : 'south'}${d.x < sim.world.size / 2 ? 'west' : 'east'}. First come, first served.`;
      } else if (eff.kind === 'disaster') {
        const town = disaster(sim, eff.disaster, def.days);
        if (!town) {
          // Nothing to hit: cancel quietly.
          state.activeEvents = state.activeEvents.filter((e) => e !== active);
          text = '';
          continue;
        }
        active.town = town.id;
        text = text.replace('{town}', town.name);
      }
    }
    if (text) emit(state, def.kind, `${def.title}: ${text}`, { concept: def.concept });
  }
}

function pick<T>(sim: Sim, arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(sim.rng.next() * arr.length)] : undefined;
}

function damage(sim: Sim, b: Building, days: number, share: number): void {
  const def = BUILDING[b.type];
  b.disabledUntil = Math.max(b.disabledUntil ?? 0, sim.state.day + days);
  const cost = def.cost * share * sim.state.priceLevel;
  book(sim.state.companies[b.owner], 'maintenance', cost);
  b.month.costs += cost;
  if (b.owner === 0)
    emit(sim.state, 'bad', `Your ${def.name} was damaged: repairs cost $${Math.round(cost).toLocaleString()} and take ${days} days.`, {
      concept: 'disaster',
      at: { x: b.x, y: b.y },
    });
}

function disaster(sim: Sim, kind: 'flood' | 'fire' | 'storm', days: number): Town | undefined {
  const { state, world } = sim;
  const size = world.size;
  const cell = (b: Building) => b.y * size + b.x;
  if (kind === 'flood') {
    const town = pick(sim, state.towns.filter((t) => world.freshDist[t.y * size + t.x] < 8));
    if (!town) return undefined;
    for (const b of state.buildings) {
      if (b.type === 'hq' || Math.hypot(b.x - town.x, b.y - town.y) > 16) continue;
      if (world.freshDist[cell(b)] <= 3) damage(sim, b, days, 0.04);
    }
    return town;
  }
  if (kind === 'fire') {
    const town = pick(sim, state.towns);
    if (!town) return undefined;
    // Burn the nearest forest patch.
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < 400; i++) {
      const x = Math.floor(town.x + (sim.rng.next() - 0.5) * 40);
      const y = Math.floor(town.y + (sim.rng.next() - 0.5) * 40);
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const c = y * size + x;
      const d = Math.hypot(x - town.x, y - town.y);
      if (world.forest[c] > 0.6 && d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best < 0) return undefined;
    const fx = best % size;
    const fy = (best / size) | 0;
    for (let y = fy - 6; y <= fy + 6; y++)
      for (let x = fx - 6; x <= fx + 6; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size || Math.hypot(x - fx, y - fy) > 6) continue;
        const c = y * size + x;
        if (world.forest[c] > 0) state.fields.forest[c] = Math.min(state.fields.forest[c] ?? world.forest[c], world.forest[c] * 0.08);
      }
    sim.forestDirty = true;
    for (const b of state.buildings) if (b.type !== 'hq' && Math.hypot(b.x - fx, b.y - fy) <= 7) damage(sim, b, days, 0.05);
    return town;
  }
  const town = pick(sim, state.towns.filter((t) => t.coastal));
  if (!town) return undefined;
  for (const b of state.buildings) {
    if (Math.hypot(b.x - town.x, b.y - town.y) > 18) continue;
    if (b.type === 'harbor' || b.type === 'fishery' || world.seaDist[cell(b)] <= 2) damage(sim, b, days, 0.06);
  }
  return town;
}
