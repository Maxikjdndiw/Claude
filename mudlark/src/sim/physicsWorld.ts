// Thin wrapper around the Rapier physics world.
// No rendering code in here: this file must also work on a server.
import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS } from '../config';

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export class PhysicsWorld {
  readonly world: RAPIER.World;
  /** Handles of the terrain colliders, to tell ground from rocks, trees and cabins. */
  readonly terrainHandles = new Set<number>();

  /** Rapier's WASM must be loaded before the first world is created. */
  static async load(): Promise<void> {
    await RAPIER.init();
  }

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = PHYSICS.timestep;
  }

  isTerrain(collider: RAPIER.Collider | null): boolean {
    return !!collider && this.terrainHandles.has(collider.handle);
  }

  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}
