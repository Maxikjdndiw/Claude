// The F3 debug overlay: plain text, updated a few times per second.
export class DebugOverlay {
  private visible = false;
  private frames = 0;
  private time = 0;
  fps = 0;

  constructor(private element: HTMLElement) {}

  toggle(): void {
    this.visible = !this.visible;
    this.element.hidden = !this.visible;
  }

  /** @param lines  called only when the overlay is visible and due for a refresh */
  update(dt: number, lines: () => string[]): void {
    this.frames++;
    this.time += dt;
    if (this.time < 0.25) return;
    this.fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (this.visible) this.element.textContent = [`FPS     ${this.fps.toFixed(0)}`, ...lines()].join('\n');
  }
}
