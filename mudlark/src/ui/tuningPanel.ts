// A panel of sliders for the most important tuning values (toggle with F2).
// Changes apply at once, so you can find values you like while driving and
// then copy them into src/config.ts.
import type { VehicleConfig } from '../config';

type NumericKey = { [K in keyof VehicleConfig]: VehicleConfig[K] extends number ? K : never }[keyof VehicleConfig];

interface Field {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

const FIELDS: Field[] = [
  { key: 'springStiffness', label: 'Spring stiffness', min: 8, max: 60, step: 1 },
  { key: 'dampingCompression', label: 'Damping (compress)', min: 0.5, max: 8, step: 0.1 },
  { key: 'dampingRelaxation', label: 'Damping (rebound)', min: 0.5, max: 8, step: 0.1 },
  { key: 'suspensionTravel', label: 'Suspension travel', min: 0.1, max: 0.45, step: 0.01 },
  { key: 'tyreGrip', label: 'Tyre grip', min: 0.2, max: 2, step: 0.05 },
  { key: 'sideGrip', label: 'Side grip', min: 0.2, max: 1, step: 0.05 },
  { key: 'engineForce', label: 'Engine force', min: 2000, max: 16000, step: 250 },
  { key: 'throttleResponse', label: 'Throttle response', min: 0.5, max: 10, step: 0.5 },
  { key: 'maxSpeed', label: 'Top speed (m/s)', min: 8, max: 30, step: 1 },
  { key: 'lowRangeForceMultiplier', label: 'Low range force ×', min: 1, max: 4, step: 0.1 },
  { key: 'lowRangeMaxSpeed', label: 'Low range top speed', min: 2, max: 10, step: 0.5 },
  { key: 'brakeForce', label: 'Brake force', min: 10, max: 150, step: 5 },
  { key: 'handbrakeForce', label: 'Handbrake force', min: 20, max: 300, step: 10 },
  { key: 'engineBrake', label: 'Engine braking', min: 0, max: 20, step: 0.5 },
  { key: 'lowRangeEngineBrake', label: 'Engine braking (low)', min: 0, max: 40, step: 1 },
  { key: 'maxSteerAngle', label: 'Steering angle', min: 0.3, max: 0.8, step: 0.02 },
  { key: 'steerAtTopSpeed', label: 'Steering left at top speed', min: 0.1, max: 1, step: 0.05 },
  { key: 'steerSpeed', label: 'Steering speed', min: 0.5, max: 6, step: 0.1 },
  { key: 'centerOfMassY', label: 'Centre of mass height', min: -0.8, max: 0.4, step: 0.05 },
  { key: 'mass', label: 'Mass (kg)', min: 800, max: 3000, step: 50 },
];

export class TuningPanel {
  private inputs = new Map<NumericKey, { range: HTMLInputElement; value: HTMLElement }>();
  private output: HTMLTextAreaElement;

  /**
   * @param cfg       the live config object of the car (edited in place)
   * @param defaults  the untouched values, for the reset button
   * @param onChange  called after every change so the car can re-read cfg
   */
  constructor(
    private element: HTMLElement,
    private cfg: VehicleConfig,
    private defaults: VehicleConfig,
    private onChange: () => void,
  ) {
    const list = element.querySelector('.tune-list')!;
    for (const f of FIELDS) {
      const row = document.createElement('label');
      row.className = 'tune-row';
      const name = document.createElement('span');
      name.textContent = f.label;
      const value = document.createElement('span');
      value.className = 'tune-value';
      const range = document.createElement('input');
      range.type = 'range';
      range.id = 'tune-' + f.key;
      range.min = String(f.min);
      range.max = String(f.max);
      range.step = String(f.step);
      range.addEventListener('input', () => {
        this.cfg[f.key] = Number(range.value);
        this.refresh();
        this.onChange();
      });
      row.append(name, value, range);
      list.append(row);
      this.inputs.set(f.key, { range, value });
    }

    this.output = element.querySelector('textarea')!;
    element.querySelector('#tune-reset')!.addEventListener('click', () => {
      for (const f of FIELDS) this.cfg[f.key] = this.defaults[f.key];
      this.refresh();
      this.onChange();
    });
    const copyButton = element.querySelector('#tune-copy') as HTMLButtonElement;
    copyButton.addEventListener('click', () => {
      this.output.hidden = false;
      this.output.select();
      // The clipboard may be blocked; the text stays selected so Ctrl+C works.
      navigator.clipboard?.writeText(this.output.value).then(
        () => (copyButton.textContent = 'Copied'),
        () => (copyButton.textContent = 'Press Ctrl+C'),
      );
    });
    this.refresh();
  }

  /** Point the sliders at another car (after switching vehicle or buying an upgrade). */
  setTarget(cfg: VehicleConfig, defaults: VehicleConfig, onChange: () => void): void {
    this.cfg = cfg;
    this.defaults = defaults;
    this.onChange = onChange;
    this.refresh();
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  toggle(): void {
    this.element.hidden = !this.element.hidden;
    // Sliders need the mouse pointer, so give it back.
    if (this.visible) document.exitPointerLock?.();
  }

  private refresh(): void {
    const lines: string[] = [];
    for (const f of FIELDS) {
      const { range, value } = this.inputs.get(f.key)!;
      const v = this.cfg[f.key];
      range.value = String(v);
      value.textContent = String(Math.round(v * 100) / 100);
      value.classList.toggle('is-changed', v !== this.defaults[f.key]);
      lines.push(`  ${f.key}: ${Math.round(v * 100) / 100},`);
    }
    this.output.value = lines.join('\n');
  }
}
