// A small pool of square particles for mud, water spray and dust.
import * as THREE from 'three';

const COUNT = 260;

export class Particles {
  readonly points: THREE.Points;
  private positions = new Float32Array(COUNT * 3);
  private colors = new Float32Array(COUNT * 3);
  private velocities = new Float32Array(COUNT * 3);
  private life = new Float32Array(COUNT);
  private next = 0;
  private color = new THREE.Color();

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.positions.fill(-9999);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, sizeAttenuation: true }));
    this.points.frustumCulled = false;
  }

  /** Throws one particle. Visual only, so Math.random is fine here. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, colorHex: number): void {
    const i = this.next;
    this.next = (this.next + 1) % COUNT;
    this.positions.set([x, y, z], i * 3);
    this.velocities.set([vx + (Math.random() - 0.5) * 1.5, vy + Math.random() * 1.5, vz + (Math.random() - 0.5) * 1.5], i * 3);
    this.color.setHex(colorHex).multiplyScalar(0.85 + Math.random() * 0.3);
    this.colors.set([this.color.r, this.color.g, this.color.b], i * 3);
    this.life[i] = 0.7 + Math.random() * 0.5;
  }

  update(dt: number): void {
    for (let i = 0; i < COUNT; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -9999;
        continue;
      }
      this.velocities[i * 3 + 1] -= 9.8 * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
