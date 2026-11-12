// Builds the low-poly car out of flat-shaded boxes and cylinders.
// Original design: a short, boxy, upright 4x4. No logos or badges.
import * as THREE from 'three';
import type { VehicleConfig } from '../config';
import type { Vehicle } from '../sim/vehicle';

const flat = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

export interface CarColors {
  body: number;
  roof: number;
}

export class CarModel {
  /** Follows the chassis rigid body. */
  readonly group = new THREE.Group();
  private wheelPivots: THREE.Group[] = []; // moves with suspension + steering
  private wheelSpinners: THREE.Group[] = []; // spins around the axle

  constructor(private cfg: VehicleConfig, colors: CarColors = { body: 0x6f8f72, roof: 0xf0e6d0 }) {
    const he = cfg.chassisHalfExtents;
    const paint = flat(colors.body);
    const roofPaint = flat(colors.roof);
    const dark = flat(0x2b2a28);
    const glass = flat(0x27343a);
    const metal = flat(0x8d8f8c);

    const add = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
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

    // Lower body, bonnet, cabin, roof.
    add(paint, width, beltY - floorY, length, 0, (beltY + floorY) / 2, 0);
    add(paint, width - 0.22, 0.14, 1.2, 0, beltY + 0.07, cabinFront + 0.62);
    add(paint, width - 0.06, roofY - beltY, cabinLen, 0, (roofY + beltY) / 2, cabinZ);
    add(roofPaint, width, 0.07, cabinLen + 0.06, 0, roofY + 0.035, cabinZ);

    // Windows: thin dark boxes that stick out a tiny bit from the cabin.
    const winH = roofY - beltY - 0.2;
    const winY = (roofY + beltY) / 2 + 0.02;
    add(glass, width - 0.26, winH, 0.04, 0, winY, cabinFront + 0.005); // upright windshield
    add(glass, width - 0.5, winH - 0.1, 0.04, 0, winY, cabinBack - 0.005);
    for (const side of [1, -1]) {
      add(glass, 0.04, winH, 0.8, side * (width / 2 - 0.02), winY, cabinFront - 0.55);
      add(glass, 0.04, winH - 0.06, cabinLen - 1.35, side * (width / 2 - 0.02), winY, cabinBack + (cabinLen - 1.35) / 2 + 0.15);
    }

    // Bumpers, grille, lights.
    add(dark, width + 0.04, 0.16, 0.16, 0, floorY + 0.1, length / 2 + 0.06);
    add(dark, width + 0.04, 0.16, 0.14, 0, floorY + 0.1, -length / 2 - 0.05);
    add(dark, 0.8, 0.26, 0.04, 0, beltY - 0.2, length / 2 + 0.01);
    const lamp = flat(0xfff2c4, { emissive: 0xffd98a, emissiveIntensity: 0.6 });
    const tail = flat(0xb5302a, { emissive: 0x801512, emissiveIntensity: 0.5 });
    for (const side of [1, -1]) {
      add(lamp, 0.22, 0.22, 0.05, side * (width / 2 - 0.25), beltY - 0.2, length / 2 + 0.01);
      add(tail, 0.12, 0.2, 0.04, side * (width / 2 - 0.12), beltY - 0.25, -length / 2 - 0.01);
      // Flat wheel-arch flares.
      for (const end of [1, -1]) {
        add(dark, 0.1, 0.07, cfg.wheelRadius * 2 + 0.3, side * (width / 2 + 0.03), floorY + 0.36, (end * cfg.wheelBase) / 2);
      }
      // Mirrors.
      add(dark, 0.16, 0.12, 0.06, side * (width / 2 + 0.1), beltY + 0.2, cabinFront - 0.05);
    }

    // Snorkel up the right-hand windshield pillar (right is -X).
    add(dark, 0.09, 0.09, 0.5, -(width / 2 + 0.01), beltY + 0.06, cabinFront + 0.3);
    add(dark, 0.09, roofY - beltY + 0.1, 0.09, -(width / 2 + 0.01), (roofY + beltY) / 2 + 0.1, cabinFront + 0.05);
    add(dark, 0.14, 0.14, 0.18, -(width / 2 + 0.01), roofY + 0.2, cabinFront + 0.07);

    // Roof rack: a frame of thin bars with two pieces of luggage.
    const rackY = roofY + 0.2;
    const rackLen = cabinLen - 0.5;
    const rackW = width - 0.2;
    for (const side of [1, -1]) add(metal, 0.04, 0.04, rackLen, (side * rackW) / 2, rackY, cabinZ);
    for (let i = 0; i <= 3; i++) {
      const z = cabinZ - rackLen / 2 + (rackLen * i) / 3;
      add(metal, rackW, 0.04, 0.04, 0, rackY, z);
      for (const side of [1, -1]) add(metal, 0.04, 0.14, 0.04, (side * rackW) / 2, rackY - 0.08, z);
    }
    add(flat(0xc98b4b), 0.7, 0.26, 0.5, 0.25, rackY + 0.15, cabinZ - 0.3);
    add(flat(0x4f6d7a), 0.5, 0.2, 0.8, -0.4, rackY + 0.12, cabinZ + 0.2);

    // Spare wheel on the back door.
    const spare = this.makeWheel();
    spare.rotation.y = Math.PI / 2;
    spare.position.set(-0.1, beltY - 0.05, -length / 2 - 0.16);
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

  /** A wheel whose axle lies along the X axis. */
  private makeWheel(): THREE.Group {
    const { wheelRadius: r, wheelWidth: w } = this.cfg;
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12), flat(0x26231f));
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 6), flat(0xd9d2c0));
    for (const part of [tyre, rim]) {
      part.rotation.z = Math.PI / 2; // cylinders stand upright by default
      part.castShadow = true;
      wheel.add(part);
    }
    return wheel;
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
