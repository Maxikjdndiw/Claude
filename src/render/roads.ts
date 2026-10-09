import * as THREE from 'three';
import { isBridge } from '../sim/roads';
import { heightAt, surfaceAt } from '../sim/world/query';
import type { World } from '../sim/world/types';

const ROAD = new THREE.Color('#e3dccb');
const BRIDGE = new THREE.Color('#b48e64');
const WIDTH = 0.42;

/** Flat ribbons connecting road cells, draped over the terrain. */
export class RoadsView {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private preview: THREE.Mesh | null = null;
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide });
  private previewMat = new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide });

  constructor(private world: World) {}

  private y(gx: number, gy: number, bridge: boolean): number {
    return bridge ? surfaceAt(this.world, gx, gy) + 0.22 : heightAt(this.world, gx, gy) + 0.06;
  }

  /** Build ribbon geometry for a set of road cells. */
  private geometry(cells: Set<number>, width: number): THREE.BufferGeometry {
    const w = this.world;
    const size = w.size;
    const pos: number[] = [];
    const col: number[] = [];
    const push = (x: number, y: number, z: number, c: THREE.Color) => {
      pos.push(x, y, z);
      col.push(c.r, c.g, c.b);
    };
    const seg = (ax: number, ay: number, bx: number, by: number, bridge: boolean) => {
      const steps = 3;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      const nx = (-dy / len) * (width / 2);
      const ny = (dx / len) * (width / 2);
      const c = bridge ? BRIDGE : ROAD;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const x0 = ax + dx * t0;
        const y0 = ay + dy * t0;
        const x1 = ax + dx * t1;
        const y1 = ay + dy * t1;
        const h0 = this.y(x0, y0, bridge);
        const h1 = this.y(x1, y1, bridge);
        push(x0 + nx, h0, y0 + ny, c);
        push(x0 - nx, h0, y0 - ny, c);
        push(x1 + nx, h1, y1 + ny, c);
        push(x1 + nx, h1, y1 + ny, c);
        push(x0 - nx, h0, y0 - ny, c);
        push(x1 - nx, h1, y1 - ny, c);
      }
    };
    const joint = (cx: number, cy: number, bridge: boolean) => {
      const c = bridge ? BRIDGE : ROAD;
      const h = this.y(cx, cy, bridge) + 0.002;
      const r = width / 2;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        push(cx, h, cy, c);
        push(cx + Math.cos(a1) * r, h, cy + Math.sin(a1) * r, c);
        push(cx + Math.cos(a0) * r, h, cy + Math.sin(a0) * r, c);
      }
    };
    const has = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && cells.has(y * size + x);
    for (const c of cells) {
      const x = c % size;
      const y = (c / size) | 0;
      const bridge = isBridge(w, c);
      joint(x + 0.5, y + 0.5, bridge);
      // Orthogonal links.
      if (has(x + 1, y)) seg(x + 0.5, y + 0.5, x + 1.5, y + 0.5, bridge || isBridge(w, c + 1));
      if (has(x, y + 1)) seg(x + 0.5, y + 0.5, x + 0.5, y + 1.5, bridge || isBridge(w, c + size));
      // Diagonals only where no orthogonal detour exists (avoids little triangles).
      if (has(x + 1, y + 1) && !has(x + 1, y) && !has(x, y + 1))
        seg(x + 0.5, y + 0.5, x + 1.5, y + 1.5, bridge || isBridge(w, c + size + 1));
      if (has(x - 1, y + 1) && !has(x - 1, y) && !has(x, y + 1))
        seg(x + 0.5, y + 0.5, x - 0.5, y + 1.5, bridge || isBridge(w, c + size - 1));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }

  rebuild(roads: number[]): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    this.mesh = new THREE.Mesh(this.geometry(new Set(roads), WIDTH), this.material);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.group.add(this.mesh);
  }

  /** Show a planned road (or clear with null). */
  showPreview(cells: number[] | null): void {
    if (this.preview) {
      this.group.remove(this.preview);
      this.preview.geometry.dispose();
      this.preview = null;
    }
    if (!cells || !cells.length) return;
    this.preview = new THREE.Mesh(this.geometry(new Set(cells), WIDTH * 1.25), this.previewMat);
    this.preview.renderOrder = 9;
    this.group.add(this.preview);
  }
}
