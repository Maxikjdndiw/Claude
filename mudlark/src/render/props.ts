// Low-poly models for trees, rocks, posts, grass, pebbles and camps.
// Each model is one merged geometry with vertex colours, so a whole chunk of
// trees is drawn with a single instanced draw call.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { campLayout } from '../sim/world/objects';
import type { Feature } from '../sim/world/terrain';

/** A repeatable pseudo-random number from a position (so shared corners move together). */
function hash3(x: number, y: number, z: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

interface PartOptions {
  /** Push vertices in and out by up to this much, for a natural, uneven shape. */
  jitter?: number;
  /** Brightness at the bottom and top of the part (blended over its height). */
  shade?: [number, number];
}

/** Colours a geometry, optionally roughens and shades it, and moves it into place. */
function part(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, options: PartOptions = {}): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  if (options.jitter) {
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      const k = 1 + (hash3(px, py, pz) - 0.5) * 2 * options.jitter;
      pos.setXYZ(i, px * k, py * (1 + (k - 1) * 0.5), pz * k);
    }
  }
  g.computeBoundingBox();
  const minY = g.boundingBox!.min.y;
  const spanY = Math.max(0.001, g.boundingBox!.max.y - minY);
  const c = new THREE.Color(color);
  const [low, high] = options.shade ?? [1, 1];
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = low + (high - low) * ((pos.getY(i) - minY) / spanY);
    colors.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  g.translate(x, y, z);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}
/** Joins parts into one geometry with flat faces (for simple, far-away models). */
const merge = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
};
/** Joins parts into one geometry with smooth, rounded shading. */
const mergeSmooth = (parts: THREE.BufferGeometry[]) => {
  const g = mergeVertices(mergeGeometries(parts)!, 0.001);
  g.computeVertexNormals();
  return g;
};

const BARK = 0x5e4330;

// --- detailed models, used close to the player --------------------------------------

/** A tall conifer: many drooping tiers, dark inside and bright at the branch tips. */
function pine(color: number): THREE.BufferGeometry {
  const parts = [part(new THREE.CylinderGeometry(0.07, 0.22, 7.2, 7), BARK, 0, 3.6, 0, { shade: [0.8, 1.1] })];
  const TIERS = 9;
  for (let i = 0; i < TIERS; i++) {
    const t = i / (TIERS - 1);
    const radius = 1.55 - t * 1.2;
    const height = 1.5 - t * 0.5;
    const cone = new THREE.ConeGeometry(radius, height, 9, 2, true);
    cone.rotateY(i * 0.7);
    // The rim of each tier (the branch tips) catches the light; the top hides under the next tier.
    parts.push(part(cone, color, 0, 1.7 + t * 5.2, 0, { jitter: 0.13, shade: [1.12, 0.62] }));
  }
  return mergeSmooth(parts);
}

/** A leaf tree: a lumpy crown made of several rounded masses. */
function roundTree(color: number): THREE.BufferGeometry {
  const crown = (r: number, x: number, y: number, z: number) =>
    part(new THREE.IcosahedronGeometry(r, 1), color, x, y, z, { jitter: 0.16, shade: [0.66, 1.14] });
  const branch = (angle: number, turn: number) => {
    const g = new THREE.CylinderGeometry(0.05, 0.09, 1.5, 5);
    g.translate(0, 0.75, 0);
    g.rotateZ(angle);
    g.rotateY(turn);
    return part(g, BARK, 0, 2.0, 0);
  };
  return mergeSmooth([
    part(new THREE.CylinderGeometry(0.13, 0.26, 2.9, 7), BARK, 0, 1.45, 0, { shade: [0.8, 1.1] }),
    branch(0.8, 0.3),
    branch(-0.7, 1.9),
    branch(0.75, 3.6),
    crown(1.45, 0, 3.7, 0),
    crown(1.05, 1.0, 3.0, 0.35),
    crown(0.95, -0.85, 3.2, -0.55),
    crown(0.9, 0.15, 3.1, -1.0),
    crown(0.85, 0.2, 4.6, 0.25),
  ]);
}

function rock(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.72, 1);
  g.scale(1, 0.78, 0.9);
  return mergeSmooth([part(g, 0x8b8494, 0, 0, 0, { jitter: 0.2, shade: [0.72, 1.1] })]);
}

// --- simple models, used further away ---------------------------------------------------

