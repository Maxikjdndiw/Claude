// Low-poly models for trees, rocks, posts, grass, pebbles and camps.
// Each model is one merged geometry with vertex colours, so a whole chunk of
// trees is drawn with a single instanced draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { campLayout } from '../sim/world/objects';
import type { Feature } from '../sim/world/terrain';

/** Gives every vertex of a geometry the same colour and moves it into place. */
function part(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}
const merge = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
};

const BARK = 0x6b4a32;

/** A tall, narrow conifer made of stacked tiers. `color` is the foliage colour. */
function pine(color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const tier = (radius: number, height: number, y: number, shade: number) =>
    part(new THREE.ConeGeometry(radius, height, 7), c.clone().multiplyScalar(shade).getHex(), 0, y, 0);
  return merge([
    part(new THREE.CylinderGeometry(0.13, 0.2, 1.3, 5), BARK, 0, 0.65, 0),
    tier(1.35, 1.9, 1.9, 0.78),
    tier(1.15, 1.8, 2.9, 0.86),
    tier(0.95, 1.7, 3.9, 0.94),
    tier(0.72, 1.6, 4.9, 1.02),
    tier(0.48, 1.5, 5.9, 1.1),
  ]);
}
function roundTree(color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const blob = (r: number, x: number, y: number, z: number, shade: number) =>
    part(new THREE.IcosahedronGeometry(r, 0), c.clone().multiplyScalar(shade).getHex(), x, y, z);
  return merge([
    part(new THREE.CylinderGeometry(0.16, 0.22, 2.2, 5), BARK, 0, 1.1, 0),
    blob(1.55, 0, 3.3, 0, 1),
    blob(1.05, 0.95, 2.6, 0.3, 0.86),
    blob(0.9, -0.8, 2.9, -0.5, 1.1),
    blob(0.8, 0.1, 4.3, 0.2, 1.12),
  ]);
}
function bareTree(): THREE.BufferGeometry {
  const branch = (angle: number, y: number, side: number) => {
    const g = new THREE.CylinderGeometry(0.05, 0.08, 1.4, 4);
    g.rotateZ(angle * side);
    g.translate(0.5 * side, y, 0);
    return part(g, 0x6a5b4c);
  };
  return merge([
    part(new THREE.CylinderGeometry(0.1, 0.2, 3.6, 5), 0x6a5b4c, 0, 1.8, 0),
    branch(-0.9, 2.6, 1),
    branch(-1.0, 3.1, -1),
    part(new THREE.IcosahedronGeometry(0.7, 0), 0x77875a, 0, 3.9, 0),
  ]);
}
function rock(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.72, 0);
  g.scale(1, 0.78, 0.9);
  return merge([part(g, 0x8f877c)]);
}
function post(): THREE.BufferGeometry {
  return merge([
    part(new THREE.CylinderGeometry(0.11, 0.14, 1.5, 6), 0x8a6238, 0, 0.75, 0),
    part(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 6), 0xd9972f, 0, 1.25, 0),
  ]);
}
/**
 * A tuft of tall grass: a fan of thin triangles. Vertex colours run from dark
 * at the root to bright at the tip; the hue comes from the instance colour.
 * All normals point up so the whole tuft is lit evenly.
 */
