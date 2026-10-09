import { createNoise2D } from 'simplex-noise';
import { biomeIndex, BIOME_IDS, type BiomeId } from '../../data/biomes';
import { DEPOSITS } from '../../data/resources';
import { TOWN_NAMES } from '../../data/names';
import { hash2, mulberry32, type Rng } from '../rng';
import { MinHeap } from './heap';
import { Water, type DepositSeed, type TownSite, type World } from './types';

export const DEFAULT_SIZE = 160;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves: number): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

const N8 = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
] as const;

/** Generate a complete world from a seed. Pure and deterministic. */
export function generateWorld(seed: number, size = DEFAULT_SIZE): World {
  const rng = mulberry32(seed);
  const noise = createNoise2D(rng);
  const warpNoise = createNoise2D(rng);
  const ridgeNoise = createNoise2D(rng);
  const moistNoise = createNoise2D(rng);
  const detailNoise = createNoise2D(rng);
  const regionNoise = createNoise2D(rng);

  const n = size + 1;
  const nv = n * n;
  const heights = new Float32Array(nv);
  const moisture = new Float32Array(nv);
  const oceanAngle = rng() * Math.PI * 2;
  const oc = Math.cos(oceanAngle);
  const os = Math.sin(oceanAngle);

  // --- 1. Base heightmap -------------------------------------------------
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / size;
      const v = y / size;
      const wx = u + 0.12 * warpNoise(u * 2.2, v * 2.2);
      const wy = v + 0.12 * warpNoise(u * 2.2 + 7.3, v * 2.2 - 3.1);
      const base = fbm(noise, wx * 2.4, wy * 2.4, 5);
      const dx = u - 0.5;
      const dy = v - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const side = dx * oc + dy * os;
      let e = base * 0.45 + 0.4 - smoothstep(0.72, 1.08, d) * 1.05 - Math.max(0, side - 0.12) * 0.9;

      let h: number;
      if (e > 0) {
        const r = 1 - Math.abs(fbm(ridgeNoise, wx * 3.3 + 11, wy * 3.3 - 7, 4));
        const ridge = r * r * r;
        const mask = smoothstep(0.08, 0.35, e);
        const region = smoothstep(0.05, 0.55, fbm(regionNoise, wx * 1.6 + 2, wy * 1.6 + 9, 3));
        const hills = smoothstep(0.04, 0.3, e) * (0.5 + 0.5 * detailNoise(wx * 7, wy * 7));
        h = 0.35 + e * 2.2 + hills * (1.0 + region * 1.6) + mask * region * ridge * 18;
      } else {
        h = Math.max(-6.5, e * 14 - 0.2);
      }
      heights[y * n + x] = h;
      moisture[y * n + x] = 0.5 + 0.5 * fbm(moistNoise, u * 3 + 3.7, v * 3 - 1.2, 4);
    }
  }

  // Carve a few basins on low land so most maps get some lakes.
  const basinCount = 2 + Math.floor(rng() * 3);
  for (let b = 0, tries = 0; b < basinCount && tries < 200; tries++) {
    const bx = Math.floor(size * (0.15 + rng() * 0.7));
    const by = Math.floor(size * (0.15 + rng() * 0.7));
    const h0 = heights[by * n + bx];
    if (h0 < 0.8 || h0 > 4.5) continue;
    const rad = 3 + rng() * 4;
    for (let y = Math.max(0, by - 10); y <= Math.min(size, by + 10); y++) {
      for (let x = Math.max(0, bx - 10); x <= Math.min(size, bx + 10); x++) {
        const dd = Math.hypot(x - bx, y - by) / rad;
        if (dd < 1.6) heights[y * n + x] -= 1.6 * Math.exp(-dd * dd * 1.6);
      }
    }
    b++;
  }

  // --- 2. Ocean (connected to the map edge, below sea level) -------------
  const water = new Uint8Array(nv);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    for (const idx of [i, (n - 1) * n + i, i * n, i * n + n - 1]) {
      if (heights[idx] < 0 && water[idx] === Water.None) {
        water[idx] = Water.Ocean;
        stack.push(idx);
      }
    }
  }
  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % n;
    const y = (idx / n) | 0;
    for (const [ox, oy] of N8) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const j = ny * n + nx;
      if (water[j] === Water.None && heights[j] < 0) {
        water[j] = Water.Ocean;
        stack.push(j);
      }
    }
  }

  // --- 3. Priority-flood: fill depressions, derive drainage --------------
  const filled = new Float32Array(heights);
  const visited = new Uint8Array(nv);
  const down = new Int32Array(nv).fill(-1);
  const order: number[] = [];
  const heap = new MinHeap();
  for (let i = 0; i < nv; i++) {
    const x = i % n;
    const y = (i / n) | 0;
    const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
    if (water[i] === Water.Ocean || edge) {
      visited[i] = 1;
      if (water[i] === Water.Ocean) filled[i] = 0;
      heap.push(i, filled[i]);
    }
  }
  const EPS = 1e-3;
  while (heap.size) {
    const i = heap.pop();
    order.push(i);
    const x = i % n;
    const y = (i / n) | 0;
    for (const [ox, oy] of N8) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const j = ny * n + nx;
      if (visited[j]) continue;
      visited[j] = 1;
      filled[j] = Math.max(heights[j], filled[i] + EPS);
      down[j] = i;
      heap.push(j, filled[j]);
    }
  }

  // Lakes: deep enough depressions. Shallow ones are simply filled in.
  const waterLevel = new Float32Array(nv).fill(NaN);
  for (let i = 0; i < nv; i++) {
    if (water[i] === Water.Ocean) {
      waterLevel[i] = 0;
      continue;
    }
    const depth = filled[i] - heights[i];
    if (depth > 0.3 && filled[i] < 4.5) {
      water[i] = Water.Lake;
      waterLevel[i] = filled[i];
    } else if (depth > 0) {
      // Fill shallow (or high mountain) depressions, keeping a gentle hollow.
      heights[i] = depth > 0.3 ? filled[i] - 0.05 : filled[i];
    }
  }

  // Flow accumulation (process from highest to lowest).
  const flow = new Float32Array(nv);
  for (let i = 0; i < nv; i++) flow[i] = 0.6 + moisture[i];
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k];
    const d = down[i];
    if (d >= 0) flow[d] += flow[i];
  }

  // --- 4. Rivers ------------------------------------------------------------
  const riverThreshold = (size * size) / 95;
  for (let i = 0; i < nv; i++) {
    if (water[i] !== Water.None || flow[i] < riverThreshold) continue;
    const strength = Math.log2(flow[i] / riverThreshold);
    const surface = filled[i];
    water[i] = Water.River;
    waterLevel[i] = surface - 0.08;
    heights[i] = surface - 0.38 - Math.min(0.5, strength * 0.12);
  }
  // Soften river banks a little.
  for (let i = 0; i < nv; i++) {
    if (water[i] !== Water.River) continue;
    const x = i % n;
    const y = (i / n) | 0;
    for (const [ox, oy] of N8) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const j = ny * n + nx;
      if (water[j] === Water.None) heights[j] = Math.min(heights[j], waterLevel[i] + 0.35);
    }
  }

  // --- 5. Cells: biomes and distance fields -------------------------------
  const cells = size * size;
  const biome = new Uint8Array(cells);
  const freshDist = new Float32Array(cells).fill(1e9);
  const seaDist = new Float32Array(cells).fill(1e9);
  const freshQ: number[] = [];
  const seaQ: number[] = [];
  const cellWater = new Uint8Array(cells);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = y * size + x;
      const corners = [y * n + x, y * n + x + 1, (y + 1) * n + x, (y + 1) * n + x + 1];
      let ocean = 0;
      let lake = 0;
      let river = 0;
      for (const k of corners) {
        if (water[k] === Water.Ocean) ocean++;
        else if (water[k] === Water.Lake) lake++;
        else if (water[k] === Water.River) river++;
      }
      if (ocean >= 2) cellWater[c] = Water.Ocean;
      else if (lake >= 2) cellWater[c] = Water.Lake;
      else if (river >= 2) cellWater[c] = Water.River;
      if (cellWater[c] === Water.Ocean) {
        seaDist[c] = 0;
        seaQ.push(c);
      } else if (cellWater[c] !== Water.None) {
        freshDist[c] = 0;
        freshQ.push(c);
      }
    }
  }
  bfsDistance(freshQ, freshDist, size, cellWater);
  bfsDistance(seaQ, seaDist, size, cellWater);

  const fertility = new Float32Array(cells);
  const forest = new Float32Array(cells);
  const fish = new Float32Array(cells);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = y * size + x;
      const corners = [y * n + x, y * n + x + 1, (y + 1) * n + x, (y + 1) * n + x + 1];
      let hmin = Infinity;
      let hmax = -Infinity;
      let hsum = 0;
      let msum = 0;
      for (const k of corners) {
        hmin = Math.min(hmin, heights[k]);
        hmax = Math.max(hmax, heights[k]);
        hsum += heights[k];
        msum += moisture[k];
      }
      const h = hsum / 4;
      const slope = hmax - hmin;
      const m = msum / 4 + (freshDist[c] < 5 ? 0.15 * (1 - freshDist[c] / 5) : 0);
      let b: BiomeId;
      const w = cellWater[c];
      if (w === Water.Ocean) b = h < -2.6 ? 'deep' : 'ocean';
      else if (w === Water.Lake) b = 'lake';
      else if (w === Water.River) b = 'river';
      else if (h > 12.5) b = 'snow';
      else if (h > 7.5 || slope > 1.9) b = 'mountain';
      else if (h < 0.75 && seaDist[c] <= 2) b = 'beach';
      else if (h > 3.6 || slope > 0.95) b = 'hills';
      else if (m > 0.58 + 0.12 * hash2(x >> 2, y >> 2, seed)) b = 'forest';
      else if (freshDist[c] <= 4 && m > 0.32) b = 'fertile';
      else b = 'plains';
      biome[c] = biomeIndex(b);

      // Fields
      if (b === 'plains' || b === 'fertile') {
        fertility[c] = Math.min(1, 0.25 + 0.55 * Math.max(0, 1 - freshDist[c] / 7) + 0.25 * m);
      } else if (b === 'hills') fertility[c] = 0.15 + 0.1 * m;
      else if (b === 'forest') fertility[c] = 0.3;
      else if (b === 'beach') fertility[c] = 0.08;

      if (b === 'forest') forest[c] = 0.55 + 0.45 * (0.5 + 0.5 * detailNoise(x * 0.15, y * 0.15));
      else if (b === 'hills' && m > 0.5) forest[c] = 0.3;
      else if ((b === 'plains' || b === 'fertile') && hash2(x, y, seed + 9) < 0.03) forest[c] = 0.2;

      if (b === 'ocean' || b === 'deep') {
        const clump = 0.5 + 0.5 * detailNoise(x * 0.07 + 40, y * 0.07 - 20);
        fish[c] = Math.min(1, (b === 'ocean' ? 0.45 : 0.25) + clump * 0.6);
      } else if (b === 'lake') fish[c] = 0.55;
      else if (b === 'river') fish[c] = 0.3;
    }
  }

  const partial = {
    seed, size, n, heights, waterLevel, water, moisture, biome, fertility, forest, fish,
    freshDist, seaDist, oceanAngle,
  };
  const towns = placeTowns(partial, rng);
  const deposits = placeDeposits(partial, rng, towns);
  return { ...partial, towns, deposits };
}

