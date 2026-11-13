// Builds the mesh of one terrain chunk: smooth normals, colours blended per
// vertex and a fine detail texture on top.
import * as THREE from 'three';
import { WORLD } from '../config';
import type { GroundInfo, Terrain } from '../sim/world/terrain';

const C = (hex: number) => new THREE.Color(hex);
// Autumn palette: golden grass, dark earth tracks, blue-violet rock.
const COLORS = {
  meadow: C(0xc9a04e),
  forestGrass: C(0xb98a40),
  highGrass: C(0xc9a65e),
  forestFloor: C(0x8a6540),
  dirt: C(0x6f5a48),
  mud: C(0x5b4032),
  deepMud: C(0x3e2b23),
  rock: C(0x8a84a6),
  gravel: C(0x8f89a6),
  snow: C(0xf6f1ee),
  riverBed: C(0x3d6d8a),
};
const tmp = new THREE.Color();

/**
 * Colour of a piece of ground. `variation` is a number in 0..1 that changes slowly over the land.
 * Returns how much tall grass grows there: 0 = none, 1 = some, 2 = a lot.
 */
function groundColor(g: GroundInfo, variation: number, out: THREE.Color): number {
  let grass = 0;
  switch (g.surface) {
    case 'grass':
      out.copy(g.biome === 'forest' ? COLORS.forestGrass : g.biome === 'mountain' ? COLORS.highGrass : COLORS.meadow);
      grass = 2;
      break;
    case 'dirt':
      out.copy(g.biome === 'forest' ? COLORS.forestFloor : COLORS.dirt);
      grass = g.biome === 'forest' ? 1 : 0;
      break;
    case 'mud':
      out.copy(COLORS.mud);
      break;
    case 'deepMud':
      out.copy(COLORS.deepMud);
      break;
    case 'wetRock':
      out.copy(COLORS.gravel);
      break;
    default:
      out.copy(COLORS.rock);
      // Darker rock faces where it is steep, snow on the high, flatter parts.
      out.multiplyScalar(1.05 - Math.min(0.3, g.slope * 0.18));
      if (g.height > 62 && g.slope < 0.9) out.lerp(COLORS.snow, Math.min(1, (g.height - 62) / 10));
  }
  if (g.waterDepth > 0) out.lerp(COLORS.riverBed, Math.min(0.8, g.waterDepth * 0.7));
  out.multiplyScalar(0.98 + variation * 0.28);
  return g.height > 0.4 && g.slope < 0.75 ? grass : 0;
}

export interface ChunkMeshData {
  geometry: THREE.BufferGeometry;
  /** Heights at the grid corners, index = ix * (cells + 1) + iz. */
  heights: Float32Array;
  /** Tall-grass amount per cell (0, 1 or 2), index = ix * cells + iz. */
  grass: Uint8Array;
}

/**
 * @param cells  grid cells per side: 32 near the player, fewer far away (level of detail)
 */
export function buildChunkGeometry(terrain: Terrain, cx: number, cz: number, cells: number): ChunkMeshData {
  const size = WORLD.chunkSize;
  const step = size / cells;
  const x0 = cx * size;
  const z0 = cz * size;
  const n = cells + 1;

  // Heights with one extra row all around, so normals at the chunk border
  // match the neighbour chunk and no seam is visible.
  const m = n + 2;
  const H = new Float32Array(m * m);
  for (let ix = -1; ix <= n; ix++) {
    for (let iz = -1; iz <= n; iz++) H[(ix + 1) * m + iz + 1] = terrain.height(x0 + ix * step, z0 + iz * step);
  }

  // Main grid vertices plus a "skirt" along the 4 edges. The skirt hangs down
  // and hides the small gaps between chunks of different detail.
  const vertexCount = n * n + 4 * n;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const heights = new Float32Array(n * n);
  const grassAt = new Uint8Array(n * n);
  const TILE = 5; // metres per repeat of the detail texture

  for (let ix = 0; ix < n; ix++) {
    for (let iz = 0; iz < n; iz++) {
      const i = ix * n + iz;
      const x = x0 + ix * step;
      const z = z0 + iz * step;
      const h = H[(ix + 1) * m + iz + 1];
      heights[i] = h;
      const dx = (H[(ix + 2) * m + iz + 1] - H[ix * m + iz + 1]) / (2 * step);
      const dz = (H[(ix + 1) * m + iz + 2] - H[(ix + 1) * m + iz]) / (2 * step);
      const slope = Math.sqrt(dx * dx + dz * dz);
      const len = Math.sqrt(dx * dx + dz * dz + 1);
      // Slow colour drift across the land (rendering only).
      const variation = 0.5 + 0.25 * Math.sin(x * 0.043 + Math.sin(z * 0.031) * 2.3) + 0.25 * Math.sin(z * 0.11 + x * 0.07);
      grassAt[i] = groundColor(terrain.classify(x, z, h, slope), variation, tmp);
      positions.set([x, h, z], i * 3);
      normals.set([-dx / len, 1 / len, -dz / len], i * 3);
      colors.set([tmp.r, tmp.g, tmp.b], i * 3);
      uvs.set([x / TILE, z / TILE], i * 2);
    }
  }

  const indices: number[] = [];
  const grass = new Uint8Array(cells * cells);
  for (let ix = 0; ix < cells; ix++) {
    for (let iz = 0; iz < cells; iz++) {
      const a = ix * n + iz;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.push(a, b, c, c, b, d);
      grass[ix * cells + iz] = Math.min(grassAt[a], grassAt[b], grassAt[c], grassAt[d]);
    }
  }

  // Skirts: copy each edge vertex, lower it, and connect it to the edge.
  let v = n * n;
  const SKIRT = 6;
  const edge = (indexOf: (k: number) => number) => {
    const first = v;
    for (let k = 0; k < n; k++) {
      const src = indexOf(k);
      positions.set([positions[src * 3], positions[src * 3 + 1] - SKIRT, positions[src * 3 + 2]], v * 3);
      normals.set([normals[src * 3], normals[src * 3 + 1], normals[src * 3 + 2]], v * 3);
      colors.set([colors[src * 3], colors[src * 3 + 1], colors[src * 3 + 2]], v * 3);
      uvs.set([uvs[src * 2], uvs[src * 2 + 1]], v * 2);
      v++;
    }
    for (let k = 0; k < cells; k++) {
      const a = indexOf(k);
      const b = indexOf(k + 1);
      // Both windings, so the skirt is visible from either side.
      indices.push(a, b, first + k, b, first + k + 1, first + k);
      indices.push(b, a, first + k, first + k + 1, b, first + k);
    }
  };
  edge((k) => k); // ix = 0
  edge((k) => cells * n + k); // ix = cells
  edge((k) => k * n); // iz = 0
  edge((k) => k * n + cells); // iz = cells

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return { geometry, heights, grass };
}
