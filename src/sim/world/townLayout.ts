import { BIOMES, BIOME_IDS } from '../../data/biomes';
import { hash2 } from '../rng';
import { cellSlope } from './generate';
import type { World } from './types';

export interface TownLayout {
  town: number;
  /** Cells covered by houses (cell index y*size+x). */
  cells: number[];
}

export function houseCount(population: number): number {
  return Math.round(6 + Math.sqrt(population) * 0.45);
}

/**
 * Lay out town houses in a spiral around each town center. Deterministic, so
 * the simulation (occupancy) and renderer agree on where houses stand.
 */
export function layoutTowns(w: World, towns: { id: number; x: number; y: number; population: number }[]): TownLayout[] {
  const used = new Set<number>();
  const out: TownLayout[] = [];
  for (const t of towns) {
    const target = houseCount(t.population);
    const cells: number[] = [];
    for (let r = 0; r < 16 && cells.length < target; r++) {
      for (let oy = -r; oy <= r && cells.length < target; oy++) {
        for (let ox = -r; ox <= r && cells.length < target; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const x = t.x + ox;
          const y = t.y + oy;
          if (x < 1 || y < 1 || x >= w.size - 1 || y >= w.size - 1) continue;
          const c = y * w.size + x;
          if (used.has(c)) continue;
          const b = BIOME_IDS[w.biome[c]];
          if (!BIOMES[b].buildable || cellSlope(w, x, y) > 1) continue;
          // Leave gaps for streets.
          if ((ox + oy) % 3 === 0 && r > 0 && hash2(x, y, 31) < 0.6) continue;
          cells.push(c);
          used.add(c);
        }
      }
    }
    out.push({ town: t.id, cells });
  }
  return out;
}
