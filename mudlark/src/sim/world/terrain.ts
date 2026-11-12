// The seeded world: height, biome and surface for any point, as pure
// functions of the seed. Nothing here is stored or sent over the network;
// every client can rebuild the same world from the seed text alone.
import { WORLD, type SurfaceId } from '../../config';
import { Noise2D, lerp, smoothstep } from '../noise';
import { hash2, hashString, makeRng } from '../rng';

export type Biome = 'meadow' | 'forest' | 'mountain' | 'swamp';

/** Special places generated per region. */
export interface Feature {
  id: string;
  kind: 'camp' | 'mudPit' | 'knoll';
  x: number;
  z: number;
  /** Ground height at the centre before the feature changed it. */
  y: number;
  radius: number;
  /** Extra height of a knoll. */
  height: number;
}

export interface GroundInfo {
  height: number;
  /** Steepness: 0 = flat, 1 = 45 degrees. */
  slope: number;
  biome: Biome;
  surface: SurfaceId;
  /** How deep the water is here (0 on dry land). */
  waterDepth: number;
}

/** Where the car stands when it starts at, or travels to, a camp. */
export function campParking(camp: Feature): { x: number; z: number; yaw: number } {
  return { x: camp.x + 1, z: camp.z - 7, yaw: Math.PI / 2 };
}

export class Terrain {
  readonly seed: number;
  private nHill: Noise2D;
  private nBroad: Noise2D;
  private nMask: Noise2D;
  private nRidge: Noise2D;
  private nDetail: Noise2D;
  private nMoist: Noise2D;
  private nRiver: Noise2D;
  private nWarp: Noise2D;
  private nFord: Noise2D;
  private nMud: Noise2D;
  private nForest: Noise2D;
  private regionCache = new Map<string, Feature[]>();

  constructor(readonly seedText: string) {
    this.seed = hashString(seedText);
    const n = (i: number) => new Noise2D(hash2(this.seed, i, 7919));
    this.nHill = n(1);
    this.nBroad = n(2);
    this.nMask = n(3);
    this.nRidge = n(4);
    this.nDetail = n(5);
    this.nMoist = n(6);
    this.nRiver = n(7);
    this.nWarp = n(8);
    this.nFord = n(9);
    this.nMud = n(10);
    this.nForest = n(11);
  }

  // --- raw ingredients -------------------------------------------------------

  /** 0 = lowland, 1 = high mountains. */
  private mountainMask(x: number, z: number): number {
    return smoothstep(0.12, 0.62, this.nMask.fbm(x / 1700, z / 1700, 2));
  }

  /** -1 = dry, +1 = wet. */
  private moisture(x: number, z: number): number {
    return this.nMoist.fbm(x / 800 + 40, z / 800 - 12, 2);
  }

  /** Distance-like value to the nearest river: 0 in the middle of a river. */
  private riverValue(x: number, z: number): number {
    const wx = x + this.nWarp.get(x / 260, z / 260) * 55;
    const wz = z + this.nWarp.get(x / 260 + 31, z / 260 + 77) * 55;
    const v = this.nRiver.get(wx / 1000, wz / 1000);
    return v < 0 ? -v : v;
  }

  /** How swampy a spot is (0..1), from moisture and how low it lies. */
  private swampiness(moist: number, h: number): number {
    return smoothstep(0.2, 0.5, moist) * (1 - smoothstep(3, 10, h));
  }

  /** Terrain height without camps, mud pits and knolls. */
  baseHeight(x: number, z: number): number {
    const mountain = this.mountainMask(x, z);
    // Rolling hills.
    let h = 8 + this.nBroad.fbm(x / 1400, z / 1400, 2) * 9 + this.nHill.fbm(x / 380, z / 380, 4) * 12;
    // Mountains: sharp ridges.
    if (mountain > 0) {
      const r1 = 1 - Math.abs(this.nRidge.get(x / 330, z / 330));
      const r2 = 1 - Math.abs(this.nRidge.get(x / 120 + 50, z / 120 + 50));
      h += mountain * (22 + r1 * r1 * 52 + r2 * r2 * 12);
    }
    // Small bumps, rougher in the mountains.
    const rough = 0.35 + mountain * 1.6;
    h += this.nDetail.get(x / 42, z / 42) * 1.3 * rough + this.nDetail.get(x / 13 + 9, z / 13 + 9) * 0.28 * rough;

    // Swamps: wet lowland is pressed flat, just above the water.
    const swamp = this.swampiness(this.moisture(x, z), h);
    if (swamp > 0) h = lerp(h, 0.45 + this.nDetail.get(x / 9, z / 9) * 0.42, swamp * 0.92);

    // Rivers: a valley down to the water level, then the river bed itself.
    const rv = this.riverValue(x, z);
    const valleyWidth = 0.2 - mountain * 0.1;
    if (rv < valleyWidth) {
      const valley = 1 - smoothstep(0.02, valleyWidth, rv);
      h = lerp(h, Math.min(h, 1.1), valley);
      const channel = 1 - smoothstep(0.004, 0.022, rv);
      if (channel > 0) {
        // Fords: stretches where the river is shallow enough to drive through.
        const ford = smoothstep(0.1, 0.38, this.nFord.get(x / 190, z / 190));
        h = lerp(h, -lerp(WORLD.riverDepth, WORLD.fordDepth, ford), channel);
      }
    }
    return h;
  }

