import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/sim/world/generate';
import { BIOME_IDS } from '../src/data/biomes';

describe('world generation', () => {
  it('is deterministic for a seed', () => {
    const a = generateWorld(1234);
    const b = generateWorld(1234);
    expect(a.heights).toEqual(b.heights);
    expect(a.towns).toEqual(b.towns);
    expect(a.deposits).toEqual(b.deposits);
  });

  it.each([1, 42, 777, 2024, 99999])('seed %i has varied terrain, towns and deposits', (seed) => {
    const w = generateWorld(seed);
    const counts: Record<string, number> = {};
    for (const b of w.biome) counts[BIOME_IDS[b]] = (counts[BIOME_IDS[b]] ?? 0) + 1;
    const total = w.size * w.size;
    const share = (k: string) => (counts[k] ?? 0) / total;
    expect(share('ocean') + share('deep')).toBeGreaterThan(0.1);
    expect(share('mountain') + share('snow')).toBeGreaterThan(0.01);
    expect(share('forest')).toBeGreaterThan(0.03);
    expect(share('plains') + share('fertile')).toBeGreaterThan(0.12);
    expect(counts['river'] ?? 0).toBeGreaterThan(20);
    expect(w.towns.length).toBeGreaterThanOrEqual(4);
    const kinds = new Set(w.deposits.map((d) => d.resource));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });
});
