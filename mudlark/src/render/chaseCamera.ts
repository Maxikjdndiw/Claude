// Third-person chase camera with mouse orbit, plus a bonnet view.
import * as THREE from 'three';
import { CAMERA } from '../config';

export type CameraMode = 'chase' | 'bonnet';

/** Shortest way from angle a to angle b. */
function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 600);
  mode: CameraMode = 'chase';

  private yaw = Math.PI; // direction the camera looks along, around the car
  private orbitYaw = 0; // extra angle from the mouse
  private pitch = CAMERA.pitch;
  private distance = CAMERA.distance;
  private idleTime = 99; // seconds since the mouse last moved the camera
  private target = new THREE.Vector3();
  private initialised = false;

  constructor(element: HTMLElement) {
    let dragging = false;
    element.addEventListener('pointerdown', () => (dragging = true));
    window.addEventListener('pointerup', () => (dragging = false));
    window.addEventListener('pointermove', (e) => {
      // Orbit while the mouse is captured (pointer lock) or while dragging.
      if (document.pointerLockElement === element || dragging) this.orbit(e.movementX, e.movementY);
    });
    element.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = THREE.MathUtils.clamp(this.distance * (1 + Math.sign(e.deltaY) * 0.1), CAMERA.minDistance, CAMERA.maxDistance);
      },
      { passive: false },
    );
  }

  /** dx, dy in pixels (mouse) or pixel-like units (gamepad stick). */
  orbit(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.orbitYaw -= dx * CAMERA.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * CAMERA.mouseSensitivity, 0.05, 1.3);
    this.idleTime = 0;
  }

  toggleMode(): void {
    this.mode = this.mode === 'chase' ? 'bonnet' : 'chase';
  }

  /**
   * @param car    the car's 3D object (already at its interpolated position)
   * @param speed  car speed in m/s, used to decide when to swing back behind it
   */
  update(car: THREE.Object3D, speed: number, dt: number): void {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(car.quaternion);

    if (this.mode === 'bonnet') {
      // Sit on the bonnet, look where the car looks.
      const eye = new THREE.Vector3(0, 0.88, 0.62).applyQuaternion(car.quaternion).add(car.position);
      this.camera.position.copy(eye);
      this.camera.quaternion.copy(car.quaternion);
      this.camera.rotateY(Math.PI); // cameras look along -Z, the car drives along +Z
      this.initialised = false;
      return;
    }

    // After a while without mouse input, drift back behind a moving car.
    this.idleTime += dt;
    if (this.idleTime > CAMERA.autoCenterDelay && Math.abs(speed) > 1) {
      this.orbitYaw *= Math.exp(-2 * dt);
    }

    const carYaw = Math.atan2(forward.x, forward.z);
    const blend = this.initialised ? 1 - Math.exp(-CAMERA.followSharpness * dt) : 1;
    this.yaw += angleDelta(this.yaw, carYaw) * blend;
    const lookAt = new THREE.Vector3(car.position.x, car.position.y + 0.9, car.position.z);
    this.target.lerp(lookAt, this.initialised ? 1 - Math.exp(-12 * dt) : 1);
    this.initialised = true;

    const angle = this.yaw + this.orbitYaw;
    const flat = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x - Math.sin(angle) * flat,
      Math.max(0.4, this.target.y + Math.sin(this.pitch) * this.distance),
      this.target.z - Math.cos(angle) * flat,
    );
    this.camera.lookAt(this.target);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
