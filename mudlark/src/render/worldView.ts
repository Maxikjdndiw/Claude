// Draws the world around the player: terrain chunks with level of detail,
// instanced trees and rocks, camps, pebbles and the water surface.
import * as THREE from 'three';
import { WORLD } from '../config';
import { chunkKey, type ChunkObjects } from '../sim/world/objects';
import type { Terrain } from '../sim/world/terrain';
import { PINE_COLORS, Props, ROUND_COLORS } from './props';
import type { SkyUniforms } from './scene';
import { buildChunkGeometry, makeDetailTexture, type ChunkMeshData } from './terrainMesh';
import { makeWater } from './water';

interface ChunkView {
  cx: number;
  cz: number;
  cells: number;
  group: THREE.Group;
  pebbleIds: string[];
}

/** Grid cells per chunk side for a chunk that is `distance` chunks away. */
function cellsFor(distance: number): number {
  if (distance <= 1) return WORLD.chunkCells;
  if (distance === 2) return WORLD.chunkCells / 2;
  if (distance <= 4) return WORLD.chunkCells / 4;
  return WORLD.chunkCells / 8;
}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const tintB = new THREE.Color();
const FAR_COLORS = [PINE_COLORS, ROUND_COLORS, [0x77875a]];
/** Which colour variant a tree gets (rendering only). */
const variantOf = (turn: number, count: number) => Math.floor(turn * 977) % count;

