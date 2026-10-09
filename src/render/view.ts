import * as THREE from 'three';
import { surfaceAt } from '../sim/world/query';
import type { World } from '../sim/world/types';
import { CameraRig } from './camera';
import { OverlayView } from './overlays';
import { PALETTE } from './palette';
import { PropsView } from './props';
import { TerrainView } from './terrain';
import { TownsView } from './towns';
import { RoadsView } from './roads';
import { VehiclesView } from './vehicles';
import { WaterView } from './water';

export interface Pick {
  /** Continuous grid coordinates. */
  gx: number;
  gy: number;
  /** Integer cell. */
  cx: number;
  cy: number;
}

/** Owns the Three.js scene. Reads world/game state, never mutates it. */
export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly sun: THREE.DirectionalLight;
  world: World | null = null;
  terrain: TerrainView | null = null;
  water: WaterView | null = null;
  props: PropsView | null = null;
  towns: TownsView | null = null;
  roads: RoadsView | null = null;
  vehicles: VehiclesView | null = null;
  overlays: OverlayView | null = null;
  /** Everything on the map lives here, in grid coordinates (1 unit = 1 cell). */
  readonly mapRoot = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private clock = new THREE.Clock();
  private labelLayer: HTMLDivElement;
  private labels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];
  private tmp = new THREE.Vector3();
  /** Hooks for game-side per-frame updates. */
  onFrame?: (dt: number, time: number) => void;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 260, 620);

    const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.35);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.mapRoot);

    this.rig = new CameraRig(this.renderer.domElement, container.clientWidth / container.clientHeight);

    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'labels';
    container.appendChild(this.labelLayer);

    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  get dom(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  setWorld(world: World): void {
    this.mapRoot.clear();
    this.terrain?.material.dispose();
    this.world = world;
    this.terrain = new TerrainView(world);
    this.water = new WaterView(world);
    this.props = new PropsView(world);
    this.towns = new TownsView(world);
    this.roads = new RoadsView(world);
    this.vehicles = new VehiclesView(world);
    this.overlays = new OverlayView(world);
    this.mapRoot.add(
      this.terrain.group,
      this.water.group,
      this.props.group,
      this.towns.group,
      this.roads.group,
      this.vehicles.group,
      this.overlays.group,
    );

    const s = world.size;
    const shadowCam = this.sun.shadow.camera;
    shadowCam.left = -s * 0.75;
    shadowCam.right = s * 0.75;
    shadowCam.top = s * 0.75;
    shadowCam.bottom = -s * 0.75;
    shadowCam.near = 1;
    shadowCam.far = s * 3;
    shadowCam.updateProjectionMatrix();
    this.sun.position.set(s / 2 - s * 0.55, s * 0.9, s / 2 - s * 0.35);
    this.sun.target.position.set(s / 2, 0, s / 2);

    this.rig.bounds.min.set(0, 0);
    this.rig.bounds.max.set(s, s);
    this.rig.focus(s / 2, s / 2, s * 0.95, true);
    this.setTownLabels();
  }

  private setTownLabels(): void {
    this.labelLayer.innerHTML = '';
    this.labels = [];
    if (!this.world) return;
    for (const t of this.world.towns) {
      const el = document.createElement('div');
      el.className = 'town-label';
      el.innerHTML = `<b>${t.name}</b><span>${formatPop(t.population)}</span>`;
      this.labelLayer.appendChild(el);
      this.labels.push({ el, pos: new THREE.Vector3(t.x + 0.5, surfaceAt(this.world, t.x, t.y) + 3.2, t.y + 0.5) });
    }
  }

  /** Refresh label text (population changes). */
  updateTownLabels(towns: { name: string; population: number }[]): void {
    towns.forEach((t, i) => {
      const l = this.labels[i];
      if (!l) return;
      const html = `<b>${t.name}</b><span>${formatPop(t.population)}</span>`;
      if (l.el.innerHTML !== html) l.el.innerHTML = html;
    });
  }

  set labelsVisible(v: boolean) {
    this.labelLayer.style.display = v ? '' : 'none';
  }

  /** Raycast the terrain under a screen position. */
  pick(clientX: number, clientY: number): Pick | null {
    if (!this.terrain || !this.world) return null;
    const rect = this.dom.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
    const hits = this.raycaster.intersectObjects(this.terrain.meshes, false);
    if (!hits.length) return null;
    const p = this.mapRoot.worldToLocal(hits[0].point.clone());
    const size = this.world.size;
    const gx = THREE.MathUtils.clamp(p.x, 0, size - 0.001);
    const gy = THREE.MathUtils.clamp(p.z, 0, size - 0.001);
    return { gx, gy, cx: Math.floor(gx), cy: Math.floor(gy) };
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(0.1, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const w = this.world;
    this.rig.update(dt, (x, z) => (w ? surfaceAt(w, x, z) : 0));
    this.water?.update(t);
    this.overlays?.update(t);
    this.onFrame?.(dt, t);
    this.renderer.render(this.scene, this.rig.camera);
    this.updateLabels();
  }

  private updateLabels(): void {
    if (this.labelLayer.style.display === 'none') return;
    const cam = this.rig.camera;
    const W = this.container.clientWidth;
    const H = this.container.clientHeight;
    for (const l of this.labels) {
      this.tmp.copy(l.pos).project(cam);
      const visible = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.1 && Math.abs(this.tmp.y) < 1.1;
      if (!visible) {
        l.el.style.display = 'none';
        continue;
      }
      l.el.style.display = '';
      const x = (this.tmp.x * 0.5 + 0.5) * W;
      const y = (-this.tmp.y * 0.5 + 0.5) * H;
      l.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
}

export function formatPop(p: number): string {
  return p >= 1000 ? `${(p / 1000).toFixed(1)}k` : `${p}`;
}
