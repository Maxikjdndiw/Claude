// Reads keyboard and gamepad and turns them into one simple DriveInput.
// The simulation only ever sees DriveInput, never raw keys.

export interface DriveInput {
  /** -1 (full reverse / brake) .. +1 (full forward). */
  throttle: number;
  /** -1 (left) .. +1 (right). */
  steer: number;
  handbrake: boolean;
  lowRange: boolean;
}

/** One-shot actions (true only in the frame the key was pressed). */
export interface InputActions {
  toggleCamera: boolean;
  toggleDebug: boolean;
  toggleTuning: boolean;
  resetVehicle: boolean;
  /** Right stick of the gamepad, for orbiting the camera. */
  lookX: number;
  lookY: number;
}

const DEADZONE = 0.12;
const deadzone = (v: number) => (Math.abs(v) < DEADZONE ? 0 : v);

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>(); // keys pressed since the last poll
  private lowRange = false;
  private padButtonsBefore: boolean[] = [];
  /** The game ignores driving keys until the player clicked "start". */
  enabled = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      // Stop the browser from scrolling or opening its search bar.
      if (['F2', 'F3', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** Call once per rendered frame. */
  poll(): { drive: DriveInput; actions: InputActions } {
    const actions: InputActions = {
      toggleCamera: this.pressed.has('KeyC'),
      toggleDebug: this.pressed.has('F3') || this.pressed.has('Backquote'),
      toggleTuning: this.pressed.has('F2') || this.pressed.has('KeyP'),
      resetVehicle: this.pressed.has('KeyT'),
      lookX: 0,
      lookY: 0,
    };
    if (this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight')) {
      this.lowRange = !this.lowRange;
    }
    this.pressed.clear();

    let throttle = 0;
    let steer = 0;
    if (this.down('KeyW', 'ArrowUp')) throttle += 1;
    if (this.down('KeyS', 'ArrowDown')) throttle -= 1;
    if (this.down('KeyD', 'ArrowRight')) steer += 1;
    if (this.down('KeyA', 'ArrowLeft')) steer -= 1;
    let handbrake = this.down('Space');

    // Gamepad (standard layout): triggers = gas/brake, left stick = steer,
    // A = handbrake, X = low range, Y = camera, Start = reset, right stick = look.
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const b = pad.buttons.map((x) => x.pressed);
      const justPressed = (i: number) => b[i] && !this.padButtonsBefore[i];
      throttle += (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0);
      steer += deadzone(pad.axes[0] ?? 0);
      handbrake = handbrake || !!b[0];
      if (justPressed(2)) this.lowRange = !this.lowRange;
      if (justPressed(3)) actions.toggleCamera = true;
      if (justPressed(9)) actions.resetVehicle = true;
      if (justPressed(8)) actions.toggleDebug = true;
      actions.lookX = deadzone(pad.axes[2] ?? 0);
      actions.lookY = deadzone(pad.axes[3] ?? 0);
      this.padButtonsBefore = b;
    }

    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const drive: DriveInput = this.enabled
      ? { throttle: clamp(throttle), steer: clamp(steer), handbrake, lowRange: this.lowRange }
      : { throttle: 0, steer: 0, handbrake: true, lowRange: this.lowRange };
    return { drive, actions };
  }
}