function grassTuft(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const BLADES = 10;
  for (let i = 0; i < BLADES; i++) {
    const angle = (i / BLADES) * Math.PI * 2 + i * 0.7;
    const out = 0.08 + (i % 4) * 0.1; // distance of the root from the centre
    const height = 0.7 + ((i * 5) % 4) * 0.13;
    const lean = 0.22 + (i % 2) * 0.16;
    const cx = Math.cos(angle);
    const cz = Math.sin(angle);
    const rx = cx * out;
    const rz = cz * out;
    // Root edge is at right angles to the direction the blade leans in.
    const a = [rx - cz * 0.11, 0, rz + cx * 0.11];
    const b = [rx + cz * 0.11, 0, rz - cx * 0.11];
    const tip = [rx + cx * lean, height, rz + cz * lean];
    // Each blade twice, once per side, so both sides get the same upward
    // normal and the same light (a double-sided material would darken the back).
    positions.push(...a, ...b, ...tip, ...b, ...a, ...tip);
    for (let k = 0; k < 2; k++) colors.push(0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 1.15, 1.15, 1.15);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return g;
}

/** Foliage colours. Each tree picks one of its type's colours. */
export const PINE_COLORS = [0x2f6352, 0x4f7f43, 0xe3aa3a, 0xd9782c, 0xeec35a];
export const ROUND_COLORS = [0xdc7a2c, 0xe9b744, 0xb8532d, 0x8e9c40];

export class Props {
  /** trees[type][colour variant] */
  readonly trees = [PINE_COLORS.map(pine), ROUND_COLORS.map(roundTree), [bareTree()]];
  /** A single cone that stands in for any tree far away. */
  readonly farTree = merge([part(new THREE.ConeGeometry(1.25, 5.6, 5), 0xffffff, 0, 3.2, 0)]);
  /** Tall grass sways in the wind; `grassTime.value` is advanced every frame. */
  readonly grassTime = { value: 0 };
  readonly grassMaterial = this.makeGrassMaterial();
  readonly rock = rock();
  readonly post = post();
  readonly grass = grassTuft();
  readonly pebble = new THREE.IcosahedronGeometry(0.3, 0);
  /** One shared material for everything with vertex colours. */
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  readonly pebbleMaterial = new THREE.MeshLambertMaterial({ color: 0xfff0c2, emissive: 0xe0a030, emissiveIntensity: 0.9, flatShading: true });
  private fireMaterial = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  private windowMaterial = new THREE.MeshBasicMaterial({ color: 0xffd98a });

  private makeGrassMaterial(): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    // Small shader addition: push the tips sideways with a slow wave.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.grassTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float wave = sin(uTime * 1.6 + instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.27);
            transformed.x += wave * 0.11 * transformed.y * transformed.y;
            transformed.z += wave * 0.05 * transformed.y * transformed.y;
          #endif`,
        );
    };
    return material;
  }

  /** A camp: cabin, tent, campfire and a tall flag you can see from far away. */
  buildCamp(f: Feature): THREE.Group {
    const layout = campLayout(f);
    const group = new THREE.Group();
    const flat = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, f.y + y, z);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
      return m;
    };
    const c = layout.cabin;
    add(new THREE.BoxGeometry(c.halfX * 2, c.halfY * 2, c.halfZ * 2), flat(0x9b6b43), c.x, c.halfY, c.z);
    const roof = add(new THREE.ConeGeometry(4.1, 1.9, 4), flat(0x5a463a), c.x, c.halfY * 2 + 0.95, c.z);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.85);
    add(new THREE.BoxGeometry(0.9, 1.8, 0.1), flat(0x4a3526), c.x + 0.8, 0.9, c.z - c.halfZ - 0.03);
    add(new THREE.BoxGeometry(1.0, 0.8, 0.1), this.windowMaterial, c.x - 1.2, 1.6, c.z - c.halfZ - 0.03);
    add(new THREE.BoxGeometry(0.5, 1.4, 0.5), flat(0x7d7468), c.x - 1.4, c.halfY * 2 + 1.2, c.z + 0.6);

    const tent = add(new THREE.ConeGeometry(2.0, 2.1, 4), flat(0xd9972f), layout.tent.x, 1.05, layout.tent.z);
    tent.rotation.y = 0.5;

    // Campfire: a ring of stones, a flame and a warm light.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(this.rock, flat(0x7d7468), layout.fire.x + Math.cos(a) * 0.7, 0.1, layout.fire.z + Math.sin(a) * 0.7).scale.setScalar(0.35);
    }
    const flame = add(new THREE.ConeGeometry(0.32, 0.9, 5), this.fireMaterial, layout.fire.x, 0.5, layout.fire.z);
    flame.castShadow = false;
    flame.name = 'flame';
    const light = new THREE.PointLight(0xff9a45, 30, 26, 1.8);
    light.position.set(layout.fire.x, f.y + 1.3, layout.fire.z);
    group.add(light);

    // Flag pole.
    add(new THREE.CylinderGeometry(0.07, 0.09, 9, 5), flat(0xd8d2c4), f.x + 0.5, 4.5, f.z + 8);
    add(new THREE.BoxGeometry(1.7, 1.0, 0.06), flat(0xd9972f), f.x + 1.4, 8.4, f.z + 8);
    return group;
  }
}
