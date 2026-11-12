// The F3 debug overlay: plain text, updated a few times per second.
import { WHEEL_NAMES, type Vehicle } from '../sim/vehicle';

export class DebugOverlay {
  private visible = false;
  private frames = 0;
  private time = 0;
  private fps = 0;

  constructor(private element: HTMLElement) {}

  toggle(): void {
    this.visible = !this.visible;
    this.element.hidden = !this.visible;
  }

  update(dt: number, vehicle: Vehicle, seed: string, cameraMode: string): void {
    this.frames++;
    this.time += dt;
    if (this.time < 0.25) return;
    this.fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (!this.visible) return;

    const p = vehicle.body.translation();
    const lines = [
      `FPS     ${this.fps.toFixed(0)}`,
      `seed    ${seed}`,
      `speed   ${(vehicle.forwardSpeed * 3.6).toFixed(1)} km/h`,
      `gear    ${vehicle.gear}  range ${vehicle.lowRange ? 'LOW' : 'HIGH'}`,
      `pos     ${p.x.toFixed(1)}  ${p.y.toFixed(1)}  ${p.z.toFixed(1)}`,
      `camera  ${cameraMode}`,
      `rope    not attached (winch comes in phase 5)`,
      `wheels`,
      ...vehicle.wheels.map(
        (w, i) =>
          `  ${WHEEL_NAMES[i]}  ${w.inContact ? 'ground' : 'air   '}  ${(w.surface ?? '-').padEnd(8)} spring ${w.suspensionLength.toFixed(2)} m${w.slipping ? '  SLIP' : ''}`,
      ),
    ];
    this.element.textContent = lines.join('\n');
  }
}
