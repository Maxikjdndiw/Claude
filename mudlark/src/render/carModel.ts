// Builds the car: a boxy, upright 4x4. The lower body is cut from a side
// profile with real wheel arches; the cabin is hollow, with see-through
// glass, seats and a steering wheel inside. Paint, glass and metal reflect
// the sky. Original design. No logos or badges.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VehicleConfig } from '../config';
import type { Vehicle } from '../sim/vehicle';

export interface CarColors {
  body: number;
  roof: number;
}

type Mat = THREE.MeshStandardMaterial;

export class CarModel {
  /** Follows the chassis rigid body. */
  readonly group = new THREE.Group();
  private wheelPivots: THREE.Group[] = []; // moves with suspension + steering
  private wheelSpinners: THREE.Group[] = []; // spins around the axle
  private axles: THREE.Group[] = []; // front and rear solid axle
  private lampMaterial: Mat;
  private headlight: THREE.SpotLight;
  private materials: Mat[] = [];
  private wheelParts: [THREE.BufferGeometry, THREE.Material][] = [];

  constructor(private cfg: VehicleConfig, colors: CarColors = { body: 0x6f8f72, roof: 0xf0e6d0 }) {
    const he = cfg.chassisHalfExtents;
    const keep = <T extends Mat>(m: T): T => {
      this.materials.push(m);
      return m;
    };
    const standard = (color: number, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
      keep(new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 0.5, ...extra }));

