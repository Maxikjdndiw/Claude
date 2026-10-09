import * as THREE from 'three';
import { BUILDING, type BuildingDef } from '../data/buildings';
import type { Building, GameState } from '../sim/state';
import { dateOf } from '../sim/time';
import { heightAt } from '../sim/world/query';
import type { World } from '../sim/world/types';
import { buildModel, propMaterial } from './meshkit';

const modelCache = new Map<string, THREE.BufferGeometry>();
const spinCache = new Map<string, THREE.BufferGeometry>();

function modelFor(def: BuildingDef): THREE.BufferGeometry {
  let g = modelCache.get(def.id);
  if (!g) {
    g = buildModel(def.model);
    modelCache.set(def.id, g);
  }
  return g;
}

function spinnerFor(def: BuildingDef): THREE.BufferGeometry | null {
  if (!def.spinner) return null;
  let g = spinCache.get(def.id);
  if (!g) {
    g = buildModel(def.spinner.parts);
    spinCache.set(def.id, g);
  }
  return g;
}

/** Field colors through the year (index = month). */
const FIELD_SEASON = [
  '#9c8a68', '#9c8a68', '#8fae63', '#8fbf5e', '#9ccb5c', '#c9cf63',
  '#e2c25e', '#e6bd55', '#c9a85c', '#a4906a', '#9c8a68', '#9c8a68',
];
const FIELD_GEO = (() => {
  // A furrowed field: alternating raised strips.
  const g = new THREE.BoxGeometry(1, 0.08, 0.16);
  return g.toNonIndexed();
})();

const SCAFFOLD_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));

interface Entry {
  id: number;
  group: THREE.Group;
  body: THREE.Mesh;
  spinner: THREE.Mesh | null;
  fields: THREE.InstancedMesh | null;
  scaffold: THREE.LineSegments;
  level: number;
}

/** Renders company buildings; synced from game state after every sim day. */
export class BuildingsView {
  readonly group = new THREE.Group();
  private entries = new Map<number, Entry>();
  private fieldMat = new THREE.MeshStandardMaterial({ color: FIELD_SEASON[0], flatShading: true, roughness: 1 });
  private month = -1;
  readonly highlight: THREE.Mesh;

