// Keeps a 3D object in step with a physics body.
// Physics runs at a fixed 60 steps per second, screens refresh at other rates,
// so we blend between the last two physics states to keep motion smooth.
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';

export class BodySync {
  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();
  private prevRot = new THREE.Quaternion();
  private currRot = new THREE.Quaternion();

  constructor(private body: RAPIER.RigidBody, private object: THREE.Object3D) {
    this.read();
    this.read();
  }

  /** Call after every physics step. */
  read(): void {
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    const p = this.body.translation();
    const q = this.body.rotation();
    this.currPos.set(p.x, p.y, p.z);
    this.currRot.set(q.x, q.y, q.z, q.w);
  }

  /** Call every rendered frame. alpha = how far we are between two physics steps (0..1). */
  apply(alpha: number): void {
    this.object.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.object.quaternion.slerpQuaternions(this.prevRot, this.currRot, alpha);
  }
}