function bfsDistance(queue: number[], dist: Float32Array, size: number, cellWater: Uint8Array) {
  let head = 0;
  while (head < queue.length) {
    const c = queue[head++];
    const x = c % size;
    const y = (c / size) | 0;
    for (const [ox, oy] of N8) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const j = ny * size + nx;
      const step = ox !== 0 && oy !== 0 ? 1.414 : 1;
      if (dist[c] + step < dist[j] && (cellWater[j] === Water.None || dist[j] > 0)) {
        dist[j] = dist[c] + step;
        queue.push(j);
      }
    }
  }
}

type PartialWorld = Omit<World, 'towns' | 'deposits'>;

export function cellSlope(w: Pick<World, 'heights' | 'n'>, x: number, y: number): number {
  const n = w.n;
  const a = w.heights[y * n + x];
  const b = w.heights[y * n + x + 1];
  const c = w.heights[(y + 1) * n + x];
  const d = w.heights[(y + 1) * n + x + 1];
  return Math.max(a, b, c, d) - Math.min(a, b, c, d);
}

export function cellHeight(w: Pick<World, 'heights' | 'n'>, x: number, y: number): number {
  const n = w.n;
  return (
    (w.heights[y * n + x] + w.heights[y * n + x + 1] + w.heights[(y + 1) * n + x] + w.heights[(y + 1) * n + x + 1]) / 4
  );
}

