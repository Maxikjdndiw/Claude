import { BIOMES, BIOME_IDS, type BiomeId } from '../../data/biomes';
import { DEPOSITS, RESOURCES } from '../../data/resources';
import { cellSlope } from './generate';
import type { CellInfo, DepositSeed, TownSite, World } from './types';

export function inBounds(w: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < w.size && y < w.size;
}

export function biomeOf(w: World, x: number, y: number): BiomeId {
  return BIOME_IDS[w.biome[y * w.size + x]];
}

/** Bilinear terrain height at a continuous grid position. */
export function heightAt(w: World, gx: number, gy: number): number {
  const x = Math.min(w.size - 1e-4, Math.max(0, gx));
  const y = Math.min(w.size - 1e-4, Math.max(0, gy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const n = w.n;
  const h = w.heights;
  const a = h[y0 * n + x0];
  const b = h[y0 * n + x0 + 1];
  const c = h[(y0 + 1) * n + x0];
  const d = h[(y0 + 1) * n + x0 + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/** Height of the visible surface (water surface where wet, terrain otherwise). */
export function surfaceAt(w: World, gx: number, gy: number): number {
  const t = heightAt(w, gx, gy);
  const ix = Math.min(w.n - 1, Math.max(0, Math.round(gx)));
  const iy = Math.min(w.n - 1, Math.max(0, Math.round(gy)));
  const wl = w.waterLevel[iy * w.n + ix];
  return Number.isNaN(wl) ? t : Math.max(t, wl);
}

export function cellInfo(w: World, x: number, y: number): CellInfo {
  const c = y * w.size + x;
  return {
    x,
    y,
    biome: BIOME_IDS[w.biome[c]],
    height: heightAt(w, x + 0.5, y + 0.5),
    slope: cellSlope(w, x, y),
    fertility: w.fertility[c],
    forest: w.forest[c],
    fish: w.fish[c],
    freshDist: w.freshDist[c],
    seaDist: w.seaDist[c],
  };
}

export interface SiteAnalysis {
  x: number;
  y: number;
  biome: BiomeId;
  radius: number;
  buildableShare: number;
  avgFertility: number;
  forestShare: number;
  fishStock: number;
  coastal: boolean;
  river: boolean;
  deposits: { resource: string; name: string; color: string; count: number; amount: number }[];
  hiddenHint: number;
  towns: { town: TownSite; distance: number }[];
  strengths: string[];
  weaknesses: string[];
}

/** Summarize what a starting location offers. Hidden deposits are not revealed. */
export function analyzeSite(w: World, x: number, y: number, radius: number, deposits: DepositSeed[]): SiteAnalysis {
  let cells = 0;
  let land = 0;
  let buildable = 0;
  let fert = 0;
  let fertCells = 0;
  let forest = 0;
  let fish = 0;
  let river = false;
  for (let oy = -radius; oy <= radius; oy++) {
    for (let ox = -radius; ox <= radius; ox++) {
      if (ox * ox + oy * oy > radius * radius) continue;
      const cx = x + ox;
      const cy = y + oy;
      if (!inBounds(w, cx, cy)) continue;
      cells++;
      const c = cy * w.size + cx;
      const b = BIOME_IDS[w.biome[c]];
      if (!BIOMES[b].water) land++;
      if (BIOMES[b].buildable && cellSlope(w, cx, cy) < 1.2) buildable++;
      if (b === 'plains' || b === 'fertile') {
        fert += w.fertility[c];
        fertCells++;
      }
      if (w.forest[c] > 0.4) forest++;
      fish += w.fish[c];
      if (b === 'river' || b === 'lake') river = true;
    }
  }
  const byRes = new Map<string, { count: number; amount: number }>();
  let hiddenHint = 0;
  for (const d of deposits) {
    if (Math.hypot(d.x - x, d.y - y) > radius + d.radius) continue;
    if (d.hidden) {
      hiddenHint++;
      continue;
    }
    const e = byRes.get(d.resource) ?? { count: 0, amount: 0 };
    e.count++;
    e.amount += d.amount;
    byRes.set(d.resource, e);
  }
  const depositList = DEPOSITS.filter((d) => byRes.has(d.id)).map((d) => ({
    resource: d.id,
    name: d.name,
    color: d.color,
    count: byRes.get(d.id)!.count,
    amount: byRes.get(d.id)!.amount,
  }));
  const towns = w.towns
    .map((town) => ({ town, distance: Math.hypot(town.x - x, town.y - y) }))
    .sort((a, b) => a.distance - b.distance);

  const c0 = y * w.size + x;
  const coastal = w.seaDist[c0] <= radius * 0.6;
  const buildableShare = land ? buildable / land : 0;
  const avgFertility = fertCells ? fert / fertCells : 0;
  const forestShare = land ? forest / land : 0;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (avgFertility > 0.55 && fertCells > cells * 0.2) strengths.push('Rich farmland: ideal for grain farms');
  if (forestShare > 0.25) strengths.push('Dense forest: plenty of timber');
  if (fish > 25) strengths.push('Good fishing waters nearby');
  for (const d of depositList) strengths.push(`${d.name} deposit within reach`);
  if (coastal) strengths.push('Coastal: a harbor can ship goods by sea');
  if (river) strengths.push('Fresh water nearby');
  const near = towns[0];
  if (near && near.distance < 18) strengths.push(`Close to ${near.town.name} (customers & workers)`);
  if (near && near.distance > 35) weaknesses.push('Far from any town: high transport costs');
  if (buildableShare < 0.45) weaknesses.push('Rugged terrain: limited building space');
  if (!depositList.length && avgFertility < 0.4 && forestShare < 0.1) weaknesses.push('Few visible natural resources');
  if (hiddenHint > 0) strengths.push('Geologists suspect hidden deposits: survey!');

  return {
    x,
    y,
    biome: BIOME_IDS[w.biome[c0]],
    radius,
    buildableShare,
    avgFertility,
    forestShare,
    fishStock: fish,
    coastal,
    river,
    deposits: depositList,
    hiddenHint,
    towns: towns.slice(0, 3),
    strengths,
    weaknesses,
  };
}

export const resourceName = (id: string) => RESOURCES[id]?.name ?? id;
