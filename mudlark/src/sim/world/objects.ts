// Things that stand on the terrain: trees, rocks, winch posts and pebbles.
// Generated per chunk from the seed, so every player sees the same ones.
import { WORLD } from '../../config';
import { hash2, makeRng } from '../rng';
import type { Feature, Terrain } from './terrain';

export interface TreeObj {
  x: number; y: number; z: number;
  scale: number;
  /** 0 = pine, 1 = round leaf tree, 2 = bare swamp tree. */
  type: 0 | 1 | 2;
  turn: number; // 0..1, rotation around the trunk
}
export interface RockObj { x: number; y: number; z: number; scale: number; turn: number }
export interface PostObj { x: number; y: number; z: number }
export interface PebbleObj { id: string; x: number; y: number; z: number }

export interface ChunkObjects {
  trees: TreeObj[];
  rocks: RockObj[];
  posts: PostObj[];
  pebbles: PebbleObj[];
}

/** A point you can attach the winch to. */
export interface Anchor { x: number; y: number; z: number }

export function chunkKey(cx: number, cz: number): string {
  return cx + ',' + cz;
}

export function generateChunkObjects(terrain: Terrain, cx: number, cz: number): ChunkObjects {
  const size = WORLD.chunkSize;
  const rng = makeRng(hash2(terrain.seed, cx * 3 + 1000, cz * 5 - 1000));
  const out: ChunkObjects = { trees: [], rocks: [], posts: [], pebbles: [] };
  const x0 = cx * size;
  const z0 = cz * size;

  // --- trees ---
  for (let i = 0; i < WORLD.treeTriesPerChunk; i++) {
    const x = x0 + rng() * size;
    const z = z0 + rng() * size;
    const chance = rng();
    const scale = 0.75 + rng() * 0.7;
    const turn = rng();
    const kind = rng();
    const g = terrain.ground(x, z);
    if (g.height < 0.35 || g.slope > 0.62 || g.height > 58) continue;
    if (terrain.featureAt(x, z, 2.5)) continue; // keep camps and challenge spots clear
    let density = 0.035; // meadow: a few lone trees
    if (g.biome === 'forest') density = 0.62;
    else if (g.biome === 'swamp') density = 0.13;
    else if (g.biome === 'mountain') density = g.surface === 'grass' ? 0.12 : 0.03;
    if (chance > density) continue;
    let type: 0 | 1 | 2 = kind < 0.6 ? 0 : 1;
    if (g.biome === 'swamp') type = kind < 0.7 ? 2 : 1;
    if (g.biome === 'mountain') type = 0;
    if (g.biome === 'meadow') type = 1;
    out.trees.push({ x, y: g.height, z, scale, type, turn });
  }

  // --- rocks ---
  for (let i = 0; i < WORLD.rockTriesPerChunk; i++) {
    const x = x0 + rng() * size;
    const z = z0 + rng() * size;
    const chance = rng();
    const scale = 0.35 + rng() * rng() * 1.5;
    const turn = rng();
    const g = terrain.ground(x, z);
    if (g.waterDepth > 0.6 || terrain.featureAt(x, z, 2)) continue;
    const density = g.biome === 'mountain' ? 0.75 : g.waterDepth > 0 || g.height < 1 ? 0.45 : 0.12;
    if (chance > density) continue;
    out.rocks.push({ x, y: g.height, z, scale, turn });
  }

  // --- loose pebbles (the collectible) ---
  for (let i = 0; i < WORLD.pebbleTriesPerChunk; i++) {
    const x = x0 + rng() * size;
    const z = z0 + rng() * size;
    const chance = rng();
    const g = terrain.ground(x, z);
    if (g.waterDepth > 0.4 || g.slope > 0.7 || chance > 0.55) continue;
    out.pebbles.push({ id: `p:${cx}:${cz}:${i}`, x, y: g.height, z });
  }

  // --- things that belong to camps and challenge spots centred in this chunk ---
  for (const f of terrain.featuresNear(x0 + size / 2, z0 + size / 2, 1)) {
    if (Math.floor(f.x / size) !== cx || Math.floor(f.z / size) !== cz) continue;
    addFeatureObjects(terrain, f, out);
  }
  return out;
}

function addFeatureObjects(terrain: Terrain, f: Feature, out: ChunkObjects): void {
  const post = (x: number, z: number) => out.posts.push({ x, y: terrain.height(x, z), z });
  const pebble = (i: number, x: number, z: number) =>
    out.pebbles.push({ id: `${f.id}:${i}`, x, y: terrain.height(x, z), z });
  // Fixed directions (no sin/cos, to stay identical on every machine).
  const ring = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];
  if (f.kind === 'camp') {
    post(f.x - 9, f.z - 9);
  } else if (f.kind === 'mudPit') {
    // Winch posts around the pit, pebbles in the middle.
    for (let i = 0; i < 8; i += 2) post(f.x + ring[i][0] * (f.radius + 3), f.z + ring[i][1] * (f.radius + 3));
    for (let i = 0; i < 6; i++) pebble(i, f.x + ring[i][0] * 2.2, f.z + ring[i][1] * 2.2);
  } else {
    // Knoll: one post and a ring of pebbles on the top.
    post(f.x, f.z);
    for (let i = 0; i < 8; i++) pebble(i, f.x + ring[i][0] * 2.4, f.z + ring[i][1] * 2.4);
  }
}

/** Where the parts of a camp stand. Shared by physics and rendering. */
export function campLayout(f: Feature) {
  return {
    cabin: { x: f.x - 5, z: f.z + 5, halfX: 2.6, halfY: 1.4, halfZ: 2.1 },
    fire: { x: f.x + 2.5, z: f.z + 1.5 },
    tent: { x: f.x + 6.5, z: f.z + 6 },
  };
}