function simplePine(color: number): THREE.BufferGeometry {
  const tier = (radius: number, height: number, y: number) => part(new THREE.ConeGeometry(radius, height, 7), color, 0, y, 0, { shade: [1.05, 0.8] });
  return merge([
    part(new THREE.CylinderGeometry(0.13, 0.2, 1.6, 5), BARK, 0, 0.8, 0),
    tier(1.4, 2.2, 2.2),
    tier(1.1, 2.1, 3.6),
    tier(0.8, 2.0, 5.0),
    tier(0.5, 1.8, 6.3),
  ]);
}
function simpleRound(color: number): THREE.BufferGeometry {
  const blob = (r: number, x: number, y: number, z: number) => part(new THREE.IcosahedronGeometry(r, 0), color, x, y, z, { shade: [0.75, 1.1] });
  return merge([
    part(new THREE.CylinderGeometry(0.16, 0.24, 2.6, 5), BARK, 0, 1.3, 0),
    blob(1.55, 0, 3.6, 0),
    blob(1.05, 0.95, 3.0, 0.3),
    blob(0.9, -0.8, 3.2, -0.5),
  ]);
}
function bareTree(): THREE.BufferGeometry {
  const branch = (angle: number, y: number, turn: number) => {
    const g = new THREE.CylinderGeometry(0.03, 0.08, 1.5, 5);
    g.translate(0, 0.75, 0);
    g.rotateZ(angle);
    g.rotateY(turn);
    return part(g, 0x6a5b4c, 0, y, 0);
  };
  return mergeSmooth([
    part(new THREE.CylinderGeometry(0.06, 0.2, 4.2, 6), 0x6a5b4c, 0, 2.1, 0, { shade: [0.8, 1.1] }),
    branch(0.9, 2.2, 0.4),
    branch(-0.8, 2.8, 2.0),
    branch(0.7, 3.3, 4.1),
    part(new THREE.IcosahedronGeometry(0.6, 1), 0x7c8a58, 0, 4.3, 0, { jitter: 0.2, shade: [0.7, 1.1] }),
  ]);
}
function post(): THREE.BufferGeometry {
  return merge([
    part(new THREE.CylinderGeometry(0.11, 0.14, 1.5, 8), 0x8a6238, 0, 0.75, 0, { shade: [0.8, 1.05] }),
    part(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 8), 0xd9972f, 0, 1.25, 0),
  ]);
}

/**
 * A tuft of tall grass: thin blades that bend over towards the tip.
 * Vertex colours run from dark at the root to bright at the tip; the hue
 * comes from the instance colour. All normals point up so the tuft is lit evenly.
 */
function grassTuft(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const BLADES = 9;
  for (let i = 0; i < BLADES; i++) {
    const angle = (i / BLADES) * Math.PI * 2 + i * 0.7;
    const out = 0.05 + (i % 4) * 0.09; // distance of the root from the centre
    const height = 0.65 + ((i * 5) % 4) * 0.14;
    const lean = 0.16 + (i % 3) * 0.12;
    const cx = Math.cos(angle);
    const cz = Math.sin(angle);
    const rx = cx * out;
    const rz = cz * out;
    const w = 0.042; // half width at the root
    // root left, root right, middle left, middle right, tip
    const p = [
      [rx - cz * w, 0, rz + cx * w],
      [rx + cz * w, 0, rz - cx * w],
      [rx + cx * lean * 0.35 - cz * w * 0.7, height * 0.55, rz + cz * lean * 0.35 + cx * w * 0.7],
      [rx + cx * lean * 0.35 + cz * w * 0.7, height * 0.55, rz + cz * lean * 0.35 - cx * w * 0.7],
      [rx + cx * lean, height, rz + cz * lean],
    ];
    const shade = [0.62, 0.62, 0.95, 0.95, 1.2];
    for (const k of [0, 1, 2, 2, 1, 3, 2, 3, 4]) {
      positions.push(...p[k]);
      colors.push(shade[k], shade[k], shade[k]);
    }
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
export const PINE_COLORS = [0x2c5a4a, 0x47723e, 0xcfa043, 0xc27434, 0xd9b55e];
export const ROUND_COLORS = [0xc87632, 0xd6ab4a, 0xa85433, 0x86923f];

export class Props {
  /** Detailed trees for close up: trees[type][colour variant] */
  readonly trees = [PINE_COLORS.map(pine), ROUND_COLORS.map(roundTree), [bareTree()]];
  /** Simple trees for the middle distance. */
  readonly simpleTrees = [PINE_COLORS.map(simplePine), ROUND_COLORS.map(simpleRound), [bareTree()]];
  /** A single cone that stands in for any tree far away. */
  readonly farTree = merge([part(new THREE.ConeGeometry(1.25, 6.4, 6), 0xffffff, 0, 3.6, 0, { shade: [1.05, 0.8] })]);
  /** Tall grass sways in the wind; `grassTime.value` is advanced every frame. */
  readonly grassTime = { value: 0 };
  readonly grassMaterial = this.makeGrassMaterial();
  readonly rock = rock();
  readonly post = post();
  readonly grass = grassTuft();
  readonly pebble = new THREE.IcosahedronGeometry(0.3, 1);
  /** One shared material for everything with vertex colours. */
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  readonly pebbleMaterial = new THREE.MeshLambertMaterial({ color: 0xfff0c2, emissive: 0xe0a030, emissiveIntensity: 0.9 });
  private fireMaterial = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  private windowMaterial = new THREE.MeshBasicMaterial({ color: 0xffd98a });

  private makeGrassMaterial(): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    // Small shader additions: sway in the wind, and light both sides of a blade the same: push the tips sideways with a slow wave.
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
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        'vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;',
      );
    };
    return material;
  }

  /** A camp: cabin, tent, campfire and a tall flag you can see from far away. */
  buildCamp(f: Feature): THREE.Group {
    const layout = campLayout(f);
    const group = new THREE.Group();
    const flat = (color: number) => new THREE.MeshLambertMaterial({ color });
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
