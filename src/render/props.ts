import * as THREE from 'three';
import { BIOME_IDS } from '../data/biomes';
import { hash2 } from '../sim/rng';
import { heightAt } from '../sim/world/query';
import type { World } from '../sim/world/types';
import { buildModel, propMaterial } from './meshkit';

const PINE = buildModel([
  { shape: 'cyl', color: '#8a6a4f', size: [0.12, 0.3, 0.12], segments: 5 },
  { shape: 'cone', color: '#5f9e5c', size: [0.62, 0.7, 0.62], pos: [0, 0.22, 0], segments: 6 },
  { shape: 'cone', color: '#6fae63', size: [0.46, 0.55, 0.46], pos: [0, 0.6, 0], segments: 6 },
]);
const ROUND = buildModel([
  { shape: 'cyl', color: '#8f6d50', size: [0.12, 0.38, 0.12], segments: 5 },
  { shape: 'ico', color: '#8cc265', size: [0.66, 0.6, 0.66], pos: [0, 0.3, 0] },
]);
const ROCK = buildModel([{ shape: 'dodeca', color: '#a39c90', size: [0.6, 0.42, 0.5] }]);

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();
const p = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

interface TreeSlot {
  cell: number;
  kind: 0 | 1;
  index: number;
  matrix: THREE.Matrix4;
}

/**
 * Trees and rocks as instanced meshes. Trees are tied to cells so they can be
 * removed when forests are cleared for buildings or logged.
 */
export class PropsView {
  readonly group = new THREE.Group();
  private pines: THREE.InstancedMesh;
  private rounds: THREE.InstancedMesh;
  private rocks: THREE.InstancedMesh;
  private slots: TreeSlot[] = [];
  private byCell = new Map<number, TreeSlot[]>();

  constructor(world: World) {
    const w = world;
    const pineM: THREE.Matrix4[] = [];
    const roundM: THREE.Matrix4[] = [];
    const rockM: THREE.Matrix4[] = [];
    const pineC: THREE.Color[] = [];
    const roundC: THREE.Color[] = [];

    for (let y = 0; y < w.size; y++) {
      for (let x = 0; x < w.size; x++) {
        const c = y * w.size + x;
        const f = w.forest[c];
        const biome = BIOME_IDS[w.biome[c]];
        if (f > 0) {
          const count = f > 0.75 ? 3 : f > 0.45 ? 2 : 1;
          for (let k = 0; k < count; k++) {
            if (hash2(x, y, 100 + k) > f + 0.15) continue;
            const gx = x + 0.15 + hash2(x, y, 200 + k) * 0.7;
            const gy = y + 0.15 + hash2(x, y, 300 + k) * 0.7;
            const h = heightAt(w, gx, gy);
            if (h < 0.15) continue;
            const pine = h > 3.2 || hash2(x, y, 400 + k) < 0.35;
            const sc = 0.8 + hash2(x, y, 500 + k) * 0.7;
            q.setFromAxisAngle(up, hash2(x, y, 600 + k) * Math.PI * 2);
            const mat = new THREE.Matrix4().compose(p.set(gx, h - 0.05, gy), q, s.set(sc, sc * (0.9 + hash2(x, y, 700 + k) * 0.4), sc));
            const tv = hash2(x, y, 800 + k);
            const tint = new THREE.Color(1, 1, 1).multiplyScalar(0.95 + tv * 0.15);
            if (tv > 0.86 && !pine) tint.setRGB(1.15, 1.05, 0.7); // a few yellowish crowns
            const slot: TreeSlot = { cell: c, kind: pine ? 0 : 1, index: pine ? pineM.length : roundM.length, matrix: mat };
            (pine ? pineM : roundM).push(mat);
            (pine ? pineC : roundC).push(tint);
            this.slots.push(slot);
            const arr = this.byCell.get(c) ?? [];
            arr.push(slot);
            this.byCell.set(c, arr);
          }
        }
        if ((biome === 'mountain' || biome === 'hills') && hash2(x, y, 900) < (biome === 'mountain' ? 0.1 : 0.03)) {
          const gx = x + 0.2 + hash2(x, y, 901) * 0.6;
          const gy = y + 0.2 + hash2(x, y, 902) * 0.6;
          const sc = 0.6 + hash2(x, y, 903) * 1.1;
          q.setFromAxisAngle(up, hash2(x, y, 904) * 6.28);
          rockM.push(new THREE.Matrix4().compose(p.set(gx, heightAt(w, gx, gy) - 0.1, gy), q, s.set(sc, sc, sc)));
        }
      }
    }
    this.pines = this.instanced(PINE, pineM, pineC);
    this.rounds = this.instanced(ROUND, roundM, roundC);
    this.rocks = this.instanced(ROCK, rockM);
    this.group.add(this.pines, this.rounds, this.rocks);
  }

  private instanced(geo: THREE.BufferGeometry, mats: THREE.Matrix4[], colors?: THREE.Color[]) {
    const mesh = new THREE.InstancedMesh(geo, propMaterial(), Math.max(1, mats.length));
    mesh.count = mats.length;
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    colors?.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  private cleared = new Set<number>();

  /** Permanently remove trees from cells (cleared for a building or road). */
  clearCells(cells: Iterable<number>): void {
    for (const c of cells) {
      this.cleared.add(c);
      this.setDensity(c, 0, 1);
    }
  }

  /**
   * Show a fraction of a cell's trees (forests thinned by logging regrow over
   * time). `density` and `capacity` are the current and original forest values.
   */
  setDensity(cell: number, density: number, capacity: number): void {
    const slots = this.byCell.get(cell);
    if (!slots) return;
    const frac = this.cleared.has(cell) ? 0 : Math.max(0, Math.min(1, density / Math.max(0.01, capacity)));
    const show = Math.round(frac * slots.length + (frac > 0.15 && frac < 1 ? 0.3 : 0));
    const zero = m4.makeScale(0, 0, 0);
    slots.forEach((sl, i) => {
      (sl.kind === 0 ? this.pines : this.rounds).setMatrixAt(sl.index, i < show ? sl.matrix : zero);
    });
    this.pines.instanceMatrix.needsUpdate = true;
    this.rounds.instanceMatrix.needsUpdate = true;
  }
}