  // --- features (camps and challenge spots) -----------------------------------

  /** Camps and challenge spots of one region. Generated once, then cached. */
  featuresOfRegion(rx: number, rz: number): Feature[] {
    const key = rx + ',' + rz;
    let list = this.regionCache.get(key);
    if (list) return list;
    list = [];
    const rng = makeRng(hash2(this.seed, rx * 31 + 5, rz * 17 + 3));
    const size = WORLD.regionSize;
    const pick = () => ({ x: (rx + 0.12 + rng() * 0.76) * size, z: (rz + 0.12 + rng() * 0.76) * size });
    // A spot is usable when it is dry, not too high and fairly level.
    const usable = (x: number, z: number, reach: number, maxDiff: number): number | null => {
      const y = this.baseHeight(x, z);
      if (y < 2 || y > 32) return null;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const d = this.baseHeight(x + dx * reach, z + dz * reach) - y;
        if (d > maxDiff || d < -maxDiff) return null;
      }
      return y;
    };
    const farFromOthers = (x: number, z: number) =>
      list!.every((f) => (f.x - x) * (f.x - x) + (f.z - z) * (f.z - z) > 55 * 55);

    // The home region always has a camp (the player starts there).
    const isHome = rx === 0 && rz === 0;
    const wantsCamp = rng() < WORLD.campChance || isHome;
    if (wantsCamp) {
      for (let attempt = 0; attempt < (isHome ? 300 : 14); attempt++) {
        const p = pick();
        const y = usable(p.x, p.z, 12, 2.2);
        if (y !== null) {
          list.push({ id: `camp:${rx}:${rz}`, kind: 'camp', x: p.x, z: p.z, y, radius: 13, height: 0 });
          break;
        }
      }
      if (isHome && list.length === 0) {
        const y = Math.max(3, this.baseHeight(size / 2, size / 2));
        list.push({ id: 'camp:0:0', kind: 'camp', x: size / 2, z: size / 2, y, radius: 13, height: 0 });
      }
    }
    for (let i = 0; i < WORLD.challengesPerRegion; i++) {
      const kind = rng() < 0.5 ? 'mudPit' : 'knoll';
      for (let attempt = 0; attempt < 8; attempt++) {
        const p = pick();
        const y = usable(p.x, p.z, 12, 3);
        if (y === null || !farFromOthers(p.x, p.z)) continue;
        if (kind === 'mudPit') {
          list.push({ id: `mud:${rx}:${rz}:${i}`, kind, x: p.x, z: p.z, y, radius: 11 + rng() * 4, height: 0 });
        } else {
          const radius = 15 + rng() * 4;
          list.push({ id: `knoll:${rx}:${rz}:${i}`, kind, x: p.x, z: p.z, y, radius, height: radius * WORLD.knollSteepness });
        }
        break;
      }
    }
    this.regionCache.set(key, list);
    return list;
  }

  /** The feature whose area covers this point (if any). */
  featureAt(x: number, z: number, margin = 0): Feature | null {
    const size = WORLD.regionSize;
    const reach = 28 + margin; // no feature is larger than this
    const rx0 = Math.floor((x - reach) / size);
    const rx1 = Math.floor((x + reach) / size);
    const rz0 = Math.floor((z - reach) / size);
    const rz1 = Math.floor((z + reach) / size);
    for (let rx = rx0; rx <= rx1; rx++) {
      for (let rz = rz0; rz <= rz1; rz++) {
        for (const f of this.featuresOfRegion(rx, rz)) {
          const r = (f.kind === 'camp' ? f.radius * 1.7 : f.radius) + margin;
          const dx = x - f.x;
          const dz = z - f.z;
          if (dx * dx + dz * dz < r * r) return f;
        }
      }
    }
    return null;
  }

  /** All features in the regions around a point (for the compass and fast travel). */
  featuresNear(x: number, z: number, regions = 1): Feature[] {
    const size = WORLD.regionSize;
    const rx = Math.floor(x / size);
    const rz = Math.floor(z / size);
    const out: Feature[] = [];
    for (let i = -regions; i <= regions; i++) {
      for (let j = -regions; j <= regions; j++) out.push(...this.featuresOfRegion(rx + i, rz + j));
    }
    return out;
  }

  // --- final terrain ------------------------------------------------------------

  /** Final ground height at a point. */
  height(x: number, z: number): number {
    const h = this.baseHeight(x, z);
    const f = this.featureAt(x, z);
    if (!f) return h;
    const d = Math.sqrt((x - f.x) * (x - f.x) + (z - f.z) * (z - f.z));
    if (f.kind === 'camp') {
      // Level ground for the cabin, blending into the landscape.
      return lerp(h, f.y, 1 - smoothstep(f.radius * 0.7, f.radius * 1.7, d));
    }
    if (f.kind === 'mudPit') {
      // A shallow bowl.
      return lerp(h, f.y - 0.75, 1 - smoothstep(f.radius * 0.45, f.radius, d));
    }
    // Knoll: a steep rocky mound with a small flat top.
    return h + f.height * (1 - smoothstep(f.radius * 0.12, f.radius, d));
  }

  /** Everything the game needs to know about the ground at a point. */
  ground(x: number, z: number): GroundInfo {
    const height = this.height(x, z);
    const e = 1.2;
    const dx = (this.height(x + e, z) - height) / e;
    const dz = (this.height(x, z + e) - height) / e;
    return this.classify(x, z, height, Math.sqrt(dx * dx + dz * dz));
  }

  /** Biome and surface from a known height and slope (used by the chunk builder too). */
  classify(x: number, z: number, height: number, slope: number): GroundInfo {
    const mountain = this.mountainMask(x, z);
    const moist = this.moisture(x, z);
    const waterDepth = height < 0 ? -height : 0;
    const swamp = this.swampiness(moist, height);

    let biome: Biome;
    if (mountain > 0.3 || height > 42) biome = 'mountain';
    else if (swamp > 0.45) biome = 'swamp';
    else if (moist * 0.6 + this.nForest.fbm(x / 240, z / 240, 2) > 0.02) biome = 'forest';
    else biome = 'meadow';

    const mudNoise = this.nMud.get(x / 55, z / 55);
    let surface: SurfaceId;
    const f = this.featureAt(x, z);
    const fd = f ? Math.sqrt((x - f.x) * (x - f.x) + (z - f.z) * (z - f.z)) : 0;
    if (f && f.kind === 'mudPit' && fd < f.radius * 0.88) surface = 'deepMud';
    else if (f && f.kind === 'knoll' && fd < f.radius) surface = 'rock';
    else if (f && f.kind === 'camp' && fd < f.radius) surface = 'dirt';
    else if (waterDepth > 0.05) surface = waterDepth > 0.75 ? 'mud' : 'wetRock'; // river bed: silt or gravel
    else if (slope > 0.7) surface = height < 1 ? 'wetRock' : 'rock';
    else if (biome === 'mountain') surface = height > 6 && slope < 0.28 && mountain < 0.6 ? 'grass' : 'rock';
    else if (biome === 'swamp') surface = mudNoise > 0.25 ? 'deepMud' : 'mud';
    else if (height < 0.5) surface = 'wetRock'; // gravel banks next to water
    else if (biome === 'forest') surface = mudNoise > 0.5 ? 'mud' : 'dirt';
    else surface = mudNoise > 0.62 ? 'mud' : 'grass';

    return { height, slope, biome, surface, waterDepth };
  }

  /** Where a new game starts: next to the home camp. */
  spawnPoint(): { x: number; z: number; yaw: number; camp: Feature } {
    const camp = this.featuresOfRegion(0, 0).find((f) => f.kind === 'camp')!;
    return { ...campParking(camp), camp };
  }
}
