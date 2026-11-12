// Creates and removes the physics shapes (ground, trees, rocks, posts, cabins)
// of the chunks close to the player. Far chunks have no physics at all.
import RAPIER from '@dimforge/rapier3d-compat';
import { WORLD } from '../../config';
import type { PhysicsWorld } from '../physicsWorld';
import { campLayout, chunkKey, type ChunkObjects } from './objects';
import type { Terrain } from './terrain';

export class ChunkPhysics {
  private loaded = new Map<string, RAPIER.Collider[]>();

  constructor(
    private physics: PhysicsWorld,
    private terrain: Terrain,
    private objectsOf: (cx: number, cz: number) => ChunkObjects,
  ) {}

  /** Makes sure the chunks around (x, z) have physics and drops far ones. */
  update(x: number, z: number): void {
    const size = WORLD.chunkSize;
    const pcx = Math.floor(x / size);
    const pcz = Math.floor(z / size);
    const r = WORLD.physicsRadius;
    for (let cx = pcx - r; cx <= pcx + r; cx++) {
      for (let cz = pcz - r; cz <= pcz + r; cz++) {
        if (!this.loaded.has(chunkKey(cx, cz))) this.load(cx, cz);
      }
    }
    for (const [key, colliders] of this.loaded) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > r + 1 || Math.abs(cz - pcz) > r + 1) {
        for (const c of colliders) {
          this.physics.terrainHandles.delete(c.handle);
          this.physics.world.removeCollider(c, false);
        }
        this.loaded.delete(key);
      }
    }
  }

  private load(cx: number, cz: number): void {
    const world = this.physics.world;
    const size = WORLD.chunkSize;
    const n = WORLD.chunkCells;
    const colliders: RAPIER.Collider[] = [];

    // Ground: a height field. Rapier wants the heights column by column.
    const heights = new Float32Array((n + 1) * (n + 1));
    for (let ix = 0; ix <= n; ix++) {
      for (let iz = 0; iz <= n; iz++) {
        heights[ix * (n + 1) + iz] = this.terrain.height(cx * size + (ix / n) * size, cz * size + (iz / n) * size);
      }
    }
    const ground = world.createCollider(
      RAPIER.ColliderDesc.heightfield(n, n, heights, { x: size, y: 1, z: size })
        .setTranslation((cx + 0.5) * size, 0, (cz + 0.5) * size)
        .setFriction(0.9),
    );
    this.physics.terrainHandles.add(ground.handle);
    colliders.push(ground);

    const objects = this.objectsOf(cx, cz);
    for (const t of objects.trees) {
      colliders.push(world.createCollider(RAPIER.ColliderDesc.cylinder(2, 0.2 * t.scale).setTranslation(t.x, t.y + 1.8, t.z)));
    }
    for (const r of objects.rocks) {
      colliders.push(world.createCollider(RAPIER.ColliderDesc.ball(0.6 * r.scale).setTranslation(r.x, r.y + 0.05 * r.scale, r.z).setFriction(0.9)));
    }
    for (const p of objects.posts) {
      colliders.push(world.createCollider(RAPIER.ColliderDesc.cylinder(0.7, 0.13).setTranslation(p.x, p.y + 0.6, p.z)));
    }
    // Cabins of camps centred in this chunk.
    for (const f of this.terrain.featuresNear((cx + 0.5) * size, (cz + 0.5) * size, 1)) {
      if (f.kind !== 'camp' || Math.floor(f.x / size) !== cx || Math.floor(f.z / size) !== cz) continue;
      const { cabin, tent } = campLayout(f);
      colliders.push(world.createCollider(RAPIER.ColliderDesc.cuboid(1.2, 0.9, 1.2).setTranslation(tent.x, f.y + 0.9, tent.z)));
      colliders.push(
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(cabin.halfX, cabin.halfY, cabin.halfZ).setTranslation(cabin.x, f.y + cabin.halfY, cabin.z),
        ),
      );
    }
    this.loaded.set(chunkKey(cx, cz), colliders);
  }
}
