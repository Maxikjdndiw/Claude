// Draws the world around the player: terrain chunks with level of detail,
// instanced trees and rocks, camps, pebbles and the water surface.
import * as THREE from 'three';
import { WORLD } from '../config';
import { chunkKey, type ChunkObjects } from '../sim/world/objects';
import type { Terrain } from '../sim/world/terrain';
import { Props } from './props';
import { buildChunkGeometry } from './terrainMesh';

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
  return WORLD.chunkCells / 4;
}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

export class WorldView {
  readonly group = new THREE.Group();
  private props = new Props();
  private terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
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
  ) {
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshLambertMaterial({ color: 0x4f9aa8, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.renderOrder = 1;
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
    this.water.position.set(x, Math.sin(this.time * 0.6) * 0.03, z);
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

    const ground = new THREE.Mesh(buildChunkGeometry(this.terrain, cx, cz, cells), this.terrainMaterial);
    ground.userData.ownsGeometry = true;
    ground.receiveShadow = true;
    group.add(ground);

    const objects = this.objectsOf(cx, cz);
    const props = this.props;

    // Trees: one instanced mesh per tree type.
    for (let type = 0; type < 3; type++) {
      const list = objects.trees.filter((t) => t.type === type);
      if (list.length === 0) continue;
      const mesh = new THREE.InstancedMesh(props.trees[type], props.material, list.length);
      list.forEach((t, i) => {
        dummy.position.set(t.x, t.y - 0.15, t.z);
        dummy.rotation.set(0, t.turn * Math.PI * 2, 0);
        dummy.scale.set(t.scale, t.scale * (0.9 + t.turn * 0.25), t.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, tint.setScalar(0.86 + t.turn * 0.28));
      });
      mesh.castShadow = near;
      group.add(mesh);
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

    if (near) this.addGrass(cx, cz, group);

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

  /** Grass tufts are decoration only, so they use a simple pattern instead of the world generator. */
  private addGrass(cx: number, cz: number, group: THREE.Group): void {
    const size = WORLD.chunkSize;
    const spots: number[] = [];
    let s = (cx * 73856093) ^ (cz * 19349663);
    const next = () => {
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      return (s >>> 8) / 16777216;
    };
    for (let i = 0; i < 260; i++) {
      const x = (cx + next()) * size;
      const z = (cz + next()) * size;
      const scale = 0.8 + next() * 0.9;
      const g = this.terrain.classify(x, z, 5, 0); // rough check, without the costly height lookup
      if (g.surface !== 'grass' && g.biome !== 'forest') continue;
      const y = this.terrain.height(x, z);
      if (y < 0.4) continue;
      spots.push(x, y, z, scale);
    }
    if (spots.length === 0) return;
    const mesh = new THREE.InstancedMesh(this.props.grass, this.props.material, spots.length / 4);
    for (let i = 0; i < spots.length; i += 4) {
      dummy.position.set(spots[i], spots[i + 1] - 0.05, spots[i + 2]);
      dummy.rotation.set(0, spots[i + 3] * 9, 0);
      dummy.scale.setScalar(spots[i + 3]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i / 4, dummy.matrix);
      mesh.setColorAt(i / 4, tint.setScalar(0.85 + (spots[i + 3] - 0.8) * 0.35));
    }
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
