import * as THREE from 'three';
import { RESOURCES } from '../data/resources';
import { surfaceAt } from '../sim/world/query';
import type { DepositSeed, World } from '../sim/world/types';

const GEM = new THREE.OctahedronGeometry(0.9, 0).scale(1, 1.4, 1);
const PIN = new THREE.CylinderGeometry(0.06, 0.06, 1, 5).translate(0, 0.5, 0);

/** Floating resource markers, the placement cursor and selection rings. */
export class OverlayView {
  readonly group = new THREE.Group();
  private markers = new THREE.Group();
  private gems: THREE.Mesh[] = [];
  readonly cursor: THREE.Mesh;
  readonly selection: THREE.Mesh;
  private cursorRadius = 1;

  constructor(private world: World) {
    this.group.add(this.markers);
    this.cursor = ring('#ffffff', 0.55);
    this.selection = ring('#ffd36b', 0.9);
    this.cursor.visible = false;
    this.selection.visible = false;
    this.group.add(this.cursor, this.selection);
  }

  setDeposits(deposits: DepositSeed[]): void {
    this.markers.clear();
    this.gems = [];
    for (const d of deposits) {
      if (d.hidden || d.amount <= 0) continue;
      const def = RESOURCES[d.resource];
      const h = surfaceAt(this.world, d.x + 0.5, d.y + 0.5);
      const mat = new THREE.MeshStandardMaterial({ color: def.color, flatShading: true, roughness: 0.4, emissive: def.color, emissiveIntensity: 0.15 });
      const gem = new THREE.Mesh(GEM, mat);
      gem.position.set(d.x + 0.5, h + 3.2, d.y + 0.5);
      const pin = new THREE.Mesh(PIN, mat);
      pin.position.set(d.x + 0.5, h, d.y + 0.5);
      pin.scale.y = 2.4;
      this.markers.add(pin);
      gem.castShadow = true;
      gem.userData.baseY = gem.position.y;
      gem.userData.phase = d.id * 1.7;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(d.radius, 20).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.28, depthWrite: false }),
      );
      disc.position.set(d.x + 0.5, h + 0.12, d.y + 0.5);
      disc.renderOrder = 3;
      this.markers.add(gem, disc);
      this.gems.push(gem);
    }
  }

  set markersVisible(v: boolean) {
    this.markers.visible = v;
  }

  get markersVisible(): boolean {
    return this.markers.visible;
  }

  placeCursor(gx: number, gy: number, radius: number, ok = true): void {
    this.cursor.visible = true;
    if (radius !== this.cursorRadius) {
      this.cursor.scale.setScalar(radius);
      this.cursorRadius = radius;
    }
    this.cursor.position.set(gx, surfaceAt(this.world, gx, gy) + 0.25, gy);
    (this.cursor.material as THREE.MeshBasicMaterial).color.set(ok ? '#ffffff' : '#ff7a6b');
  }

  placeSelection(gx: number, gy: number, radius: number): void {
    this.selection.visible = true;
    this.selection.scale.setScalar(radius);
    this.selection.position.set(gx, surfaceAt(this.world, gx, gy) + 0.3, gy);
  }

  update(time: number): void {
    for (const g of this.gems) {
      g.rotation.y = time * 0.8 + g.userData.phase;
      g.position.y = g.userData.baseY + Math.sin(time * 1.5 + g.userData.phase) * 0.25;
    }
    const pulse = 1 + Math.sin(time * 3) * 0.02;
    this.selection.rotation.y = time * 0.2;
    this.selection.scale.x = this.selection.scale.z = this.selection.scale.y * pulse;
  }
}

function ring(color: string, opacity: number): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
  mesh.renderOrder = 10;
  return mesh;
}
