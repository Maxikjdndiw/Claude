import * as THREE from 'three';
import { BIOMES, BIOME_IDS } from '../data/biomes';
import { hash2 } from '../sim/rng';
import { Water, type World } from '../sim/world/types';
import { PALETTE } from './palette';

export const CHUNK = 32;

const c1 = new THREE.Color();
const c2 = new THREE.Color();
const biomeColors = BIOME_IDS.map((id) => new THREE.Color(BIOMES[id].color));
const shallow = new THREE.Color(PALETTE.shallowFloor);
const deep = new THREE.Color(PALETTE.seabed);
const rock = new THREE.Color(PALETTE.rock);
const sand = new THREE.Color(BIOMES.beach.color);
const quarry = new THREE.Color('#c9b48f');
const lakeFloor = new THREE.Color('#8fc0a6');

/** Horizontal jitter of a vertex so the grid does not look like a grid. */
export function jitter(w: World, vx: number, vy: number): [number, number] {
  if (vx <= 0 || vy <= 0 || vx >= w.size || vy >= w.size) return [0, 0];
  return [(hash2(vx, vy, 11) - 0.5) * 0.55, (hash2(vx, vy, 23) - 0.5) * 0.55];
}

/**
 * Chunked, flat-shaded terrain. Each triangle has its own vertices (non-indexed)
 * so normals are per-face, giving the faceted look.
 */
export class TerrainView {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private chunks = new Map<string, THREE.Mesh>();
  /** Cells dug by mines (rendered in quarry color). */
  dug: Uint8Array;

  constructor(private world: World) {
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.95,
      metalness: 0,
    });
    this.dug = new Uint8Array(world.size * world.size);
    const nc = Math.ceil(world.size / CHUNK);
    for (let cy = 0; cy < nc; cy++) for (let cx = 0; cx < nc; cx++) this.buildChunk(cx, cy);
  }

  get meshes(): THREE.Object3D[] {
    return [...this.chunks.values()];
  }

  /** Rebuild the chunks overlapping a cell rectangle (after digging). */
  updateRegion(x0: number, y0: number, x1: number, y1: number): void {
    const a = Math.max(0, Math.floor((x0 - 1) / CHUNK));
    const b = Math.max(0, Math.floor((y0 - 1) / CHUNK));
    const c = Math.floor((x1 + 1) / CHUNK);
    const d = Math.floor((y1 + 1) / CHUNK);
    const nc = Math.ceil(this.world.size / CHUNK);
    for (let cy = b; cy <= Math.min(nc - 1, d); cy++)
      for (let cx = a; cx <= Math.min(nc - 1, c); cx++) this.buildChunk(cx, cy);
  }

  private buildChunk(cx: number, cy: number): void {
    const w = this.world;
    const key = `${cx},${cy}`;
    const old = this.chunks.get(key);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
    }
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const x1 = Math.min(w.size, x0 + CHUNK);
    const y1 = Math.min(w.size, y0 + CHUNK);
    const cells = (x1 - x0) * (y1 - y0);
    const pos = new Float32Array(cells * 18);
    const col = new Float32Array(cells * 18);
    let p = 0;
    const n = w.n;
    const H = w.heights;

    const vert = (vx: number, vy: number, out: number[]) => {
      const [jx, jy] = jitter(w, vx, vy);
      out.push(vx + jx, H[vy * n + vx], vy + jy);
    };

    const tmp: number[] = [];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        tmp.length = 0;
        vert(x, y, tmp); // a 0
        vert(x + 1, y, tmp); // b 3
        vert(x, y + 1, tmp); // c 6
        vert(x + 1, y + 1, tmp); // d 9
        const flip = hash2(x, y, 5) < 0.5;
        // Triangles wound counter-clockwise when viewed from above (+Y).
        const tris = flip ? [[0, 6, 3], [3, 6, 9]] : [[0, 6, 9], [0, 9, 3]];
        for (let t = 0; t < 2; t++) {
          const [i, j, k] = tris[t];
          const avgH = (tmp[i + 1] + tmp[j + 1] + tmp[k + 1]) / 3;
          const slope =
            Math.max(tmp[i + 1], tmp[j + 1], tmp[k + 1]) - Math.min(tmp[i + 1], tmp[j + 1], tmp[k + 1]);
          this.triColor(x, y, t, avgH, slope, c1);
          for (const v of [i, j, k]) {
            pos[p] = tmp[v];
            pos[p + 1] = tmp[v + 1];
            pos[p + 2] = tmp[v + 2];
            col[p] = c1.r;
            col[p + 1] = c1.g;
            col[p + 2] = c1.b;
            p += 3;
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = 'terrain';
    this.chunks.set(key, mesh);
    this.group.add(mesh);
  }

  private triColor(x: number, y: number, t: number, avgH: number, slope: number, out: THREE.Color): void {
    const w = this.world;
    const ci = y * w.size + x;
    const bi = w.biome[ci];
    const id = BIOME_IDS[bi];
    const r = hash2(x * 2 + t, y, 7);
    if (this.dug[ci]) {
      out.copy(quarry).offsetHSL(0, 0, (r - 0.5) * 0.06 - Math.min(0.12, Math.max(0, -avgH) * 0.01));
      return;
    }
    if (BIOMES[id].water || avgH < 0.02) {
      // Underwater floor: sandy in the shallows, blue in the deep.
      const vx = Math.min(w.n - 1, x);
      const vy = Math.min(w.n - 1, y);
      let wl = w.waterLevel[vy * w.n + vx];
      if (Number.isNaN(wl)) wl = 0;
      const depth = Math.max(0, wl - avgH);
      const k = Math.min(1, depth / 3.2);
      const fresh = id === 'lake' || id === 'river' || w.water[vy * w.n + vx] === Water.River || w.water[vy * w.n + vx] === Water.Lake;
      out.copy(fresh ? lakeFloor : shallow).lerp(deep, fresh ? Math.max(0.3, k) : k);
      out.offsetHSL(0, 0, (r - 0.5) * 0.04);
      return;
    }
    out.copy(biomeColors[bi]);
    if (id === 'beach' || (avgH < 0.45 && w.seaDist[ci] < 3)) out.copy(sand);
    // Steep faces become rocky.
    if (id !== 'snow') {
      const rocky = Math.min(1, Math.max(0, (slope - 0.9) / 1.4));
      if (rocky > 0) out.lerp(rock, rocky * (id === 'mountain' ? 0.6 : 0.75));
    }
    if (id === 'mountain' && avgH > 10.5) out.lerp(c2.set('#e9e6df'), Math.min(1, (avgH - 10.5) / 2.5));
    out.offsetHSL(0, (r - 0.5) * 0.03, (r - 0.5) * 0.05 + Math.min(0.05, avgH * 0.004));
  }
}
