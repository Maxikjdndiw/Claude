// Renderer, sky, fog, sun and the day/night cycle. Rendering only.
import * as THREE from 'three';
import { SKY } from '../config';

/** Look of the sky for a given height of the sun (-1 = midnight, 1 = noon). */
interface SkyKey {
  h: number;
  sky: number;
  sun: number;
  sunPower: number;
  ambient: number;
}
const KEYS: SkyKey[] = [
  { h: -1.0, sky: 0x18233a, sun: 0x8fa8d8, sunPower: 0.55, ambient: 0.5 },
  { h: -0.25, sky: 0x1f2c48, sun: 0x8fa8d8, sunPower: 0.5, ambient: 0.5 },
  { h: -0.06, sky: 0x77688a, sun: 0xff9e6b, sunPower: 0.25, ambient: 0.7 },
  { h: 0.1, sky: 0xf3c29a, sun: 0xffb070, sunPower: 1.9, ambient: 0.9 },
  { h: 0.4, sky: 0xd9e3dc, sun: 0xffdfb0, sunPower: 2.5, ambient: 1.1 },
  { h: 1.0, sky: 0xcfe2e6, sun: 0xfff0d2, sunPower: 2.6, ambient: 1.15 },
];

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
  timeOfDay = SKY.startTime;
  /** 0 in daylight, 1 at night (for headlights). */
  darkness = 0;

  private sun: THREE.DirectionalLight;
  private ambient: THREE.HemisphereLight;
  private sunOffset = new THREE.Vector3();
  private skyColor = new THREE.Color();
  private a = new THREE.Color();
  private b = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = this.skyColor;
    this.scene.fog = new THREE.Fog(0xffffff, 60, 250);

    this.ambient = new THREE.HemisphereLight(0xcfe3ff, 0x8a6a45, 1.1);
    this.sun = new THREE.DirectionalLight(0xffd9a3, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -42;
    cam.right = cam.top = 42;
    cam.near = 1;
    cam.far = 220;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.ambient, this.sun, this.sun.target);
    this.updateSky(0);
  }

  /** Advances the time of day and updates sky, fog and light colours. */
  updateSky(dt: number, speedUp = 1): void {
    this.timeOfDay = (this.timeOfDay + (dt * speedUp) / (SKY.dayLengthMinutes * 60)) % 1;
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const h = Math.sin(angle); // height of the sun

    // Blend between the two nearest sky keys.
    let i = 0;
    while (i < KEYS.length - 2 && h > KEYS[i + 1].h) i++;
    const k0 = KEYS[i];
    const k1 = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((h - k0.h) / (k1.h - k0.h), 0, 1);
    this.skyColor.copy(this.a.setHex(k0.sky)).lerp(this.b.setHex(k1.sky), t);
    (this.scene.fog as THREE.Fog).color.copy(this.skyColor);
    this.sun.color.copy(this.a.setHex(k0.sun)).lerp(this.b.setHex(k1.sun), t);
    this.sun.intensity = THREE.MathUtils.lerp(k0.sunPower, k1.sunPower, t);
    this.ambient.intensity = THREE.MathUtils.lerp(k0.ambient, k1.ambient, t);
    this.darkness = 1 - THREE.MathUtils.smoothstep(h, -0.15, 0.15);

    // By day the light comes from the sun, at night from a fixed moon.
    if (h > -0.06) this.sunOffset.set(Math.cos(angle) * 80, Math.max(0.12, h) * 90, 45);
    else this.sunOffset.set(-40, 80, -30);
  }

  /** The shadow area is small and follows the player, which keeps shadows sharp. */
  followWithSun(target: THREE.Vector3): void {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).add(this.sunOffset);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }
}
