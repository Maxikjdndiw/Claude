// All sound is generated in the browser (no audio files):
// an engine hum, mud and water noise, the winch motor, small effects and
// slow, calm background notes.

export interface SoundState {
  /** Speed in m/s (absolute). */
  speed: number;
  /** 0..1 how hard the engine works. */
  throttle: number;
  /** 0..1 wheels spinning in mud. */
  mud: number;
  /** 0..1 driving through water. */
  water: number;
  /** True while the winch motor runs. */
  winching: boolean;
}

// A minor pentatonic scale over two octaves: every combination sounds calm.
const NOTES = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineOsc!: OscillatorNode;
  private engineSub!: OscillatorNode;
  private engineFilter!: BiquadFilterNode;
  private engineGain!: GainNode;
  private mudGain!: GainNode;
  private waterGain!: GainNode;
  private winchGain!: GainNode;
  private musicGain!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private nextNoteAt = 0;
  private muted = false;

  /** Must be called from a click (browsers block sound before that). */
  start(muted: boolean): void {
    this.muted = muted;
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.gain.value = muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    // Engine: two detuned oscillators through a low-pass filter.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = 'square';
    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
    this.engineSub.start();

    // One second of white noise, looped and filtered for mud and water.
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noiseLoop = (type: BiquadFilterType, frequency: number): GainNode => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      return gain;
    };
    this.mudGain = noiseLoop('lowpass', 420);
    this.waterGain = noiseLoop('highpass', 1500);

    // Winch motor: a buzzy low tone.
    const winchOsc = ctx.createOscillator();
    winchOsc.type = 'sawtooth';
    winchOsc.frequency.value = 96;
    const winchFilter = ctx.createBiquadFilter();
    winchFilter.type = 'lowpass';
    winchFilter.frequency.value = 520;
    this.winchGain = ctx.createGain();
    this.winchGain.gain.value = 0;
    winchOsc.connect(winchFilter).connect(this.winchGain).connect(this.master);
    winchOsc.start();

    // Music: soft notes into an echo.
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.5;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.9;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.42;
    this.musicGain.connect(this.master);
    this.musicGain.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(this.master);
    this.nextNoteAt = ctx.currentTime + 2;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.1);
  }

  /** Call every frame. */
  update(s: SoundState): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const rpm = 34 + Math.min(s.speed, 20) * 3.2 + s.throttle * 16;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(rpm / 2 + 0.7, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(220 + s.throttle * 480, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.045 + s.throttle * 0.05, t, 0.1);
    this.mudGain.gain.setTargetAtTime(s.mud * 0.2, t, 0.12);
    this.waterGain.gain.setTargetAtTime(s.water * 0.12, t, 0.15);
    this.winchGain.gain.setTargetAtTime(s.winching ? 0.06 : 0, t, 0.05);

    // Schedule the next quiet note.
    if (t > this.nextNoteAt) {
      this.note(NOTES[Math.floor(Math.random() * NOTES.length)], 0.05, 1.6, 5);
      if (Math.random() < 0.4) this.note(NOTES[Math.floor(Math.random() * 5)] / 2, 0.04, 2, 6);
      this.nextNoteAt = t + 3 + Math.random() * 5;
    }
  }

  private note(frequency: number, volume: number, attack: number, release: number, type: OscillatorType = 'triangle', target?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    osc.connect(gain).connect(target ?? this.musicGain);
    osc.start(t);
    osc.stop(t + attack + release + 0.1);
  }

  /** Pebble picked up. */
  ping(): void {
    if (!this.ctx || this.muted) return;
    this.note(880, 0.09, 0.01, 0.5, 'sine', this.master);
    setTimeout(() => this.note(1318.5, 0.07, 0.01, 0.7, 'sine', this.master), 90);
  }

  /** A knock. strength 0..1 */
  thud(strength: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25 * strength, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 0.3);
  }

  /** Winch hook attached or released. */
  click(): void {
    if (!this.ctx || this.muted) return;
    this.note(520, 0.08, 0.005, 0.12, 'square', this.master);
  }
}
