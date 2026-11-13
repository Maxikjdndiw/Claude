// Builds the car: a boxy, upright 4x4 with softly rounded panels, glossy
// paint that reflects the sky, glass, round lamps and treaded tyres.
// Original design. No logos or badges.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VehicleConfig } from '../config';
import type { Vehicle } from '../sim/vehicle';

export interface CarColors {
  body: number;
  roof: number;
}

const standard = (color: number, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 0.55, ...extra });

export class CarModel {
  /** Follows the chassis rigid body. */
  readonly group = new THREE.Group();
  private wheelPivots: THREE.Group[] = []; // moves with suspension + steering
  private wheelSpinners: THREE.Group[] = []; // spins around the axle
  private lampMaterial: THREE.MeshStandardMaterial;
  private headlight: THREE.SpotLight;
  private materials: THREE.MeshStandardMaterial[] = [];
  private wheelGeometry: { tyre: THREE.BufferGeometry; tread: THREE.BufferGeometry; rim: THREE.BufferGeometry; nuts: THREE.BufferGeometry };
  private tyreMaterial: THREE.MeshStandardMaterial;
  private rimMaterial: THREE.MeshStandardMaterial;
  private darkMaterial: THREE.MeshStandardMaterial;

  constructor(private cfg: VehicleConfig, colors: CarColors = { body: 0x6f8f72, roof: 0xf0e6d0 }) {
    const he = cfg.chassisHalfExtents;
    const mat = (m: THREE.MeshStandardMaterial) => {
      this.materials.push(m);
      return m;
    };
    const paint = mat(standard(colors.body, 0.42, 0.25));
    const roofPaint = mat(standard(new THREE.Color(colors.roof).multiplyScalar(0.8).getHex(), 0.6, 0.05));
    const dark = (this.darkMaterial = mat(standard(0x1d1c1b, 0.85)));
    const glass = mat(standard(0x10191e, 0.06, 0.9));
    const metal = mat(standard(0xa2a4a1, 0.35, 0.85));
    const canvasBag = mat(standard(0xb58a4f, 0.95));
    const crate = mat(standard(0x4a6878, 0.8));
    this.tyreMaterial = mat(standard(0x161514, 0.95));
    this.rimMaterial = mat(standard(0xd8d2c2, 0.5, 0.4));
    this.lampMaterial = mat(standard(0xfff6dc, 0.2, 0, { emissive: 0xffd98a, emissiveIntensity: 0.6 }));
    const tail = mat(standard(0xb5302a, 0.35, 0, { emissive: 0x801512, emissiveIntensity: 0.6 }));
    const amber = mat(standard(0xe08a2a, 0.35, 0, { emissive: 0x7a3d08, emissiveIntensity: 0.4 }));

    /** Adds a box. `round` > 0 softens its edges. */
    const add = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, round = 0) => {
      const geo = round > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(round, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    const width = he.x * 2 + 0.1;
    const length = he.z * 2;
    const floorY = -he.y + 0.08; // underside of the body
    const beltY = 0.3; // top of the lower body (bottom of the windows)
    const roofY = 1.02;
    const cabinFront = length / 2 - 1.25; // where the windshield stands
    const cabinBack = -length / 2;
    const cabinLen = cabinFront - cabinBack;
    const cabinZ = (cabinFront + cabinBack) / 2;
    const side = width / 2;

    // Lower body, bonnet, cabin, roof.
    add(paint, width, beltY - floorY, length, 0, (beltY + floorY) / 2, 0, 0.07);
    add(paint, width - 0.24, 0.16, 1.22, 0, beltY + 0.06, cabinFront + 0.62, 0.06);
    add(paint, width - 0.06, roofY - beltY + 0.05, cabinLen, 0, (roofY + beltY) / 2 - 0.02, cabinZ, 0.06);
    add(roofPaint, width + 0.02, 0.1, cabinLen + 0.08, 0, roofY + 0.03, cabinZ, 0.045);
    // Dark sill along the bottom and the chassis underneath.
    add(dark, width + 0.02, 0.1, length - 0.3, 0, floorY + 0.03, 0);
    add(dark, width - 0.5, 0.22, length - 0.5, 0, floorY - 0.1, 0);

    // Windows: glass set slightly proud of the cabin.
    const winH = roofY - beltY - 0.22;
    const winY = (roofY + beltY) / 2 + 0.03;
    add(glass, width - 0.28, winH, 0.03, 0, winY, cabinFront + 0.012, 0.012); // upright windshield
    add(glass, width - 0.55, winH - 0.12, 0.03, 0, winY, cabinBack - 0.012, 0.012);
    const rearLen = cabinLen - 1.38;
    for (const s of [1, -1]) {
      add(glass, 0.03, winH, 0.78, s * (side - 0.02), winY, cabinFront - 0.55, 0.012);
      add(glass, 0.03, winH - 0.06, rearLen, s * (side - 0.02), winY, cabinBack + rearLen / 2 + 0.16, 0.012);
      // Door gaps, handle and hinges.
      add(dark, 0.012, beltY - floorY - 0.12, 0.015, s * (side + 0.001), (beltY + floorY) / 2 + 0.03, cabinFront - 0.06);
      add(dark, 0.012, roofY - floorY - 0.2, 0.015, s * (side + 0.001), (roofY + floorY) / 2, cabinFront - 1.0);
      add(metal, 0.03, 0.035, 0.13, s * (side + 0.012), beltY - 0.08, cabinFront - 0.86, 0.01);
      // Wheel-arch flares.
      for (const end of [1, -1]) {
        add(dark, 0.12, 0.08, cfg.wheelRadius * 2 + 0.34, s * (side + 0.03), floorY + 0.38, (end * cfg.wheelBase) / 2, 0.03);
        add(dark, 0.12, 0.3, 0.07, s * (side + 0.03), floorY + 0.24, (end * cfg.wheelBase) / 2 + cfg.wheelRadius + 0.15, 0.03);
        add(dark, 0.12, 0.3, 0.07, s * (side + 0.03), floorY + 0.24, (end * cfg.wheelBase) / 2 - cfg.wheelRadius - 0.15, 0.03);
      }
      // Mirrors on short arms.
      add(dark, 0.14, 0.03, 0.03, s * (side + 0.07), beltY + 0.22, cabinFront - 0.02);
      add(dark, 0.05, 0.2, 0.13, s * (side + 0.15), beltY + 0.24, cabinFront - 0.03, 0.02);
      // Lamps at the back, indicators at the front.
      add(tail, 0.1, 0.2, 0.04, s * (side - 0.12), beltY - 0.25, -length / 2 - 0.012, 0.015);
      add(amber, 0.1, 0.09, 0.04, s * (side - 0.12), beltY - 0.05, -length / 2 - 0.012, 0.015);
      add(amber, 0.1, 0.09, 0.04, s * (side - 0.14), beltY - 0.4, length / 2 + 0.012, 0.015);
      // Round headlamps with a metal ring.
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 20), this.lampMaterial);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(s * (side - 0.27), beltY - 0.2, length / 2 + 0.015);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 8, 22), metal);
      ring.position.set(s * (side - 0.27), beltY - 0.2, length / 2 + 0.04);
      this.group.add(lamp, ring);
    }
    // The long car has a second pair of doors.
    if (cfg.id === 'long') {
      for (const s of [1, -1]) {
        add(paint, 0.05, winH + 0.04, 0.14, s * (side - 0.015), winY, cabinFront - 1.75);
        add(dark, 0.012, roofY - floorY - 0.2, 0.015, s * (side + 0.001), (roofY + floorY) / 2, cabinFront - 1.95);
        add(metal, 0.03, 0.035, 0.13, s * (side + 0.012), beltY - 0.08, cabinFront - 1.85, 0.01);
      }
    }

    // Grille with slats, bumpers with a recovery point.
    add(dark, 0.82, 0.3, 0.03, 0, beltY - 0.2, length / 2 + 0.012);
    for (let i = 0; i < 5; i++) add(metal, 0.74, 0.018, 0.02, 0, beltY - 0.31 + i * 0.055, length / 2 + 0.03);
    add(dark, width + 0.06, 0.17, 0.17, 0, floorY + 0.1, length / 2 + 0.07, 0.04);
    add(dark, width + 0.06, 0.17, 0.15, 0, floorY + 0.1, -length / 2 - 0.06, 0.04);
    add(metal, 0.2, 0.12, 0.1, 0, floorY + 0.12, length / 2 + 0.17, 0.02); // winch housing

    // One soft headlight beam, switched on at night.
    this.headlight = new THREE.SpotLight(0xffe2ae, 0, 60, 0.5, 0.7, 1);
    this.headlight.position.set(0, beltY, length / 2);
    this.headlight.target.position.set(0, -0.9, length / 2 + 14);
    this.group.add(this.headlight, this.headlight.target);

    // Snorkel up the right-hand windshield pillar (right is -X).
    add(dark, 0.09, 0.09, 0.5, -(side + 0.01), beltY + 0.06, cabinFront + 0.3, 0.03);
    add(dark, 0.09, roofY - beltY + 0.1, 0.09, -(side + 0.01), (roofY + beltY) / 2 + 0.1, cabinFront + 0.05, 0.03);
    add(dark, 0.14, 0.14, 0.18, -(side + 0.01), roofY + 0.2, cabinFront + 0.07, 0.04);

    // Roof rack: a frame of thin bars with two pieces of luggage.
    const rackY = roofY + 0.2;
    const rackLen = cabinLen - 0.5;
    const rackW = width - 0.2;
    for (const s of [1, -1]) add(metal, 0.035, 0.035, rackLen, (s * rackW) / 2, rackY, cabinZ);
    for (let i = 0; i <= 3; i++) {
      const z = cabinZ - rackLen / 2 + (rackLen * i) / 3;
      add(metal, rackW, 0.035, 0.035, 0, rackY, z);
      for (const s of [1, -1]) add(metal, 0.035, 0.14, 0.035, (s * rackW) / 2, rackY - 0.08, z);
    }
    add(canvasBag, 0.7, 0.26, 0.5, 0.25, rackY + 0.15, cabinZ - 0.3, 0.07);
    add(crate, 0.5, 0.2, 0.8, -0.4, rackY + 0.12, cabinZ + 0.2, 0.02);

    this.wheelGeometry = this.buildWheelGeometry();

    // Spare wheel on the back door.
    const spare = this.makeWheel();
    spare.rotation.y = Math.PI / 2;
    spare.position.set(-0.1, beltY - 0.05, -length / 2 - 0.17);
    spare.scale.setScalar(0.95);
    this.group.add(spare);

    // The 4 road wheels: pivot (suspension + steering) -> spinner (rolling).
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      const spinner = this.makeWheel();
      pivot.add(spinner);
      this.group.add(pivot);
      this.wheelPivots.push(pivot);
      this.wheelSpinners.push(spinner);
    }
  }

  /** Shapes for a wheel whose axle lies along the X axis. */
  private buildWheelGeometry() {
    const { wheelRadius: r, wheelWidth: w } = this.cfg;
    const turn = (g: THREE.BufferGeometry) => g.rotateZ(Math.PI / 2); // lathe and cylinders stand upright by default
    // Tyre cross-section with rounded shoulders, spun around the axle.
    const profile = [
      [r * 0.6, -w / 2], [r - 0.08, -w / 2], [r - 0.02, -w / 2 + 0.05], [r - 0.02, w / 2 - 0.05], [r - 0.08, w / 2], [r * 0.6, w / 2],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const tyre = turn(new THREE.LatheGeometry(profile, 28));
    // Tread blocks.
    const blocks: THREE.BufferGeometry[] = [];
    const BLOCKS = 18;
    for (let i = 0; i < BLOCKS; i++) {
      const a = (i / BLOCKS) * Math.PI * 2;
      for (const s of [1, -1]) {
        const b = new THREE.BoxGeometry(w * 0.42, 0.045, 0.09);
        b.rotateY(s * 0.35);
        b.translate(s * w * 0.24, r - 0.01, 0);
        b.rotateX(a + (s > 0 ? 0 : Math.PI / BLOCKS));
        blocks.push(b);
      }
    }
    const tread = mergeGeometries(blocks)!;
    const rim = turn(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w * 0.9, 20));
    // Wheel nuts and a hub on both faces, so you can see the wheel turn.
    const nutParts: THREE.BufferGeometry[] = [];
    for (const s of [1, -1]) {
      nutParts.push(turn(new THREE.CylinderGeometry(r * 0.2, r * 0.24, 0.06, 12)).translate(s * (w * 0.45 + 0.02), 0, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        nutParts.push(turn(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 6)).translate(s * (w * 0.45 + 0.01), Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4));
      }
    }
    return { tyre, tread, rim, nuts: mergeGeometries(nutParts)! };
  }

  private makeWheel(): THREE.Group {
    const wheel = new THREE.Group();
    const g = this.wheelGeometry;
    const parts: [THREE.BufferGeometry, THREE.Material][] = [
      [g.tyre, this.tyreMaterial],
      [g.tread, this.tyreMaterial],
      [g.rim, this.rimMaterial],
      [g.nuts, this.darkMaterial],
    ];
    for (const [geo, material] of parts) {
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      wheel.add(mesh);
    }
    return wheel;
  }

  /** Gives the paint, glass and metal something to reflect. */
  setReflection(texture: THREE.Texture | null): void {
    for (const m of this.materials) {
      if (m.envMap !== texture) {
        m.envMap = texture;
        m.needsUpdate = true;
      }
    }
  }

  /** @param darkness 0 by day, 1 at night */
  setHeadlights(darkness: number): void {
    this.headlight.intensity = darkness * 110;
    this.lampMaterial.emissiveIntensity = 0.6 + darkness * 2.5;
  }

  /** Copy the wheel positions from the simulation. Call once per frame. */
  updateWheels(vehicle: Vehicle): void {
    for (let i = 0; i < 4; i++) {
      const mount = vehicle.wheelMounts[i];
      const state = vehicle.wheels[i];
      this.wheelPivots[i].position.set(mount.x, mount.y - state.suspensionLength, mount.z);
      this.wheelPivots[i].rotation.y = state.steering;
      this.wheelSpinners[i].rotation.x = state.rotation;
    }
  }
}
