import * as THREE from 'three';
import { hash2 } from '../sim/rng';
import type { TownLayout } from '../sim/world/townLayout';
import { heightAt } from '../sim/world/query';
import type { World } from '../sim/world/types';
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


/** Procedural little towns: clusters of houses that grow with population. */
export class TownsView {
  readonly group = new THREE.Group();
  private houses!: THREE.InstancedMesh;
  private roofs!: THREE.InstancedMesh;
  private towers!: THREE.InstancedMesh;

  constructor(private world: World) {}

  rebuild(towns: { id: number; x: number; y: number; population: number }[], layouts: TownLayout[]): void {
    this.group.clear();
    const w = this.world;
    const houseM: THREE.Matrix4[] = [];
    const houseC: THREE.Color[] = [];
    const roofM: THREE.Matrix4[] = [];
    const roofC: THREE.Color[] = [];
    const towerM: THREE.Matrix4[] = [];
    const towerC: THREE.Color[] = [];

    for (const t of towns) {
      const cells = layouts.find((l) => l.town === t.id)!.cells;
      const target = cells.length;
      const towers = t.population > 12000 ? Math.round((t.population - 12000) / 2500) + 2 : 0;
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
