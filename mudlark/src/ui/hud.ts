// The in-game display: speed, gear, pebbles, car condition, winch, compass,
// a prompt line and short messages. Only talks to the page, not to the game.

export interface CompassMark {
  /** Direction relative to where the car looks, radians. Positive = to the left. */
  relative: number;
  label: string;
  kind: 'north' | 'camp' | 'challenge';
}

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private speed = $('hud-speed');
  private gear = $('hud-gear');
  private range = $('hud-range');
  private pebbles = $('hud-pebbles');
  private condition = $('hud-condition');
  private winch = $('hud-winch');
  private winchText = $('hud-winch-text');
  private winchBar = $('hud-winch-bar');
  private prompt = $('prompt');
  private toast = $('toast');
  private compass = $('compass');
  private toastTimer = 0;
  private lastPrompt = '';

  setVisible(visible: boolean): void {
    for (const id of ['hud', 'hud-right', 'compass', 'hint']) $(id).hidden = !visible;
    if (!visible) {
      this.prompt.hidden = true;
      this.toast.hidden = true;
    }
  }

  setDrive(speedKmh: number, gear: string, lowRange: boolean): void {
    this.speed.textContent = Math.abs(speedKmh).toFixed(0);
    this.gear.textContent = gear;
    this.range.textContent = lowRange ? 'LOW' : 'HIGH';
    this.range.classList.toggle('is-low', lowRange);
  }

  setStatus(pebbles: number, condition: number): void {
    this.pebbles.textContent = String(pebbles);
    this.condition.textContent = Math.round(condition * 100) + '%';
    this.condition.classList.toggle('is-low', condition < 0.5);
  }

  /** @param strain 0..1 of the maximum pull; pass null when the winch is not attached */
  setWinch(length: number, strain: number | null): void {
    this.winch.hidden = strain === null;
    if (strain === null) return;
    this.winchText.textContent = `rope ${length.toFixed(1)} m`;
    this.winchBar.style.width = Math.round(strain * 100) + '%';
    this.winchBar.classList.toggle('is-high', strain > 0.8);
  }

  setPrompt(text: string): void {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    this.prompt.textContent = text;
    this.prompt.hidden = text === '';
  }

  /** A short message that disappears by itself. */
  say(text: string): void {
    this.toast.textContent = text;
    this.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), 3500);
  }

  setCompass(marks: CompassMark[]): void {
    const width = this.compass.clientWidth;
    const html: string[] = [];
    for (const m of marks) {
      if (Math.abs(m.relative) > Math.PI / 2) continue; // behind the car
      const x = width / 2 - (m.relative / (Math.PI / 2)) * (width / 2);
      html.push(`<span class="mark ${m.kind}" style="left:${x.toFixed(0)}px">${m.label}</span>`);
    }
    this.compass.innerHTML = html.join('');
  }
}
