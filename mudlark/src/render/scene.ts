// Renderer, sky (gradient, sun, clouds, stars), fog, sunlight and the
// day/night cycle. Rendering only.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SKY } from '../config';

/** Final touch on the picture: a little more contrast and colour, darker corners. */
const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(luma), c.rgb, 1.12);            // saturation
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * min(c.rgb, 1.0)), 0.12); // gentle contrast below white
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - dot(d, d) * 0.55;                 // vignette
      gl_FragColor = c;
    }`,
};

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
  { h: -1.0, horizon: 0x222f52, zenith: 0x0a1022, sun: 0x9fb4e0, sunPower: 0.4, skyLight: 0x6f84c4, groundLight: 0x2a2f4a, ambient: 0.42 },
  { h: -0.25, horizon: 0x2a3560, zenith: 0x0d142c, sun: 0x9fb4e0, sunPower: 0.4, skyLight: 0x6f84c4, groundLight: 0x2a2f4a, ambient: 0.45 },
  { h: -0.06, horizon: 0xd8768a, zenith: 0x47467a, sun: 0xff9e6b, sunPower: 0.35, skyLight: 0x8f7fc0, groundLight: 0x7a4a52, ambient: 0.95 },
  { h: 0.1, horizon: 0xffb27a, zenith: 0x7f7cb8, sun: 0xffa55c, sunPower: 2.6, skyLight: 0xa894d6, groundLight: 0xb86a3c, ambient: 1.0 },
  { h: 0.42, horizon: 0xa9d0dd, zenith: 0x3f84c4, sun: 0xffdcab, sunPower: 3.2, skyLight: 0x9db6ee, groundLight: 0xb8793f, ambient: 1.1 },
  { h: 1.0, horizon: 0x9fcbe0, zenith: 0x2f78c4, sun: 0xfff0d8, sunPower: 3.4, skyLight: 0xa6c0f0, groundLight: 0xb8793f, ambient: 1.15 },
];

/** Values shared by the sky, the water and anything else that reflects the sky. */
export interface SkyUniforms {
  horizon: { value: THREE.Color };
  zenith: { value: THREE.Color };
  sunColor: { value: THREE.Color };
  sunDir: { value: THREE.Vector3 };
  night: { value: number };
  time: { value: number };
}

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 horizon;
uniform vec3 zenith;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float night;
uniform float time;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + 7.1;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.6, up));

  // Sun (or moon at night): a soft glow and a small bright disc.
  float s = max(dot(d, sunDir), 0.0);
  color += sunColor * (pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.35);
  color += sunColor * smoothstep(0.9994, 0.9997, s) * 4.0;

  // Stars.
  vec2 sp = d.xz / (d.y + 0.4) * 160.0;
  float star = step(0.985, hash(floor(sp))) * smoothstep(0.22, 0.0, length(fract(sp) - 0.5));
  color += vec3(star) * night * smoothstep(0.03, 0.3, d.y);

  // Slow clouds on a flat layer high above.
  if (d.y > 0.01) {
    vec2 cp = d.xz / (d.y + 0.1) * 1.4 + time * 0.004;
    float cover = smoothstep(0.5, 0.78, fbm(cp));
    float thick = smoothstep(0.5, 0.95, fbm(cp + 0.35 * sunDir.xz));
    vec3 lit = mix(horizon, vec3(1.0), 0.6) + sunColor * 0.3 * pow(s, 3.0);
    vec3 shade = mix(horizon, zenith, 0.5) * 0.75;
    vec3 cloud = mix(lit, shade, thick) * (1.0 - night * 0.8);
    color = mix(color, cloud, cover * 0.85 * smoothstep(0.01, 0.16, d.y));
  }

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
  timeOfDay = SKY.startTime;
  /** 0 in daylight, 1 at night (for headlights). */
  darkness = 0;
  readonly sky: SkyUniforms = {
    horizon: { value: new THREE.Color() },
    zenith: { value: new THREE.Color() },
    sunColor: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    night: { value: 0 },
    time: { value: 0 },
  };
  /** A blurred picture of the sky, used for reflections on the car. Refreshed now and then. */
  reflection: THREE.Texture | null = null;

  private sun: THREE.DirectionalLight;
  private ambient: THREE.HemisphereLight;
  private sunOffset = new THREE.Vector3();
  private dome: THREE.Mesh;
  private pmrem: THREE.PMREMGenerator;
  private reflectionScene = new THREE.Scene();
  private reflectionTarget: THREE.WebGLRenderTarget | null = null;
  private reflectionAge = 99;
  private a = new THREE.Color();
  private b = new THREE.Color();
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  /** "high" adds bloom, colour grading and smoother edges; "low" draws the plain picture. */
  quality: 'high' | 'low' = 'high';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Tone mapping keeps bright sunlight from burning out, like a camera does.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.fog = new THREE.Fog(0xffffff, 80, 430);
    (this.scene.fog as THREE.Fog).color = this.sky.horizon.value;

    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.sky as unknown as Record<string, THREE.IUniform>,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(850, 32, 16), skyMaterial);
    this.dome.renderOrder = -1;
    this.scene.add(this.dome);
    this.reflectionScene.add(new THREE.Mesh(this.dome.geometry, skyMaterial));
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

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
    this.sun.shadow.normalBias = 0.08;
    this.sun.shadow.radius = 2.5;
    this.scene.add(this.ambient, this.sun, this.sun.target);
    this.updateSky(0);
  }

  /** Advances the time of day and updates sky, fog and light colours. */
  updateSky(dt: number, speedUp = 1): void {
    const sky = this.sky;
    sky.time.value += dt;
    this.timeOfDay = (this.timeOfDay + (dt * speedUp) / (SKY.dayLengthMinutes * 60)) % 1;
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const h = Math.sin(angle); // height of the sun

    // Blend between the two nearest sky keys.
    let i = 0;
    while (i < KEYS.length - 2 && h > KEYS[i + 1].h) i++;
    const k0 = KEYS[i];
    const k1 = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((h - k0.h) / (k1.h - k0.h), 0, 1);
    sky.horizon.value.copy(this.a.setHex(k0.horizon)).lerp(this.b.setHex(k1.horizon), t);
    sky.zenith.value.copy(this.a.setHex(k0.zenith)).lerp(this.b.setHex(k1.zenith), t);
    this.ambient.color.copy(this.a.setHex(k0.skyLight)).lerp(this.b.setHex(k1.skyLight), t);
    this.ambient.groundColor.copy(this.a.setHex(k0.groundLight)).lerp(this.b.setHex(k1.groundLight), t);
    this.sun.color.copy(this.a.setHex(k0.sun)).lerp(this.b.setHex(k1.sun), t);
    this.sun.intensity = THREE.MathUtils.lerp(k0.sunPower, k1.sunPower, t);
    this.ambient.intensity = THREE.MathUtils.lerp(k0.ambient, k1.ambient, t);
    this.darkness = 1 - THREE.MathUtils.smoothstep(h, -0.15, 0.15);
    sky.night.value = this.darkness;

    // By day the light comes from the sun, at night from a fixed moon.
    if (h > -0.06) this.sunOffset.set(Math.cos(angle) * 80, Math.max(0.12, h) * 90, 45);
    else this.sunOffset.set(-40, 80, -30);
    sky.sunDir.value.copy(this.sunOffset).normalize();
    sky.sunColor.value.copy(this.sun.color).multiplyScalar(Math.min(1.2, this.sun.intensity / 2.4));

    // Refresh the reflection picture every few seconds (it is not free).
    this.reflectionAge += dt * (speedUp > 1 ? 8 : 1);
    if (this.reflectionAge > 5) {
      this.reflectionAge = 0;
      const old = this.reflectionTarget;
      this.reflectionTarget = this.pmrem.fromScene(this.reflectionScene, 0, 1, 2000);
      this.reflection = this.reflectionTarget.texture;
      old?.dispose();
    }
  }

  /** The shadow area is small and follows the player, which keeps shadows sharp. */
  followWithSun(target: THREE.Vector3): void {
    this.dome.position.copy(target);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).add(this.sunOffset);
  }

  setQuality(quality: 'high' | 'low'): void {
    this.quality = quality;
    // Low draws fewer pixels on sharp screens and a smaller shadow map.
    this.renderer.setPixelRatio(quality === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
    const size = quality === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    const canvas = this.renderer.domElement;
    this.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
  }

  /** Draws one frame, with or without the extra effects. */
  render(camera: THREE.Camera): void {
    if (this.quality === 'low') {
      this.renderer.render(this.scene, camera);
      return;
    }
    if (!this.composer) {
      const size = this.renderer.getSize(new THREE.Vector2());
      // The picture is drawn into a high-range buffer first, so very bright
      // spots (sun, lamps, fire) can glow.
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.renderPass = new RenderPass(this.scene, camera);
      this.composer.addPass(this.renderPass);
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.14, 0.6, 1.25));
      this.composer.addPass(new OutputPass());
      this.composer.addPass(new ShaderPass(GRADE_SHADER));
    }
    this.renderPass!.camera = camera;
    this.composer.render();
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(width, height);
  }
}