export class WorldView {
  readonly group = new THREE.Group();
  private props = new Props();
  private terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeDetailTexture(), side: THREE.DoubleSide });
  private chunks = new Map<string, ChunkView>();
  private queue: { cx: number; cz: number; cells: number; distance: number }[] = [];
  private pebbles = new Map<string, THREE.Mesh>();
  private flames: THREE.Object3D[] = [];
  private water: THREE.Mesh;
  private centre = { cx: 1e9, cz: 1e9 };
  private time = 0;

  constructor(
    private terrain: Terrain,
    private objectsOf: (cx: number, cz: number) => ChunkObjects,
    private isCollected: (pebbleId: string) => boolean,
    sky: SkyUniforms,
    fog: THREE.Fog,
  ) {
    this.water = makeWater(sky, fog);
    this.group.add(this.water);
  }

  /** Number of chunks still waiting to be built. */
  get pending(): number {
    return this.queue.length;
  }

  /**
   * Call every frame with the player position.
   * @param budgetMs  how long this call may spend building chunks
   */
  update(x: number, z: number, dt: number, budgetMs: number): void {
    this.time += dt;
    this.props.grassTime.value = this.time;
    this.water.position.set(x, 0, z);
    for (const f of this.flames) f.scale.y = 1 + Math.sin(this.time * 9 + f.position.x) * 0.2;
    for (const mesh of this.pebbles.values()) {
      mesh.rotation.y = this.time * 1.2;
      mesh.position.y = mesh.userData.baseY + 0.55 + Math.sin(this.time * 2 + mesh.position.x) * 0.12;
    }

    const size = WORLD.chunkSize;
    const pcx = Math.floor(x / size);
    const pcz = Math.floor(z / size);
    if (pcx !== this.centre.cx || pcz !== this.centre.cz) {
      this.centre = { cx: pcx, cz: pcz };
      this.plan(pcx, pcz);
    }

    const start = performance.now();
    while (this.queue.length > 0 && performance.now() - start < budgetMs) {
      const job = this.queue.shift()!;
      this.build(job.cx, job.cz, job.cells);
    }
  }

  /** Decides which chunks are needed at which detail and queues the missing ones. */
  private plan(pcx: number, pcz: number): void {
    const r = WORLD.viewRadius;
    for (const [key, view] of this.chunks) {
      if (Math.abs(view.cx - pcx) > r + 1 || Math.abs(view.cz - pcz) > r + 1) this.remove(key);
    }
    this.queue = [];
    for (let cx = pcx - r; cx <= pcx + r; cx++) {
      for (let cz = pcz - r; cz <= pcz + r; cz++) {
        const distance = Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
        const cells = cellsFor(distance);
        const existing = this.chunks.get(chunkKey(cx, cz));
        if (!existing || existing.cells !== cells) this.queue.push({ cx, cz, cells, distance });
      }
    }
    this.queue.sort((a, b) => a.distance - b.distance);
  }

  private remove(key: string): void {
    const view = this.chunks.get(key);
    if (!view) return;
    this.group.remove(view.group);
    view.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      else if (o instanceof THREE.Mesh && o.userData.ownsGeometry) o.geometry.dispose();
      if (o.name === 'flame') this.flames.splice(this.flames.indexOf(o), 1);
    });
    for (const id of view.pebbleIds) this.pebbles.delete(id);
    this.chunks.delete(key);
  }

  private build(cx: number, cz: number, cells: number): void {
    const key = chunkKey(cx, cz);
    this.remove(key);
    const group = new THREE.Group();
    const view: ChunkView = { cx, cz, cells, group, pebbleIds: [] };
    const near = cells === WORLD.chunkCells;
    const medium = cells >= WORLD.chunkCells / 2;

    const far = cells < WORLD.chunkCells / 4;
    const data = buildChunkGeometry(this.terrain, cx, cz, cells);
    const ground = new THREE.Mesh(data.geometry, this.terrainMaterial);
    ground.userData.ownsGeometry = true;
    ground.receiveShadow = true;
    group.add(ground);

    const objects = this.objectsOf(cx, cz);
    const props = this.props;

    if (far && objects.trees.length > 0) {
      // Far away every tree is one simple cone in the right colour.
      const mesh = new THREE.InstancedMesh(props.farTree, props.material, objects.trees.length);
      objects.trees.forEach((t, i) => {
        dummy.position.set(t.x, t.y - 0.3, t.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(t.scale, t.scale, t.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const palette = FAR_COLORS[t.type];
        mesh.setColorAt(i, tint.setHex(palette[variantOf(t.turn, palette.length)]).multiplyScalar(0.92));
      });
      group.add(mesh);
    } else {
      // Trees: one instanced mesh per tree type and colour.
      for (let type = 0; type < 3; type++) {
        // Detailed models close by, simple ones in the middle distance.
        const variants = (medium ? props.trees : props.simpleTrees)[type];
        for (let variant = 0; variant < variants.length; variant++) {
          const list = objects.trees.filter((t) => t.type === type && variantOf(t.turn, variants.length) === variant);
          if (list.length === 0) continue;
          const mesh = new THREE.InstancedMesh(variants[variant], props.material, list.length);
          list.forEach((t, i) => {
            dummy.position.set(t.x, t.y - 0.15, t.z);
            dummy.rotation.set(0, t.turn * Math.PI * 2, 0);
            dummy.scale.set(t.scale, t.scale * (0.95 + t.turn * 0.35), t.scale);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, tint.setScalar(0.9 + t.turn * 0.2));
          });
          mesh.castShadow = near;
          mesh.receiveShadow = near;
          group.add(mesh);
        }
      }
    }

    // Rocks: small ones only close to the player.
    const rocks = medium ? objects.rocks : objects.rocks.filter((r) => r.scale > 1);
    if (rocks.length > 0) {
      const mesh = new THREE.InstancedMesh(props.rock, props.material, rocks.length);
      rocks.forEach((r, i) => {
        dummy.position.set(r.x, r.y + 0.05 * r.scale, r.z);
        dummy.rotation.set(r.turn * 2, r.turn * 6, r.turn);
        dummy.scale.setScalar(r.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, tint.setScalar(0.85 + r.turn * 0.3));
      });
      mesh.castShadow = mesh.receiveShadow = near;
      group.add(mesh);
    }

    if (medium && objects.posts.length > 0) {
      const mesh = new THREE.InstancedMesh(props.post, props.material, objects.posts.length);
      objects.posts.forEach((p, i) => {
        dummy.position.set(p.x, p.y - 0.1, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, tint.setScalar(1));
      });
      mesh.castShadow = true;
      group.add(mesh);
    }

    if (medium) {
      for (const p of objects.pebbles) {
        if (this.isCollected(p.id)) continue;
        const mesh = new THREE.Mesh(props.pebble, props.pebbleMaterial);
        mesh.position.set(p.x, p.y + 0.55, p.z);
        mesh.userData.baseY = p.y;
        group.add(mesh);
        this.pebbles.set(p.id, mesh);
        view.pebbleIds.push(p.id);
      }
    }

    if (medium) this.addGrass(cx, cz, cells, data, group);

    // Camps centred in this chunk.
    const size = WORLD.chunkSize;
    for (const f of this.terrain.featuresNear((cx + 0.5) * size, (cz + 0.5) * size, 1)) {
      if (f.kind !== 'camp' || Math.floor(f.x / size) !== cx || Math.floor(f.z / size) !== cz) continue;
      const camp = props.buildCamp(f);
      camp.traverse((o) => {
        if (o.name === 'flame') this.flames.push(o);
      });
      group.add(camp);
    }

    this.group.add(group);
    this.chunks.set(key, view);
  }

  /**
   * Tall grass. Decoration only, so it uses a simple pattern instead of the
   * world generator, and reads heights from the chunk mesh that was just built.
   */
  private addGrass(cx: number, cz: number, cells: number, data: ChunkMeshData, group: THREE.Group): void {
    const size = WORLD.chunkSize;
    const near = cells === WORLD.chunkCells;
    const tries = near ? 4200 : 900;
    const n = cells + 1;
    const spots: number[] = [];
    let s = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) | 0;
    const next = () => {
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      return (s >>> 8) / 16777216;
    };
    for (let i = 0; i < tries; i++) {
      const u = next() * cells;
      const v = next() * cells;
      const scale = 0.85 + next() * 0.8;
      const keep = next();
      const ix = Math.min(cells - 1, Math.floor(u));
      const iz = Math.min(cells - 1, Math.floor(v));
      const amount = data.grass[ix * cells + iz];
      if (amount === 0 || (amount === 1 && keep > 0.45)) continue;
      // Height between the 4 corners of the cell.
      const fx = u - ix;
      const fz = v - iz;
      const h0 = data.heights[ix * n + iz] * (1 - fx) + data.heights[(ix + 1) * n + iz] * fx;
      const h1 = data.heights[ix * n + iz + 1] * (1 - fx) + data.heights[(ix + 1) * n + iz + 1] * fx;
      spots.push((cx + u / cells) * size, h0 * (1 - fz) + h1 * fz, (cz + v / cells) * size, scale);
    }
    if (spots.length === 0) return;
    const mesh = new THREE.InstancedMesh(this.props.grass, this.props.grassMaterial, spots.length / 4);
    const width = near ? 1.1 : 2.3; // fewer, wider tufts further away
    for (let i = 0; i < spots.length; i += 4) {
      const x = spots[i];
      const z = spots[i + 2];
      const scale = spots[i + 3];
      dummy.position.set(x, spots[i + 1] - 0.06, z);
      dummy.rotation.set(0, scale * 9, 0);
      dummy.scale.set(scale * width, scale * (near ? 1 : 1.25), scale * width);
      dummy.updateMatrix();
      mesh.setMatrixAt(i / 4, dummy.matrix);
      // Patches drift between gold and orange.
      const patch = 0.5 + 0.5 * Math.sin(x * 0.045 + Math.sin(z * 0.038) * 2.1);
      mesh.setColorAt(i / 4, tint.setHex(0xe0b660).lerp(tintB.setHex(0xcc8a44), patch * 0.8).multiplyScalar(1.12 + (scale - 0.85) * 0.2));
    }
    mesh.receiveShadow = near;
    group.add(mesh);
  }

  /** Hides a pebble that was just picked up. */
  removePebble(id: string): void {
    const mesh = this.pebbles.get(id);
    if (mesh) {
      mesh.parent?.remove(mesh);
      this.pebbles.delete(id);
    }
  }

  dispose(): void {
    for (const key of [...this.chunks.keys()]) this.remove(key);
    this.group.removeFromParent();
  }
}