  constructor(private world: World) {
    this.highlight = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.95, depthTest: false }),
    );
    this.highlight.renderOrder = 11;
    this.highlight.visible = false;
    this.group.add(this.highlight);
  }

  /** Base height for a footprint (terrain is flattened there on build). */
  private baseY(b: { x: number; y: number }, def: BuildingDef): number {
    const [w, h] = def.footprint;
    return heightAt(this.world, b.x + w / 2, b.y + h / 2);
  }

  sync(state: GameState, companyColors: string[]): void {
    const seen = new Set<number>();
    for (const b of state.buildings) {
      seen.add(b.id);
      let e = this.entries.get(b.id);
      if (!e || e.level !== b.level) {
        if (e) this.remove(e);
        e = this.create(b, companyColors[b.owner] ?? '#888');
        this.entries.set(b.id, e);
      }
      const def = BUILDING[b.type];
      const total = b.level > 1 ? Math.ceil(def.buildDays / 2) : def.buildDays;
      const building = b.buildLeft > 0;
      const progress = building ? 1 - b.buildLeft / Math.max(1, total) : 1;
      e.body.scale.y = building && b.level === 1 ? 0.15 + 0.85 * progress : 1;
      e.scaffold.visible = building;
      if (e.spinner) e.spinner.userData.active = !building && b.rate > 0;
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) this.remove(e);

    const m = dateOf(state.day).getUTCMonth();
    if (m !== this.month) {
      this.month = m;
      this.fieldMat.color.set(FIELD_SEASON[m]);
    }
  }

  private create(b: Building, color: string): Entry {
    const def = BUILDING[b.type];
    const [w, h] = def.footprint;
    const group = new THREE.Group();
    const cx = b.x + w / 2;
    const cy = b.y + h / 2;
    group.position.set(cx, this.baseY(b, def), cy);
    const scale = 1 + (b.level - 1) * 0.18;

    const body = new THREE.Mesh(modelFor(def), propMaterial());
    body.castShadow = true;
    body.receiveShadow = true;
    body.scale.setScalar(scale);
    group.add(body);

    // Company-colored pad marks ownership.
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.1, 0.06, h - 0.1),
      new THREE.MeshStandardMaterial({ color: def.fields ? '#b49a6a' : '#d9d4c7', flatShading: true }),
    );
    pad.position.y = 0.01;
    pad.receiveShadow = true;
    group.add(pad);
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.12, 0.02),
      new THREE.MeshStandardMaterial({ color, flatShading: true }),
    );
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), propMaterial());
    pole.position.set(-w / 2 + 0.2, 0.35, h / 2 - 0.2);
    flag.position.set(-w / 2 + 0.3, 0.62, h / 2 - 0.2);
    group.add(pole, flag);

    let spinner: THREE.Mesh | null = null;
    const sg = spinnerFor(def);
    if (sg && def.spinner) {
      spinner = new THREE.Mesh(sg, propMaterial());
      const [px, py, pz] = def.spinner.pivot;
      spinner.position.set(px * scale, py * scale, pz * scale);
      spinner.scale.setScalar(scale);
      spinner.castShadow = true;
      spinner.userData.axis = def.spinner.axis;
      group.add(spinner);
    }

    let fields: THREE.InstancedMesh | null = null;
    if (def.fields) {
      // Rows of furrows filling the footprint except the farmyard corner.
      const rows = h * 5;
      fields = new THREE.InstancedMesh(FIELD_GEO, this.fieldMat, rows);
      const m4 = new THREE.Matrix4();
      for (let r = 0; r < rows; r++) {
        const z = -h / 2 + (r + 0.5) * (h / rows);
        const inYard = z < -h / 2 + 1.3;
        const width = inYard ? w - 1.6 : w - 0.2;
        const x = inYard ? (w - width) / 2 - 0.1 : 0;
        m4.makeScale(width, 1, 1).setPosition(x, 0.06, z);
        fields.setMatrixAt(r, m4);
      }
      fields.receiveShadow = true;
      group.add(fields);
    }

    const scaffold = new THREE.LineSegments(SCAFFOLD_EDGES, new THREE.LineBasicMaterial({ color: '#d9a441' }));
    scaffold.scale.set(Math.min(w, 2) * 0.9, 1.6 * scale, Math.min(h, 2) * 0.9);
    scaffold.position.y = 0.8 * scale;
    scaffold.visible = false;
    group.add(scaffold);

    group.userData.buildingId = b.id;
    this.group.add(group);
    return { id: b.id, group, body, spinner, fields, scaffold, level: b.level };
  }

  private remove(e: Entry): void {
    this.group.remove(e.group);
    this.entries.delete(e.id);
  }

  select(b: Building | null): void {
    if (!b) {
      this.highlight.visible = false;
      return;
    }
    const def = BUILDING[b.type];
    const [w, h] = def.footprint;
    this.highlight.visible = true;
    this.highlight.scale.setScalar(Math.max(w, h) * 0.85);
    this.highlight.position.set(b.x + w / 2, this.baseY(b, def) + 0.15, b.y + h / 2);
  }

  update(dt: number, speed: number): void {
    for (const e of this.entries.values()) {
      if (e.spinner && e.spinner.userData.active && speed > 0) {
        const r = dt * 1.6 * Math.min(2, speed);
        if (e.spinner.userData.axis === 'z') e.spinner.rotation.z += r;
        else e.spinner.rotation.x += r;
      }
    }
  }

  /** Ghost model used while placing a building. */
  static ghost(def: BuildingDef): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, flatShading: true });
    g.add(new THREE.Mesh(modelFor(def), mat));
    const [w, h] = def.footprint;
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.08, h),
      new THREE.MeshBasicMaterial({ color: '#5bd18b', transparent: true, opacity: 0.45, depthWrite: false }),
    );
    pad.name = 'pad';
    g.add(pad);
    return g;
  }
}
