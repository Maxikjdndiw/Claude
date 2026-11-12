// Builds the flat-shaded, vertex-coloured mesh of one terrain chunk.
import * as THREE from 'three';
import { WORLD } from '../config';
import type { GroundInfo, Terrain } from '../sim/world/terrain';

const C = (hex: number) => new THREE.Color(hex);
const COLORS = {
  meadow: C(0x93b05f),
  forestGrass: C(0x7fa055),
  highGrass: C(0x9aa870),
  forestFloor: C(0x6e7d48),
  dirt: C(0xa98d64),
  mud: C(0x7a5a3c),
  deepMud: C(0x553b26),
  rock: C(0x9a9187),
  gravel: C(0x8f8d7e),
  snow: C(0xf4f1ea),
  riverBed: C(0x5f6f62),
};
const tmp = new THREE.Color();

/** Colour of a piece of ground. `variation` is a number in 0..1 that differs per face. */
function groundColor(g: GroundInfo, variation: number, out: THREE.Color): void {
  switch (g.surface) {
    case 'grass':
      out.copy(g.biome === 'forest' ? COLORS.forestGrass : g.biome === 'mountain' ? COLORS.highGrass : COLORS.meadow);
      break;
    case 'dirt':
      out.copy(g.biome === 'forest' ? COLORS.forestFloor : COLORS.dirt);
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
      // Snow on the high, not too steep parts.
      if (g.height > 62 && g.slope < 0.9) out.lerp(COLORS.snow, Math.min(1, (g.height - 62) / 10));
  }
  if (g.waterDepth > 0) out.lerp(COLORS.riverBed, Math.min(0.8, g.waterDepth * 0.7));
  out.multiplyScalar(0.94 + variation * 0.12);
}

/**
 * @param cells  grid cells per side: 32 near the player, fewer far away (level of detail)
 */
export function buildChunkGeometry(terrain: Terrain, cx: number, cz: number, cells: number): THREE.BufferGeometry {
  const size = WORLD.chunkSize;
  const step = size / cells;
  const x0 = cx * size;
  const z0 = cz * size;
  const n = cells + 1;

  const heights = new Float32Array(n * n);
  for (let ix = 0; ix < n; ix++) {
    for (let iz = 0; iz < n; iz++) heights[ix * n + iz] = terrain.height(x0 + ix * step, z0 + iz * step);
  }

  // 2 triangles per cell plus a "skirt" along the 4 edges. The skirt hangs
  // down and hides the small gaps between chunks of different detail.
  const vertexCount = cells * cells * 6 + cells * 4 * 6;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  let v = 0;
  const put = (x: number, y: number, z: number) => {
    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;
    colors[v * 3] = tmp.r;
    colors[v * 3 + 1] = tmp.g;
    colors[v * 3 + 2] = tmp.b;
    v++;
  };
  const SKIRT = 5;

  for (let ix = 0; ix < cells; ix++) {
    for (let iz = 0; iz < cells; iz++) {
      const xa = x0 + ix * step;
      const xb = xa + step;
      const za = z0 + iz * step;
      const zb = za + step;
      const h00 = heights[ix * n + iz];
      const h10 = heights[(ix + 1) * n + iz];
      const h01 = heights[ix * n + iz + 1];
      const h11 = heights[(ix + 1) * n + iz + 1];
      const sx = (h10 + h11 - h00 - h01) / (2 * step);
      const sz = (h01 + h11 - h00 - h10) / (2 * step);
      const info = terrain.classify(xa + step / 2, za + step / 2, (h00 + h10 + h01 + h11) / 4, Math.sqrt(sx * sx + sz * sz));
      // Cheap per-face variation (rendering only, does not need to be exact).
      const variation = (((ix * 7 + iz * 13 + cx * 3 + cz * 5) % 9) + 9) % 9 / 8;
      groundColor(info, variation, tmp);
      put(xa, h00, za); put(xa, h01, zb); put(xb, h10, za);
      tmp.multiplyScalar(0.97);
      put(xb, h10, za); put(xa, h01, zb); put(xb, h11, zb);

      // Skirts on the outer edges.
      if (iz === 0) { put(xa, h00, za); put(xb, h10, za); put(xa, h00 - SKIRT, za); put(xb, h10, za); put(xb, h10 - SKIRT, za); put(xa, h00 - SKIRT, za); }
      if (iz === cells - 1) { put(xa, h01, zb); put(xa, h01 - SKIRT, zb); put(xb, h11, zb); put(xb, h11, zb); put(xa, h01 - SKIRT, zb); put(xb, h11 - SKIRT, zb); }
      if (ix === 0) { put(xa, h00, za); put(xa, h00 - SKIRT, za); put(xa, h01, zb); put(xa, h01, zb); put(xa, h00 - SKIRT, za); put(xa, h01 - SKIRT, zb); }
      if (ix === cells - 1) { put(xb, h10, za); put(xb, h11, zb); put(xb, h10 - SKIRT, za); put(xb, h11, zb); put(xb, h11 - SKIRT, zb); put(xb, h10 - SKIRT, za); }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); // every triangle has its own vertices, so this gives flat shading
  geometry.computeBoundingSphere();
  return geometry;
}
