import * as THREE from 'three';
import { GOOD } from '../data/goods';
import { VEHICLES } from '../data/transport';
import type { GameState, Line } from '../sim/state';
import { heightAt } from '../sim/world/query';
import type { World } from '../sim/world/types';
import { buildModel, propMaterial } from './meshkit';

const CAB = buildModel([
  { shape: 'box', color: '#ffffff', size: [0.22, 0.2, 0.22], pos: [0.2, 0.05, 0] },
  { shape: 'box', color: '#3b4450', size: [0.62, 0.05, 0.22], pos: [0, 0.02, 0] },
]);
const BOX = buildModel([{ shape: 'box', color: '#ffffff', size: [0.38, 0.22, 0.24], pos: [-0.1, 0.07, 0] }]);
const MAX = 2000;

interface PathCache {
  key: string;
  xs: Float32Array;
  ys: Float32Array;
  cum: Float32Array;
}

/** Trucks (and later trains / ships) moving along their line paths. */
export class VehiclesView {
  readonly group = new THREE.Group();
  private cabs: THREE.InstancedMesh;
  private boxes: THREE.InstancedMesh;
  private paths = new Map<number, PathCache>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1.4, 1.4, 1.4);
  private up = new THREE.Vector3(0, 1, 0);
  private c = new THREE.Color();
  private empty = new THREE.Color('#d7dde2');

  constructor(private world: World) {
    this.cabs = new THREE.InstancedMesh(CAB, propMaterial(), MAX);
    this.boxes = new THREE.InstancedMesh(BOX, propMaterial(), MAX);
    for (const m of [this.cabs, this.boxes]) {
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  private cache(line: Line): PathCache {
    const key = `${line.path.length}:${line.path[0]}:${line.path[line.path.length - 1]}`;
    let pc = this.paths.get(line.id);
    if (pc && pc.key === key) return pc;
    const size = this.world.size;
    const n = line.path.length;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const cum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = (line.path[i] % size) + 0.5;
      ys[i] = ((line.path[i] / size) | 0) + 0.5;
      if (i > 0) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    }
    pc = { key, xs, ys, cum };
    this.paths.set(line.id, pc);
    return pc;
  }

  /**
   * Position all vehicles. `frac` (0..1) is how far into the current day we
   * are, so vehicles glide smoothly between simulation steps.
   */
  update(state: GameState, frac: number, colors: string[]): void {
    let i = 0;
    for (const line of state.lines) {
      if (line.path.length < 2) continue;
      const pc = this.cache(line);
      const speed = VEHICLES[line.vehicle].speed;
      const total = pc.cum[pc.cum.length - 1];
      const ownerColor = colors[line.owner] ?? '#888';
      for (const v of line.vehicles) {
        if (i >= MAX) break;
        let d = v.idle ? v.pos : v.pos + v.dir * speed * frac;
        d = Math.max(0, Math.min(total, d));
        // Binary search the segment.
        let lo = 0;
        let hi = pc.cum.length - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (pc.cum[mid] <= d) lo = mid;
          else hi = mid;
        }
        const segLen = pc.cum[hi] - pc.cum[lo] || 1;
        const t = (d - pc.cum[lo]) / segLen;
        const x = pc.xs[lo] + (pc.xs[hi] - pc.xs[lo]) * t;
        const y = pc.ys[lo] + (pc.ys[hi] - pc.ys[lo]) * t;
        let dx = (pc.xs[hi] - pc.xs[lo]) * v.dir;
        let dy = (pc.ys[hi] - pc.ys[lo]) * v.dir;
        if (dx === 0 && dy === 0) dx = 1;
        // Drive on the right-hand side.
        const len = Math.hypot(dx, dy);
        const ox = (-dy / len) * 0.11;
        const oy = (dx / len) * 0.11;
        this.q.setFromAxisAngle(this.up, Math.atan2(-dy, dx));
        this.p.set(x + ox, Math.max(heightAt(this.world, x, y), 0) + 0.08, y + oy);
        this.m4.compose(this.p, this.q, this.s);
        this.cabs.setMatrixAt(i, this.m4);
        this.boxes.setMatrixAt(i, this.m4);
        this.cabs.setColorAt(i, this.c.set(ownerColor));
        this.boxes.setColorAt(i, v.cargo > 0 ? this.c.set(GOOD[line.good].color) : this.empty);
        i++;
      }
    }
    this.cabs.count = i;
    this.boxes.count = i;
    this.cabs.instanceMatrix.needsUpdate = true;
    this.boxes.instanceMatrix.needsUpdate = true;
    if (this.cabs.instanceColor) this.cabs.instanceColor.needsUpdate = true;
    if (this.boxes.instanceColor) this.boxes.instanceColor.needsUpdate = true;
  }
}