    // Car paint: colour coat under a glossy clear coat.
    const paint = keep(new THREE.MeshPhysicalMaterial({ color: colors.body, roughness: 0.5, metalness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.28, envMapIntensity: 0.4 }));
    const roofPaint = keep(
      new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colors.roof).multiplyScalar(0.8), roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.35, envMapIntensity: 0.35 }),
    );
    const dark = standard(0x1b1a19, 0.85);
    const rubber = standard(0x141312, 0.97);
    const metal = standard(0xa6a8a5, 0.32, 0.9);
    const steel = standard(0x55585a, 0.55, 0.7);
    const cabinTrim = standard(0x2a2622, 0.9);
    const seat = standard(0x6b5540, 0.85);
    const canvasBag = standard(0xb58a4f, 0.95);
    const crate = standard(0x4a6878, 0.8);
    // Windows you can see through, and darker glass for the back.
    const glass = keep(new THREE.MeshPhysicalMaterial({ color: 0x9fb4b8, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.3, envMapIntensity: 0.7, depthWrite: false }));
    const darkGlass = standard(0x0e1518, 0.05, 0.9, { envMapIntensity: 1.2 });
    this.lampMaterial = standard(0xfff6dc, 0.15, 0, { emissive: 0xffd98a, emissiveIntensity: 0.6 });
    const tail = standard(0xb5302a, 0.3, 0, { emissive: 0x801512, emissiveIntensity: 0.6 });
    const amber = standard(0xe08a2a, 0.3, 0, { emissive: 0x7a3d08, emissiveIntensity: 0.4 });

    const place = (mesh: THREE.Mesh, x: number, y: number, z: number, shadow = true) => {
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    /** Adds a box. `round` > 0 softens its edges. */
    const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, round = 0) =>
      place(new THREE.Mesh(round > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(round, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d), m), x, y, z);
    /** Adds a tube between two points. */
    const tube = (m: THREE.Material, radius: number, from: [number, number, number], to: [number, number, number]) => {
      const a = new THREE.Vector3(...from);
      const b = new THREE.Vector3(...to);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 8), m);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      return place(mesh, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    };

    const width = he.x * 2 + 0.1;
    const length = he.z * 2;
    const side = width / 2;
    const floorY = -he.y + 0.08; // underside of the body
    const beltY = 0.3; // top of the lower body (bottom of the windows)
    const roofY = 1.02;
    const cabinFront = length / 2 - 1.25; // where the windshield stands
    const cabinBack = -length / 2 + 0.02;
    const cabinLen = cabinFront - cabinBack;
    const cabinZ = (cabinFront + cabinBack) / 2;
    const cabinH = roofY - beltY;
    const axleZ = cfg.wheelBase / 2;
    const archR = cfg.wheelRadius + 0.11;
    const archY = cfg.suspensionMountY - 0.4; // wheel centre at normal ride height
    const archStart = Math.asin((floorY - archY) / archR);
    const archHalf = Math.cos(archStart) * archR;

    // --- lower body: side profile with wheel arches, pushed out to the full width ---
    const profile = new THREE.Shape();
    profile.moveTo(-length / 2, floorY + 0.06);
    profile.lineTo(-length / 2, beltY);
    profile.lineTo(cabinFront + 0.05, beltY);
    profile.lineTo(length / 2 - 0.08, beltY - 0.05); // bonnet falls slightly to the front
    profile.lineTo(length / 2, beltY - 0.13);
    profile.lineTo(length / 2, floorY + 0.12);
    profile.lineTo(axleZ + archHalf, floorY);
    profile.absarc(axleZ, archY, archR, archStart, Math.PI - archStart, false);
    profile.lineTo(-axleZ + archHalf, floorY);
    profile.absarc(-axleZ, archY, archR, archStart, Math.PI - archStart, false);
    profile.lineTo(-length / 2 + 0.04, floorY);
    profile.closePath();
    const bevel = 0.035;
    const bodyGeo = new THREE.ExtrudeGeometry(profile, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 18 });
    bodyGeo.translate(0, 0, -(width - bevel * 2) / 2);
    bodyGeo.rotateY(-Math.PI / 2); // profile x becomes the car's length
    place(new THREE.Mesh(bodyGeo, paint), 0, 0, 0);

    // Chassis rails and the dark underside between the arches.
    box(dark, width - 0.62, 0.34, length - 0.3, 0, floorY + 0.02, 0);
    for (const s of [1, -1]) box(steel, 0.09, 0.12, length - 0.2, s * 0.42, floorY - 0.14, 0, 0.02);
    box(steel, 0.4, 0.2, 0.55, 0.1, floorY - 0.12, 0.1, 0.06); // gearbox
    tube(steel, 0.04, [-0.35, floorY - 0.2, 0.2], [-0.35, floorY - 0.2, -length / 2 - 0.05]); // exhaust

    // --- bonnet details ---
    box(paint, width - 0.5, 0.035, 1.05, 0, beltY - 0.008, cabinFront + 0.68, 0.015); // raised centre panel
    for (const s of [1, -1]) {
      box(steel, 0.2, 0.012, 0.95, s * (side - 0.13), beltY - 0.012, cabinFront + 0.66); // tread plates on the wings
      tube(dark, 0.012, [s * 0.35, beltY + 0.03, cabinFront + 0.04], [s * 0.05, beltY + 0.04, cabinFront + 0.05]); // wipers
    }

    // --- cabin: roof, pillars and panels around a hollow inside ---
    box(roofPaint, width + 0.01, 0.1, cabinLen + 0.1, 0, roofY + 0.03, cabinZ, 0.045);
    box(paint, width - 0.06, 0.06, 0.07, 0, roofY - 0.05, cabinFront - 0.02); // windshield header
    box(paint, width - 0.06, 0.07, 0.07, 0, beltY + 0.035, cabinFront - 0.02); // scuttle
    const doorLen = 0.98;
    const pillar = (z: number) => {
      for (const s of [1, -1]) box(paint, 0.07, cabinH, 0.08, s * (side - 0.06), beltY + cabinH / 2, z, 0.015);
    };
    pillar(cabinFront - 0.03);
    pillar(cabinFront - doorLen);
    // Windshield: glass with a centre bar.
    box(glass, width - 0.2, cabinH - 0.12, 0.02, 0, beltY + cabinH / 2 + 0.005, cabinFront - 0.01).castShadow = false;
    box(dark, 0.025, cabinH - 0.12, 0.03, 0, beltY + cabinH / 2, cabinFront - 0.005);
    let panelFront = cabinFront - doorLen; // where the solid rear side panels begin
    for (const s of [1, -1]) {
      box(glass, 0.02, cabinH - 0.12, doorLen - 0.1, s * (side - 0.055), beltY + cabinH / 2 + 0.005, cabinFront - doorLen / 2 - 0.01).castShadow = false;
      box(paint, 0.05, 0.06, doorLen, s * (side - 0.06), roofY - 0.05, cabinFront - doorLen / 2); // door frame top
    }
    if (cfg.id === 'long') {
      // Second pair of doors with their own windows.
      pillar(panelFront - doorLen * 0.9);
      for (const s of [1, -1]) {
        box(glass, 0.02, cabinH - 0.12, doorLen * 0.9 - 0.1, s * (side - 0.055), beltY + cabinH / 2 + 0.005, panelFront - doorLen * 0.45).castShadow = false;
        box(paint, 0.05, 0.06, doorLen * 0.9, s * (side - 0.06), roofY - 0.05, panelFront - doorLen * 0.45);
      }
      panelFront -= doorLen * 0.9;
    }
    const panelLen = panelFront - cabinBack;
    for (const s of [1, -1]) {
      box(paint, 0.06, cabinH, panelLen, s * (side - 0.06), beltY + cabinH / 2, cabinBack + panelLen / 2, 0.015);
      box(darkGlass, 0.02, cabinH * 0.42, panelLen * 0.62, s * (side - 0.025), beltY + cabinH * 0.6, cabinBack + panelLen / 2, 0.01);
      box(rubber, 0.012, cabinH * 0.42 + 0.03, panelLen * 0.62 + 0.03, s * (side - 0.031), beltY + cabinH * 0.6, cabinBack + panelLen / 2);
    }
    box(paint, width - 0.06, cabinH, 0.06, 0, beltY + cabinH / 2, cabinBack + 0.03, 0.015); // back
    box(darkGlass, width - 0.75, cabinH * 0.4, 0.02, 0.05, beltY + cabinH * 0.62, cabinBack - 0.005, 0.01);

    // --- inside: floor, dashboard, steering wheel and seats ---
    box(cabinTrim, width - 0.2, 0.04, cabinLen - 0.1, 0, beltY + 0.0, cabinZ);
    box(cabinTrim, width - 0.2, 0.16, 0.22, 0, beltY + 0.1, cabinFront - 0.16, 0.04);
    const wheel = place(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 20), dark), 0.4, beltY + 0.24, cabinFront - 0.34, false);
    wheel.rotation.x = -0.45;
    tube(dark, 0.015, [0.4, beltY + 0.24, cabinFront - 0.34], [0.4, beltY + 0.14, cabinFront - 0.2]);
    const seats = cfg.id === 'long' ? [cabinFront - 0.7, cabinFront - 1.65] : [cabinFront - 0.7];
    for (const z of seats) {
      for (const s of [1, -1]) {
        box(seat, 0.46, 0.14, 0.46, s * 0.4, beltY + 0.06, z + 0.08, 0.05);
        box(seat, 0.46, 0.56, 0.12, s * 0.4, beltY + 0.34, z - 0.18, 0.05);
        box(seat, 0.24, 0.16, 0.1, s * 0.4, beltY + 0.7, z - 0.19, 0.04);
      }
    }
    box(cabinTrim, width - 0.2, cabinH - 0.04, 0.05, 0, beltY + cabinH / 2, panelFront - 0.25); // bulkhead behind the seats

    // --- along both sides ---
    for (const s of [1, -1]) {
      const x = s * (side + 0.001);
      // Door gaps, handles and hinges.
      box(dark, 0.012, beltY - floorY - 0.1, 0.014, x, (beltY + floorY) / 2 + 0.04, cabinFront - 0.03);
      box(dark, 0.012, beltY - floorY - 0.1, 0.014, x, (beltY + floorY) / 2 + 0.04, cabinFront - doorLen);
      box(dark, 0.012, 0.014, doorLen, x, floorY + 0.14, cabinFront - doorLen / 2);
      box(metal, 0.03, 0.035, 0.13, s * (side + 0.012), beltY - 0.09, cabinFront - doorLen + 0.14, 0.01);
      for (const hy of [beltY - 0.06, floorY + 0.24]) box(steel, 0.025, 0.05, 0.07, s * (side + 0.01), hy, cabinFront - 0.03, 0.008);
      if (cfg.id === 'long') {
        box(dark, 0.012, beltY - floorY - 0.1, 0.014, x, (beltY + floorY) / 2 + 0.04, panelFront);
        box(metal, 0.03, 0.035, 0.13, s * (side + 0.012), beltY - 0.09, panelFront + 0.14, 0.01);
      }
      // Wheel-arch flares that follow the round cut-out.
      for (const z of [axleZ, -axleZ]) {
        const flare = new THREE.Mesh(new THREE.TorusGeometry(archR + 0.015, 0.045, 6, 18, Math.PI - archStart * 2), dark);
        flare.rotation.set(0, -Math.PI / 2, 0);
        flare.rotateZ(archStart);
        place(flare, s * (side + 0.005), archY, z);
        // Mud flap behind each wheel.
        box(rubber, 0.3, 0.28, 0.02, s * (side - 0.17), floorY - 0.14, z - archHalf - 0.02);
      }
      // Side step.
      box(steel, 0.16, 0.03, axleZ * 2 - archHalf * 2 - 0.1, s * (side + 0.05), floorY - 0.06, 0, 0.012);
      // Mirrors on arms.
      tube(dark, 0.012, [s * side, beltY + 0.22, cabinFront - 0.03], [s * (side + 0.14), beltY + 0.26, cabinFront + 0.0]);
      box(dark, 0.05, 0.2, 0.13, s * (side + 0.16), beltY + 0.27, cabinFront - 0.01, 0.02);
      // Lamps at the back, indicators at the front.
      box(tail, 0.1, 0.2, 0.04, s * (side - 0.12), beltY - 0.25, -length / 2 - 0.01, 0.015);
      box(amber, 0.1, 0.09, 0.04, s * (side - 0.12), beltY - 0.06, -length / 2 - 0.01, 0.015);
      box(amber, 0.1, 0.09, 0.04, s * (side - 0.14), beltY - 0.43, length / 2 + 0.01, 0.015);
      // Round headlamps: glass lens in a metal ring.
      const lamp = place(new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.lampMaterial), s * (side - 0.27), beltY - 0.25, length / 2 - 0.035, false);
      lamp.rotation.x = Math.PI / 2;
      lamp.scale.y = 0.45;
      place(new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.016, 8, 22), metal), s * (side - 0.27), beltY - 0.25, length / 2 + 0.008, false);
    }

    // --- front and back ---
    box(dark, 0.84, 0.3, 0.03, 0, beltY - 0.25, length / 2 + 0.005);
    for (let i = 0; i < 6; i++) box(metal, 0.76, 0.014, 0.02, 0, beltY - 0.37 + i * 0.047, length / 2 + 0.022);
    box(dark, width + 0.06, 0.16, 0.16, 0, floorY + 0.08, length / 2 + 0.08, 0.035);
    box(dark, width + 0.06, 0.16, 0.14, 0, floorY + 0.08, -length / 2 - 0.07, 0.035);
    box(steel, 0.26, 0.14, 0.14, 0, floorY + 0.1, length / 2 + 0.17, 0.03); // winch
    tube(metal, 0.045, [-0.1, floorY + 0.1, length / 2 + 0.2], [0.1, floorY + 0.1, length / 2 + 0.2]); // winch drum
    for (const s of [1, -1]) tube(steel, 0.02, [s * 0.5, floorY + 0.02, length / 2 + 0.1], [s * 0.5, floorY - 0.1, length / 2 + 0.16]); // tow hooks
    box(dark, 0.012, cabinH + beltY - floorY - 0.2, 0.014, -0.42, (roofY + floorY) / 2, -length / 2 - 0.001); // back door gap
    box(metal, 0.12, 0.035, 0.03, -0.3, beltY - 0.05, -length / 2 - 0.012, 0.01);

    // One soft headlight beam, switched on at night.
    this.headlight = new THREE.SpotLight(0xffe2ae, 0, 60, 0.5, 0.7, 1);
    this.headlight.position.set(0, beltY, length / 2);
    this.headlight.target.position.set(0, -0.9, length / 2 + 14);
    this.group.add(this.headlight, this.headlight.target);

    // Snorkel up the right-hand windshield pillar (right is -X), aerial on the left wing.
    const sx = -(side + 0.03);
    tube(dark, 0.045, [sx, beltY - 0.06, cabinFront + 0.55], [sx, beltY + 0.02, cabinFront + 0.06]);
    tube(dark, 0.045, [sx, beltY + 0.02, cabinFront + 0.06], [sx, roofY + 0.14, cabinFront + 0.01]);
    box(dark, 0.14, 0.15, 0.2, sx, roofY + 0.2, cabinFront + 0.04, 0.05);
    tube(steel, 0.006, [side - 0.1, beltY, cabinFront + 0.15], [side - 0.06, beltY + 1.0, cabinFront + 0.05]);

    // Roof rack: tube frame with luggage and a rolled tarp.
    const rackY = roofY + 0.2;
    const rackLen = cabinLen - 0.5;
    const rackW = width - 0.2;
    const z0 = cabinZ - rackLen / 2;
    const z1 = cabinZ + rackLen / 2;
    for (const s of [1, -1]) {
      tube(metal, 0.018, [(s * rackW) / 2, rackY, z0], [(s * rackW) / 2, rackY, z1]);
      tube(metal, 0.014, [(s * rackW) / 2, rackY + 0.1, z0], [(s * rackW) / 2, rackY + 0.1, z1]);
    }
    for (let i = 0; i <= 4; i++) {
      const z = z0 + (rackLen * i) / 4;
      tube(metal, 0.016, [-rackW / 2, rackY, z], [rackW / 2, rackY, z]);
      for (const s of [1, -1]) tube(metal, 0.014, [(s * rackW) / 2, rackY - 0.14, z], [(s * rackW) / 2, rackY + 0.1, z]);
    }
    box(canvasBag, 0.7, 0.26, 0.5, 0.25, rackY + 0.15, cabinZ - 0.3, 0.08);
    box(crate, 0.5, 0.2, 0.8, -0.4, rackY + 0.12, cabinZ + 0.2, 0.02);
    tube(canvasBag, 0.1, [-0.2, rackY + 0.12, z1 - 0.2], [0.6, rackY + 0.12, z1 - 0.2]);

    this.mergeStaticParts();

    this.wheelParts = this.buildWheel(rubber, standard(0xd8d2c2, 0.45, 0.5), dark);

    // Spare wheel on the back door.
    const spare = this.makeWheel();
    spare.rotation.y = Math.PI / 2;
    spare.position.set(0.12, beltY - 0.02, -length / 2 - 0.17);
    spare.scale.setScalar(0.95);
    this.group.add(spare);

    // Solid axles with a differential, front and rear. They follow the wheels.
    for (let a = 0; a < 2; a++) {
      const axle = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, cfg.trackWidth, 8), steel);
      beam.rotation.z = Math.PI / 2;
      const diff = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), steel);
      diff.position.x = 0.18;
      axle.add(beam, diff);
      this.group.add(axle);
      this.axles.push(axle);
    }

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

  /**
   * The body is built from well over a hundred small parts. Drawing each one
   * separately would be slow, so all parts with the same material are joined
   * into a single mesh.
   */
  private mergeStaticParts(): void {
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const noShadow = new Set<THREE.Material>();
    for (const child of [...this.group.children]) {
      if (!(child instanceof THREE.Mesh)) continue;
      child.updateMatrix();
      const geo = (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()) as THREE.BufferGeometry;
      geo.applyMatrix4(child.matrix);
      for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
      const material = child.material as THREE.Material;
      if (!child.castShadow) noShadow.add(material);
      if (!byMaterial.has(material)) byMaterial.set(material, []);
      byMaterial.get(material)!.push(geo);
      this.group.remove(child);
    }
    for (const [material, parts] of byMaterial) {
      const mesh = new THREE.Mesh(mergeGeometries(parts)!, material);
      mesh.castShadow = !material.transparent && !noShadow.has(material);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  /** Shapes for a wheel whose axle lies along the X axis. */
  private buildWheel(rubber: Mat, rimMaterial: Mat, dark: Mat): [THREE.BufferGeometry, THREE.Material][] {
    const { wheelRadius: r, wheelWidth: w } = this.cfg;
    const turn = (g: THREE.BufferGeometry) => g.rotateZ(Math.PI / 2); // lathe and cylinders stand upright by default
    const lathe = (points: number[][], segments: number) => turn(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments));
    // Tyre cross-section: bulging side walls and rounded shoulders.
    const tyre = lathe(
      [
        [r * 0.6, -w * 0.42], [r * 0.78, -w * 0.52], [r - 0.07, -w * 0.5], [r - 0.02, -w * 0.4],
        [r - 0.02, w * 0.4], [r - 0.07, w * 0.5], [r * 0.78, w * 0.52], [r * 0.6, w * 0.42],
      ],
      32,
    );
    // Tread blocks in a V pattern.
    const blocks: THREE.BufferGeometry[] = [];
    const BLOCKS = 22;
    for (let i = 0; i < BLOCKS; i++) {
      const a = (i / BLOCKS) * Math.PI * 2;
      for (const s of [1, -1]) {
        const b = new THREE.BoxGeometry(w * 0.44, 0.05, 0.075);
        b.rotateY(s * 0.4);
        b.translate(s * w * 0.23, r - 0.012, 0);
        b.rotateX(a + (s > 0 ? 0 : Math.PI / BLOCKS));
        blocks.push(b);
      }
    }
    // Steel rim: a dished disc on both faces.
    const rim = lathe(
      [
        [0.001, -w * 0.3], [r * 0.25, -w * 0.3], [r * 0.5, -w * 0.4], [r * 0.6, -w * 0.44], [r * 0.62, -w * 0.4],
        [r * 0.62, w * 0.4], [r * 0.6, w * 0.44], [r * 0.5, w * 0.4], [r * 0.25, w * 0.3], [0.001, w * 0.3],
      ],
      24,
    );
    // Hub, wheel nuts and round holes in the rim, so you can see the wheel turn.
    const hubParts: THREE.BufferGeometry[] = [];
    const holeParts: THREE.BufferGeometry[] = [];
    for (const s of [1, -1]) {
      hubParts.push(turn(new THREE.CylinderGeometry(r * 0.14, r * 0.17, 0.07, 12)).translate(s * (w * 0.3 + 0.03), 0, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        hubParts.push(turn(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 6)).translate(s * (w * 0.3 + 0.015), Math.cos(a) * r * 0.24, Math.sin(a) * r * 0.24));
        const b = a + Math.PI / 5;
        holeParts.push(turn(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 10)).translate(s * (w * 0.37), Math.cos(b) * r * 0.42, Math.sin(b) * r * 0.42));
      }
    }
    return [
      [tyre, rubber],
      [mergeGeometries(blocks)!, rubber],
      [rim, rimMaterial],
      [mergeGeometries(hubParts)!, rimMaterial],
      [mergeGeometries(holeParts)!, dark],
    ];
  }

  private makeWheel(): THREE.Group {
    const wheel = new THREE.Group();
    for (const [geo, material] of this.wheelParts) {
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
    this.lampMaterial.emissiveIntensity = 0.6 + darkness * 3;
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
    // Each axle joins its two wheels and tilts with them.
    for (let a = 0; a < 2; a++) {
      const left = this.wheelPivots[a * 2].position;
      const right = this.wheelPivots[a * 2 + 1].position;
      this.axles[a].position.set(0, (left.y + right.y) / 2, left.z);
      this.axles[a].rotation.z = Math.atan2(left.y - right.y, left.x - right.x);
    }
  }
}