function placeTowns(w: PartialWorld, rng: Rng): TownSite[] {
  const { size } = w;
  const candidates: { x: number; y: number; score: number; coastal: boolean }[] = [];
  for (let y = 6; y < size - 6; y += 2) {
    for (let x = 6; x < size - 6; x += 2) {
      const b = BIOME_IDS[w.biome[y * size + x]];
      if (!(b === 'plains' || b === 'fertile' || b === 'beach')) continue;
      // Require flat surroundings.
      let flat = true;
      for (let oy = -2; oy <= 2 && flat; oy++)
        for (let ox = -2; ox <= 2 && flat; ox++) {
          const bb = BIOME_IDS[w.biome[(y + oy) * size + x + ox]];
          if (bb === 'ocean' || bb === 'deep' || bb === 'lake' || bb === 'river' || cellSlope(w, x + ox, y + oy) > 0.7)
            flat = false;
        }
      if (!flat) continue;
      const sd = w.seaDist[y * size + x];
      const fd = w.freshDist[y * size + x];
      const coastal = sd <= 5;
      const score = (coastal ? 1.2 : 0) + (fd <= 5 ? 0.9 : 0) + rng() * 1.4;
      candidates.push({ x, y, score, coastal });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const towns: TownSite[] = [];
  const minDist = size * 0.19;
  const names = [...TOWN_NAMES];
  for (const c of candidates) {
    if (towns.length >= 7) break;
    if (towns.some((t) => Math.hypot(t.x - c.x, t.y - c.y) < minDist)) continue;
    const nameIdx = Math.floor(rng() * names.length);
    const name = names.splice(nameIdx, 1)[0];
    towns.push({ id: towns.length, name, x: c.x, y: c.y, population: 0, coastal: c.coastal });
  }
  // Populations: one city, a couple of mid towns, the rest small.
  towns.forEach((t, i) => {
    const base = i === 0 ? 24000 : i < 3 ? 9000 : 3500;
    t.population = Math.round((base * (0.75 + rng() * 0.5)) / 50) * 50;
  });
  return towns;
}

function placeDeposits(w: PartialWorld, rng: Rng, towns: TownSite[]): DepositSeed[] {
  const { size } = w;
  const deposits: DepositSeed[] = [];
  let id = 0;
  for (const def of DEPOSITS) {
    const target = Math.max(2, Math.round((def.density * size * size) / 10000));
    let placed = 0;
    for (let tries = 0; tries < target * 400 && placed < target; tries++) {
      const x = 3 + Math.floor(rng() * (size - 6));
      const y = 3 + Math.floor(rng() * (size - 6));
      const b = BIOME_IDS[w.biome[y * size + x]];
      const weight = def.biomes[b] ?? 0;
      if (weight <= 0 || rng() > weight) continue;
      if (deposits.some((d) => Math.hypot(d.x - x, d.y - y) < (d.resource === def.id ? 14 : 5))) continue;
      if (towns.some((t) => Math.hypot(t.x - x, t.y - y) < 6)) continue;
      const radius = def.radius[0] + rng() * (def.radius[1] - def.radius[0]);
      const amount = Math.round((def.amount[0] + rng() * (def.amount[1] - def.amount[0])) / 100) * 100;
      deposits.push({ id: id++, resource: def.id, x, y, radius, amount, hidden: rng() < def.hiddenChance });
      placed++;
    }
  }
  return deposits;
}
