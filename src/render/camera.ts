import * as THREE from 'three';

/**
 * Orbit-style strategy camera with smooth damping.
 *  - Left drag: pan   - Right / middle drag: rotate   - Wheel: zoom
 *  - WASD / arrows: pan   - Q / E: rotate   - R / F: zoom
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3();
  yaw = 0.6;
  pitch = 0.9;
  distance = 120;
  private goal = { target: new THREE.Vector3(), yaw: 0.6, pitch: 0.9, distance: 120 };
  private keys = new Set<string>();
  private drag: { button: number; x: number; y: number; moved: number } | null = null;
  bounds = { min: new THREE.Vector2(0, 0), max: new THREE.Vector2(160, 160) };
  minDistance = 12;
  maxDistance = 230;
  /** Slow auto orbit (used behind the main menu). */
  autoRotate = 0;
  /** Callback for a click that was not a drag. */
  onClick?: (e: PointerEvent) => void;
  enabled = true;

  constructor(private dom: HTMLElement, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 2000);
    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** True while the user is dragging (so hover logic can pause). */
  get dragging(): boolean {
    return !!this.drag && this.drag.moved > 4;
  }

  focus(x: number, z: number, distance?: number, instant = false): void {
    this.goal.target.set(x, 0, z);
    if (distance) this.goal.distance = distance;
    if (instant) {
      this.target.copy(this.goal.target);
      this.distance = this.goal.distance;
    }
  }

  setView(yaw: number, pitch: number, distance: number, instant = false): void {
    this.goal.yaw = yaw;
    this.goal.pitch = pitch;
    this.goal.distance = distance;
    if (instant) {
      this.yaw = yaw;
      this.pitch = pitch;
      this.distance = distance;
    }
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.drag = { button: e.button, x: e.clientX, y: e.clientY, moved: 0 };
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.drag.moved += Math.abs(dx) + Math.abs(dy);
    if (this.drag.moved < 4) return;
    if (this.drag.button === 0 && !e.shiftKey) {
      // Pan in the ground plane, scaled by distance.
      const s = this.goal.distance * 0.0016;
      this.panBy(-dx * s, -dy * s);
    } else {
      this.goal.yaw -= dx * 0.005;
      this.goal.pitch = THREE.MathUtils.clamp(this.goal.pitch + dy * 0.004, 0.25, 1.45);
    }
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (d && d.moved < 5 && e.target === this.dom && this.onClick) this.onClick(e);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.enabled) return;
    const f = Math.exp(Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.16);
    this.goal.distance = THREE.MathUtils.clamp(this.goal.distance * f, this.minDistance, this.maxDistance);
  };

  /** Move the target along the camera's ground-plane right / back axes. */
  private panBy(right: number, back: number): void {
    const cos = Math.cos(this.goal.yaw);
    const sin = Math.sin(this.goal.yaw);
    this.goal.target.x += right * cos + back * sin;
    this.goal.target.z += -right * sin + back * cos;
    this.goal.target.x = THREE.MathUtils.clamp(this.goal.target.x, this.bounds.min.x, this.bounds.max.x);
    this.goal.target.z = THREE.MathUtils.clamp(this.goal.target.z, this.bounds.min.y, this.bounds.max.y);
  }

  update(dt: number, groundHeight: (x: number, z: number) => number): void {
    const k = this.keys;
    if (this.enabled) {
      const sp = this.goal.distance * 0.9 * dt;
      if (k.has('w') || k.has('arrowup')) this.panBy(0, -sp);
      if (k.has('s') || k.has('arrowdown')) this.panBy(0, sp);
      if (k.has('a') || k.has('arrowleft')) this.panBy(-sp, 0);
      if (k.has('d') || k.has('arrowright')) this.panBy(sp, 0);
      if (k.has('q')) this.goal.yaw += 1.6 * dt;
      if (k.has('e')) this.goal.yaw -= 1.6 * dt;
      if (k.has('r')) this.goal.distance = Math.max(this.minDistance, this.goal.distance * (1 - dt * 1.5));
      if (k.has('f')) this.goal.distance = Math.min(this.maxDistance, this.goal.distance * (1 + dt * 1.5));
    }
    this.goal.yaw += this.autoRotate * dt;
    const a = 1 - Math.exp(-dt * 9);
    this.target.lerp(this.goal.target, a);
    this.yaw += (this.goal.yaw - this.yaw) * a;
    this.pitch += (this.goal.pitch - this.pitch) * a;
    this.distance += (this.goal.distance - this.distance) * a;
    const ground = Math.max(0, groundHeight(this.target.x, this.target.z));
    this.target.y += (ground - this.target.y) * a;

    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    // Keep the camera above the terrain.
    const under = groundHeight(this.camera.position.x, this.camera.position.z) + 2;
    if (this.camera.position.y < under) this.camera.position.y = under;
    this.camera.lookAt(this.target);
  }
}
