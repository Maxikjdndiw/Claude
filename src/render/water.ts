import * as THREE from 'three';
import { hash2 } from '../sim/rng';
import { Water, type World } from '../sim/world/types';
import { PALETTE } from './palette';
import { jitter } from './terrain';

/**
 * Stylized low-poly water. Vertices are displaced in the vertex shader; the
 * material uses flatShading, so three.js derives per-face normals from screen
 * derivatives and the animated surface stays faceted.
 */
function waterMaterial(color: string, opacity: number, uniforms: { uTime: { value: number } }) {
  const m = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    flatShading: true,
    roughness: 0.3,
    metalness: 0.05,
    depthWrite: false,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aAmp;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(position, 1.0);
        transformed.y += aAmp * (sin(wp.x * 0.55 + uTime * 0.9) * 0.09 + cos(wp.z * 0.47 + uTime * 0.7) * 0.08
          + sin((wp.x + wp.z) * 0.9 + uTime * 1.6) * 0.035);`,
      );
  };
  return m;
}

export class WaterView {
  readonly group = new THREE.Group();
  readonly uniforms = { uTime: { value: 0 } };
  private sea: THREE.Mesh;
  private inland: THREE.Mesh;

  constructor(private world: World) {
    this.sea = this.buildSea();
    this.inland = this.buildInland();
    const seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(world.size * 6, world.size * 6).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: PALETTE.seabed, roughness: 1 }),
    );
    seabed.position.set(world.size / 2, -6.6, world.size / 2);
    seabed.receiveShadow = true;
    this.group.add(seabed, this.sea, this.inland);
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
  }

  private buildSea(): THREE.Mesh {
    const w = this.world;
    // A jittered triangle grid covering the map plus a generous margin.
    const extent = w.size * 2.4;
    const seg = 110;
    const step = extent / seg;
    const origin = w.size / 2 - extent / 2;
    const pos: number[] = [];
    const amp: number[] = [];
    const vx = (i: number, j: number): [number, number] => {
      const ox = i > 0 && i < seg ? (hash2(i, j, 91) - 0.5) * step * 0.6 : 0;
      const oz = j > 0 && j < seg ? (hash2(i, j, 92) - 0.5) * step * 0.6 : 0;
      return [origin + i * step + ox, origin + j * step + oz];
    };
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = vx(i, j);
        const b = vx(i + 1, j);
        const c = vx(i, j + 1);
        const d = vx(i + 1, j + 1);
        for (const p of [a, c, b, b, c, d]) {
          pos.push(p[0], 0, p[1]);
          amp.push(1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aAmp', new THREE.Float32BufferAttribute(amp, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, waterMaterial(PALETTE.sea, 0.78, this.uniforms));
    mesh.position.y = -0.04;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    return mesh;
  }

  private buildInland(): THREE.Mesh {
    const w = this.world;
    const n = w.n;
    const pos: number[] = [];
    const amp: number[] = [];
    const level = (x: number, y: number, fallback: number) => {
      const v = w.waterLevel[y * n + x];
      return Number.isNaN(v) || w.water[y * n + x] === Water.Ocean ? fallback : v;
    };
    for (let y = 0; y < w.size; y++) {
      for (let x = 0; x < w.size; x++) {
        const corners: [number, number][] = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
        let wet = 0;
        let minL = Infinity;
        let ocean = 0;
        for (const [cx, cy] of corners) {
          const k = w.water[cy * n + cx];
          if (k === Water.Lake || k === Water.River) {
            wet++;
            minL = Math.min(minL, w.waterLevel[cy * n + cx]);
          } else if (k === Water.Ocean) ocean++;
        }
        if (wet === 0 || ocean >= 2) continue;
        const pts = corners.map(([cx, cy]) => {
          const [jx, jy] = jitter(w, cx, cy);
          return [cx + jx, level(cx, cy, minL), cy + jy] as const;
        });
        const [a, b, c, d] = pts;
        for (const p of [a, c, b, b, c, d]) {
          pos.push(p[0], p[1], p[2]);
          amp.push(0.35);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aAmp', new THREE.Float32BufferAttribute(amp, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, waterMaterial('#6cc0cb', 0.8, this.uniforms));
    mesh.renderOrder = 2;
    mesh.receiveShadow = true;
    return mesh;
  }
}
