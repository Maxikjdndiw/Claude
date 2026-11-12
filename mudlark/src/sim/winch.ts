// The winch: a rope from the front bumper to a tree or post.
// The rope is simulated as a one-sided spring: it pulls when it is stretched
// and does nothing when it is slack. Reeling in simply shortens it.
import type RAPIER from '@dimforge/rapier3d-compat';
import { WINCH } from '../config';
import type { Anchor } from './world/objects';
import type { Vec3 } from './physicsWorld';

export class Winch {
  anchor: Anchor | null = null;
  /** Current rope length in metres. */
  length = 0;
  /** Pull force in newtons during the last step. */
  tension = 0;
  /** Where the rope leaves the car, in world space (updated every step). */
  readonly hook: Vec3 = { x: 0, y: 0, z: 0 };

  /**
   * @param hookLocal  the rope mounting point in car space (front bumper)
   * @param settings   range, force and so on (a copy of WINCH, so upgrades can change it)
   */
  constructor(private body: RAPIER.RigidBody, private hookLocal: Vec3, readonly settings: typeof WINCH) {}

  /** Recomputes the world position of the hook from the car's position. */
  updateHook(): void {
    const p = this.body.translation();
    const q = this.body.rotation();
    const v = this.hookLocal;
    // Rotate v by quaternion q:  v + 2w(q x v) + 2 q x (q x v)
    const cx = q.y * v.z - q.z * v.y;
    const cy = q.z * v.x - q.x * v.z;
    const cz = q.x * v.y - q.y * v.x;
    this.hook.x = p.x + v.x + 2 * (q.w * cx + q.y * cz - q.z * cy);
    this.hook.y = p.y + v.y + 2 * (q.w * cy + q.z * cx - q.x * cz);
    this.hook.z = p.z + v.z + 2 * (q.w * cz + q.x * cy - q.y * cx);
  }

  distanceTo(a: Anchor): number {
    const dx = a.x - this.hook.x;
    const dy = a.y - this.hook.y;
    const dz = a.z - this.hook.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  attach(anchor: Anchor): void {
    this.updateHook();
    this.anchor = anchor;
    this.length = Math.min(this.settings.maxLength, this.distanceTo(anchor) + 0.3);
  }

  release(): void {
    this.anchor = null;
    this.tension = 0;
  }

  /** Call once per physics step, before the world steps. */
  step(dt: number, reelIn: boolean, reelOut: boolean): void {
    this.updateHook();
    const s = this.settings;
    if (!this.anchor) return;

    // The motor stalls when the rope is already at full pull.
    if (reelIn && this.tension < s.maxForce * 0.97) this.length = Math.max(s.minLength, this.length - s.reelSpeed * dt);
    if (reelOut) this.length = Math.min(s.maxLength, this.length + s.reelSpeed * dt);

    const dx = this.anchor.x - this.hook.x;
    const dy = this.anchor.y - this.hook.y;
    const dz = this.anchor.z - this.hook.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const stretch = dist - this.length;
    if (stretch <= 0 || dist < 0.01) {
      this.tension = 0;
      return;
    }
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;
    // Speed of the car towards the anchor (positive = rope getting slack).
    const v = this.body.linvel();
    const closing = v.x * nx + v.y * ny + v.z * nz;
    const force = Math.max(0, Math.min(s.maxForce, stretch * s.stiffness - closing * s.damping));
    this.tension = force;
    this.body.applyImpulseAtPoint({ x: nx * force * dt, y: ny * force * dt, z: nz * force * dt }, this.hook, true);
  }
}
