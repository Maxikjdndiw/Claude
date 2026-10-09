import * as THREE from 'three';
import { BIOMES, BIOME_IDS } from '../data/biomes';
import { hash2 } from '../sim/rng';
import { cellSlope } from '../sim/world/generate';
import { heightAt } from '../sim/world/query';
import type { TownSite, World } from '../sim/world/types';
import { buildModel, propMaterial } from './meshkit';

const WALLS = ['#f4efe6', '#f1e2cc', '#efd4c4', '#dfe8ec', '#e9e3f0', '#f6ead0'];
const ROOFS = ['#c96f53', '#b85c4a', '#7d8a99', '#d08a5c', '#a5574b'];

const HOUSE = buildModel([
  { shape: 'box', color: '#ffffff', size: [1, 1, 1] },
]);
const ROOF = buildModel([{ shape: 'prism', color: '#ffffff', size: [1.08, 0.55, 1.1], pos: [0, 1, 0] }]);
const TOWER = buildModel([
  { shape: 'box', color: '#ffffff', size: [1, 1, 1] },
  { shape: 'box', color: '#cfd8dc', size: [0.8, 0.08, 0.8], pos: [0, 1, 0] },
]);

const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export interface TownLayout {
  town: TownSite;
  cells: number[];
}

/** Procedural little towns: clusters of houses that grow with population. */
export class TownsView {
  readonly group = new THREE.Group();
  readonly layouts: TownLayout[] = [];
  private houses!: THREE.InstancedMesh;
  private roofs!: THREE.InstancedMesh;
  private towers!: THREE.InstancedMesh;

  constructor(private world: World) {
    this.rebuild(world.towns);
  }

  rebuild(towns: TownSite[]): void {
    this.group.clear();
    this.layouts.length = 0;
    const w = this.world;
    const houseM: THREE.Matrix4[] = [];
    const houseC: THREE.Color[] = [];
    const roofM: THREE.Matrix4[] = [];
    const roofC: THREE.Color[] = [];
    const towerM: THREE.Matrix4[] = [];
    const towerC: THREE.Color[] = [];
    const used = new Set<number>();

    for (const t of towns) {
      const target = Math.round(6 + Math.sqrt(t.population) * 0.45);
      const towers = t.population > 12000 ? Math.round((t.population - 12000) / 2500) + 2 : 0;
      const cells: number[] = [];
      // Spiral outwards from the center, picking buildable cells.
      for (let r = 0; r < 14 && cells.length < target; r++) {
        for (let oy = -r; oy <= r; oy++) {
          for (let ox = -r; ox <= r; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
            const x = t.x + ox;
            const y = t.y + oy;
            if (x < 1 || y < 1 || x >= w.size - 1 || y >= w.size - 1) continue;
            const c = y * w.size + x;
            if (used.has(c)) continue;
            const b = BIOME_IDS[w.biome[c]];
            if (!BIOMES[b].buildable || cellSlope(w, x, y) > 1) continue;
            // Leave some gaps for streets.
            if ((ox + oy) % 3 === 0 && r > 0 && hash2(x, y, 31) < 0.6) continue;
            if (cells.length >= target) break;
            cells.push(c);
            used.add(c);
          }
        }
      }
      this.layouts.push({ town: t, cells });
      cells.forEach((c, i) => {
        const x = c % w.size;
        const y = (c / w.size) | 0;
        const h0 = hash2(x, y, 41);
        const gx = x + 0.5 + (hash2(x, y, 42) - 0.5) * 0.25;
        const gy = y + 0.5 + (hash2(x, y, 43) - 0.5) * 0.25;
        const gh = heightAt(w, gx, gy) - 0.05;
        tmpQ.setFromAxisAngle(UP, (Math.round(h0 * 4) * Math.PI) / 2 + (hash2(x, y, 44) - 0.5) * 0.3);
        if (i < towers) {
          const height = 1.6 + hash2(x, y, 45) * 2.4;
          towerM.push(new THREE.Matrix4().compose(tmpP.set(gx, gh, gy), tmpQ, tmpS.set(0.7, height, 0.7)));
          towerC.push(new THREE.Color(hash2(x, y, 46) < 0.5 ? '#dfe6ea' : '#ece3d6'));
          return;
        }
        const wd = 0.42 + hash2(x, y, 47) * 0.22;
        const dp = 0.38 + hash2(x, y, 48) * 0.2;
        const ht = 0.32 + hash2(x, y, 49) * 0.3 + (i < target * 0.3 ? 0.2 : 0);
        houseM.push(new THREE.Matrix4().compose(tmpP.set(gx, gh, gy), tmpQ, tmpS.set(wd, ht, dp)));
        houseC.push(new THREE.Color(WALLS[Math.floor(hash2(x, y, 50) * WALLS.length)]));
        roofM.push(new THREE.Matrix4().compose(tmpP.set(gx, gh, gy), tmpQ, tmpS.set(wd, ht, dp)));
        roofC.push(new THREE.Color(ROOFS[Math.floor(hash2(x, y, 51) * ROOFS.length)]));
      });
    }
    // Roof geometry sits at y=1 in model space, so scaling by ht puts it on top of the walls.
    this.houses = inst(HOUSE, houseM, houseC);
    this.roofs = inst(ROOF, roofM, roofC);
    this.towers = inst(TOWER, towerM, towerC);
    this.group.add(this.houses, this.roofs, this.towers);
  }
}

function inst(geo: THREE.BufferGeometry, mats: THREE.Matrix4[], colors: THREE.Color[]) {
  const mesh = new THREE.InstancedMesh(geo, propMaterial(), Math.max(1, mats.length));
  mesh.count = mats.length;
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  colors.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
