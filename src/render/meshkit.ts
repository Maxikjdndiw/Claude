import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Tiny toolkit for composing flat-shaded low-poly models out of primitives
 * with per-part vertex colors. Buildings and props are described as data
 * (see data/buildings.ts) and turned into geometry here.
 */

export type PartShape = 'box' | 'cyl' | 'cone' | 'pyramid' | 'prism' | 'ico' | 'dodeca' | 'sphere';

export interface Part {
  shape: PartShape;
  color: string;
  /** Size: [x, y, z] (width, height, depth). */
  size: [number, number, number];
  /** Position of the part's base center. */
  pos?: [number, number, number];
  /** Rotation around Y in radians. */
  rotY?: number;
  /** Radial segments for cylinders / cones. */
  segments?: number;
}

const tmpColor = new THREE.Color();

function baseGeometry(p: Part): THREE.BufferGeometry {
  const seg = p.segments ?? 6;
  switch (p.shape) {
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    case 'cyl':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, seg).translate(0, 0.5, 0);
    case 'cone':
      return new THREE.ConeGeometry(0.5, 1, seg).translate(0, 0.5, 0);
    case 'pyramid':
      return new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    case 'prism': {
      // Gable roof: triangular prism along X.
      const shape = new THREE.Shape();
      shape.moveTo(-0.5, 0);
      shape.lineTo(0.5, 0);
      shape.lineTo(0, 1);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      g.rotateY(Math.PI / 2);
      return g;
    }
    case 'ico':
      return new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0);
    case 'dodeca':
      return new THREE.DodecahedronGeometry(0.5, 0).translate(0, 0.5, 0);
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 7, 5).translate(0, 0.5, 0);
  }
}

export function partGeometry(p: Part): THREE.BufferGeometry {
  let g = baseGeometry(p);
  g.scale(p.size[0], p.size[1], p.size[2]);
  if (p.rotY) g.rotateY(p.rotY);
  if (p.pos) g.translate(p.pos[0], p.pos[1], p.pos[2]);
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  paint(g, p.color);
  return g;
}

export function paint(g: THREE.BufferGeometry, color: string): void {
  tmpColor.set(color).convertSRGBToLinear();
  const count = g.getAttribute('position').count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = tmpColor.r;
    arr[i * 3 + 1] = tmpColor.g;
    arr[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** Build one merged, vertex-colored geometry from a list of parts. */
export function buildModel(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map(partGeometry);
  const merged = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  return merged;
}

let sharedMaterial: THREE.MeshStandardMaterial | null = null;

/** Shared flat-shaded vertex-color material for all props. */
export function propMaterial(): THREE.MeshStandardMaterial {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.85,
      metalness: 0,
    });
  }
  return sharedMaterial;
}
