import * as THREE from 'three';
import { GOOD } from '../data/goods';
import { VEHICLES } from '../data/transport';
import type { GameState, Line } from '../sim/state';
import { heightAt } from '../sim/world/query';
import type { World } from '../sim/world/types';
import { buildModel, propMaterial } from './meshkit';

/** Per vehicle type: a body tinted with the owner color and a cargo part tinted with the good color. */
const MODELS: Record<string, { body: THREE.BufferGeometry; cargo: THREE.BufferGeometry; scale: number; water?: boolean }> = {
  truck: {
    body: buildModel([
      { shape: 'box', color: '#ffffff', size: [0.22, 0.2, 0.22], pos: [0.2, 0.05, 0] },
      { shape: 'box', color: '#3b4450', size: [0.62, 0.05, 0.22], pos: [0, 0.02, 0] },
    ]),
    cargo: buildModel([{ shape: 'box', color: '#ffffff', size: [0.38, 0.22, 0.24], pos: [-0.1, 0.07, 0] }]),
    scale: 1.4,
  },
  train: {
    body: buildModel([
      { shape: 'box', color: '#ffffff', size: [0.5, 0.26, 0.24], pos: [0.75, 0.04, 0] },
      { shape: 'cyl', color: '#3b4450', size: [0.06, 0.12, 0.06], pos: [0.9, 0.3, 0], segments: 5 },
      { shape: 'box', color: '#3b4450', size: [2.1, 0.05, 0.2], pos: [-0.05, 0.02, 0] },
    ]),
    cargo: buildModel([
      { shape: 'box', color: '#ffffff', size: [0.42, 0.2, 0.24], pos: [0.2, 0.06, 0] },
      { shape: 'box', color: '#ffffff', size: [0.42, 0.2, 0.24], pos: [-0.27, 0.06, 0] },
      { shape: 'box', color: '#ffffff', size: [0.42, 0.2, 0.24], pos: [-0.74, 0.06, 0] },
    ]),
    scale: 1.3,
  },
  ship: {
    body: buildModel([
      { shape: 'box', color: '#ffffff', size: [1.6, 0.22, 0.5], pos: [0, -0.08, 0] },
      { shape: 'cone', color: '#ffffff', size: [0.5, 0.4, 0.5], pos: [0.9, -0.08, 0], segments: 4 },
      { shape: 'box', color: '#f2f2f2', size: [0.3, 0.35, 0.4], pos: [-0.6, 0.14, 0] },
    ]),
    cargo: buildModel([
      { shape: 'box', color: '#ffffff', size: [0.35, 0.18, 0.38], pos: [-0.15, 0.14, 0] },
      { shape: 'box', color: '#ffffff', size: [0.35, 0.18, 0.38], pos: [0.25, 0.14, 0] },
    ]),
    scale: 1.5,
    water: true,
  },
};
const MAX = 1500;

interface PathCache {
  key: string;
  xs: Float32Array;
  ys: Float32Array;
  cum: Float32Array;
}

/** Trucks (and later trains / ships) moving along their line paths. */
export class VehiclesView {
  readonly group = new THREE.Group();
  private meshes: Record<string, { body: THREE.InstancedMesh; cargo: THREE.InstancedMesh; n: number }> = {};
  private paths = new Map<number, PathCache>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);
  private c = new THREE.Color();
  private empty = new THREE.Color('#d7dde2');

  constructor(private world: World) {
    for (const [id, model] of Object.entries(MODELS)) {
      const body = new THREE.InstancedMesh(model.body, propMaterial(), MAX);
      const cargo = new THREE.InstancedMesh(model.cargo, propMaterial(), MAX);
      for (const m of [body, cargo]) {
        m.count = 0;
        m.castShadow = true;
        m.frustumCulled = false;
        this.group.add(m);
      }
      this.meshes[id] = { body, cargo, n: 0 };
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
    for (const m of Object.values(this.meshes)) m.n = 0;
    for (const line of state.lines) {
      if (line.path.length < 2) continue;
      const mm = this.meshes[line.vehicle] ?? this.meshes.truck;
      const model = MODELS[line.vehicle] ?? MODELS.truck;
      const pc = this.cache(line);
      const speed = VEHICLES[line.vehicle].speed;
      const total = pc.cum[pc.cum.length - 1];
      const ownerColor = colors[line.owner] ?? '#888';
      for (const v of line.vehicles) {
        const i = mm.n;
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
        const side = line.mode === 'road' ? 0.11 : line.mode === 'sea' ? 0.3 : 0;
        const ox = (-dy / len) * side;
        const oy = (dx / len) * side;
        this.q.setFromAxisAngle(this.up, Math.atan2(-dy, dx));
        const ground = model.water ? 0.02 : Math.max(heightAt(this.world, x, y), 0) + 0.08 + (line.mode === 'rail' ? 0.04 : 0);
        this.p.set(x + ox, ground, y + oy);
        this.s.setScalar(model.scale);
        this.m4.compose(this.p, this.q, this.s);
        mm.body.setMatrixAt(i, this.m4);
        mm.cargo.setMatrixAt(i, this.m4);
        mm.body.setColorAt(i, this.c.set(ownerColor));
        mm.cargo.setColorAt(i, v.cargo > 0 ? this.c.set(GOOD[line.good].color) : this.empty);
        mm.n++;
      }
    }
    for (const m of Object.values(this.meshes)) {
      m.body.count = m.n;
      m.cargo.count = m.n;
      m.body.instanceMatrix.needsUpdate = true;
      m.cargo.instanceMatrix.needsUpdate = true;
      if (m.body.instanceColor) m.body.instanceColor.needsUpdate = true;
      if (m.cargo.instanceColor) m.cargo.instanceColor.needsUpdate = true;
    }
  }
}
