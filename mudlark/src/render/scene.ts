// Renderer, sky, fog, sun and the day/night cycle. Rendering only.
import * as THREE from 'three';
import { SKY } from '../config';

/** Look of the sky for a given height of the sun (-1 = midnight, 1 = noon). */
interface SkyKey {
  h: number;
  /** Colour at the horizon; the fog has the same colour, so far hills fade into it. */
  horizon: number;
  /** Colour straight up. */
  zenith: number;
  sun: number;
  sunPower: number;
  /** Light from the sky (fills the shadows) and bounce light from the ground. */
  skyLight: number;
  groundLight: number;
  ambient: number;
}
const KEYS: SkyKey[] = [
  { h: -1.0, horizon: 0x222f52, zenith: 0x0c1226, sun: 0x8fa8d8, sunPower: 0.55, skyLight: 0x6f84c4, groundLight: 0x2a2f4a, ambient: 0.75 },
  { h: -0.25, horizon: 0x2a3560, zenith: 0x0f1630, sun: 0x8fa8d8, sunPower: 0.5, skyLight: 0x6f84c4, groundLight: 0x2a2f4a, ambient: 0.75 },
  { h: -0.06, horizon: 0xd8768a, zenith: 0x47467a, sun: 0xff9e6b, sunPower: 0.3, skyLight: 0x8f7fc0, groundLight: 0x7a4a52, ambient: 0.85 },
  { h: 0.1, horizon: 0xffb27a, zenith: 0x8d84b8, sun: 0xffa55c, sunPower: 2.1, skyLight: 0xa894d6, groundLight: 0xb86a3c, ambient: 0.95 },
  { h: 0.42, horizon: 0x9ccbd9, zenith: 0x4c8fc4, sun: 0xffd9a0, sunPower: 2.5, skyLight: 0x9db6ee, groundLight: 0xb8793f, ambient: 1.05 },
  { h: 1.0, horizon: 0x93c6dc, zenith: 0x3d86c8, sun: 0xfff0d2, sunPower: 2.6, skyLight: 0xa6c0f0, groundLight: 0xb8793f, ambient: 1.1 },
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
  private zenithColor = new THREE.Color();
  private dome: THREE.Mesh;
  private a = new THREE.Color();
  private b = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = this.skyColor;
    this.scene.fog = new THREE.Fog(0xffffff, 70, 430);

    // Sky dome: a big sphere around the camera, coloured from horizon to zenith.
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(850, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { horizon: { value: this.skyColor }, zenith: { value: this.zenithColor } },
        vertexShader: 'varying float vUp; void main() { vUp = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 horizon; uniform vec3 zenith; varying float vUp;' +
          'void main() { gl_FragColor = vec4(mix(horizon, zenith, smoothstep(0.02, 0.55, vUp)), 1.0);\n#include <colorspace_fragment>\n}',
      }),
    );
    this.dome.renderOrder = -1;
    this.scene.add(this.dome);

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
    this.skyColor.copy(this.a.setHex(k0.horizon)).lerp(this.b.setHex(k1.horizon), t);
    this.zenithColor.copy(this.a.setHex(k0.zenith)).lerp(this.b.setHex(k1.zenith), t);
    this.ambient.color.copy(this.a.setHex(k0.skyLight)).lerp(this.b.setHex(k1.skyLight), t);
    this.ambient.groundColor.copy(this.a.setHex(k0.groundLight)).lerp(this.b.setHex(k1.groundLight), t);
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
    this.dome.position.copy(target);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).add(this.sunOffset);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }
}
