// Thin wrapper around the Rapier physics world.
// No rendering code in here: this file must also work on a server.
import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS, type SurfaceId } from '../config';

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

/** Quaternion for a rotation of `angle` radians around a (normalised) axis. */
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(angle / 2) };
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  /** Which surface each ground collider is made of (by collider handle). */
  private surfaces = new Map<number, SurfaceId>();

  /** Rapier's WASM must be loaded before the first world is created. */
  static async load(): Promise<void> {
    await RAPIER.init();
  }

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = PHYSICS.timestep;
  }

  /** A box that never moves (ground, ramps, walls). */
  addStaticBox(halfExtents: Vec3, position: Vec3, rotation: Quat, surface: SurfaceId): void {
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation)
      .setFriction(0.9);
    const collider = this.world.createCollider(desc);
    this.surfaces.set(collider.handle, surface);
  }

  /** A loose box that can be pushed around. */
  addDynamicBox(halfExtents: Vec3, position: Vec3, mass: number): RAPIER.RigidBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z),
    );
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setMass(mass)
      .setFriction(0.8);
    this.world.createCollider(desc, body);
    return body;
  }

  /** Surface of a collider. Things that are not ground (crates) count as dirt. */
  surfaceOf(collider: RAPIER.Collider | null): SurfaceId | null {
    if (!collider) return null;
    return this.surfaces.get(collider.handle) ?? 'dirt';
  }

  step(): void {
    this.world.step();
  }
}
