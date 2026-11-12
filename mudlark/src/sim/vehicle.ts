// The car simulation: a Rapier "raycast vehicle".
// The chassis is one rigid box. Each wheel is a ray cast downwards with a
// spring on it; the physics engine computes suspension, grip and drive forces.
// No rendering code in here.
import RAPIER from '@dimforge/rapier3d-compat';
import { DAMAGE, SURFACES, WATER, type SurfaceId, type VehicleConfig } from '../config';
import type { VehicleSnapshot } from '../net/types';
import type { DriveInput } from './input';
import type { PhysicsWorld, Vec3 } from './physicsWorld';

/** Wheel order used everywhere: front-left, front-right, rear-left, rear-right. */
export const WHEEL_NAMES = ['FL', 'FR', 'RL', 'RR'] as const;

export interface WheelState {
  inContact: boolean;
  /** True while the engine pushes harder than the tyre can grip (wheelspin). */
  slipping: boolean;
  surface: SurfaceId | null;
  /** Depth of the water where the wheel touches the ground (0 = dry). */
  waterDepth: number;
  /** Current spring length (rest length when hanging in the air). */
  suspensionLength: number;
  steering: number;
  /** Spin angle around the axle, radians. */
  rotation: number;
}

export type Gear = 'D' | 'R' | 'N';

/** What the car needs to know about the world it drives on. */
export interface VehicleEnvironment {
  /**
   * Surface under a wheel. `slope` comes from the contact normal;
   * `isTerrain` is false when the wheel stands on a rock, log or building.
   */
  surfaceAt(x: number, y: number, z: number, slope: number, isTerrain: boolean): SurfaceId;
}

export class Vehicle {
  readonly body: RAPIER.RigidBody;
  readonly wheels: WheelState[];
  /** Wheel mounting points in car space (the car drives towards +Z). */
  readonly wheelMounts: Vec3[];
  /** Signed speed along the car's nose, m/s. Negative = rolling backwards. */
  forwardSpeed = 0;
  gear: Gear = 'N';
  lowRange = false;
  /** 1 = like new, 0 = badly worn. Hard knocks lower it, camps repair it. */
  condition = 1;
  /** Strength of the knock in the last step (m/s), for sound. 0 = none. */
  lastImpact = 0;
  /** Deepest water under any wheel, metres. */
  waterDepth = 0;
  /** Highest surface drag under any wheel (mud), for sound and effects. */
  mudDrag = 0;
  /** Number of wheels that are spinning without grip. */
  slippingWheels = 0;
  /** Winch mounting point on the front bumper, in car space. */
  readonly hookLocal: Vec3;

  private controller: RAPIER.DynamicRayCastVehicleController;
  private collider: RAPIER.Collider;
  private steering = 0;
  private pedal = 0; // smoothed throttle, -1..1
  private lastVelocity: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(
    private physics: PhysicsWorld,
    readonly cfg: VehicleConfig,
    spawn: Vec3,
    private env: VehicleEnvironment,
  ) {
    const he = cfg.chassisHalfExtents;
    this.hookLocal = { x: 0, y: -0.2, z: he.z + 0.15 };
    // Sleeping is switched off: the wheel forces are applied by the vehicle
    // controller, which a sleeping body would not notice.
    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(spawn.x, spawn.y, spawn.z).setCanSleep(false),
    );
    this.collider = physics.world.createCollider(RAPIER.ColliderDesc.cuboid(he.x, he.y, he.z).setFriction(0.4), this.body);

    this.controller = physics.world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;

    const x = cfg.trackWidth / 2;
    const z = cfg.wheelBase / 2;
    const y = cfg.suspensionMountY;
    this.wheelMounts = [
      { x: x, y, z: z }, // front-left (the car's left is +X when it looks along +Z)
      { x: -x, y, z: z }, // front-right
      { x: x, y, z: -z }, // rear-left
      { x: -x, y, z: -z }, // rear-right
    ];
    this.wheels = [];
    this.wheelMounts.forEach((mount, i) => {
      this.controller.addWheel(mount, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, cfg.suspensionRestLength, cfg.wheelRadius);
      this.wheels.push({ inContact: false, slipping: false, surface: null, waterDepth: 0, suspensionLength: cfg.suspensionRestLength, steering: 0, rotation: 0 });
    });
    this.applyConfig();
  }

  /**
   * Copies the tuning values from `cfg` into the physics engine.
   * Call again whenever a value in `cfg` was changed (the tuning panel does this).
   */
  applyConfig(): void {
    const cfg = this.cfg;
    const he = cfg.chassisHalfExtents;
    // Mass and inertia of a solid box, but with the centre of mass moved down
    // (engine, gearbox and axles are low in a real car).
    const m = cfg.mass / 3;
    const inertia = {
      x: m * (he.y * he.y + he.z * he.z),
      y: m * (he.x * he.x + he.z * he.z),
      z: m * (he.x * he.x + he.y * he.y),
    };
    this.collider.setMassProperties(cfg.mass, { x: 0, y: cfg.centerOfMassY, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 });
    for (let i = 0; i < 4; i++) {
      this.controller.setWheelSuspensionStiffness(i, cfg.springStiffness);
      this.controller.setWheelSuspensionCompression(i, cfg.dampingCompression);
      this.controller.setWheelSuspensionRelaxation(i, cfg.dampingRelaxation);
      this.controller.setWheelMaxSuspensionTravel(i, cfg.suspensionTravel);
      this.controller.setWheelMaxSuspensionForce(i, cfg.maxSuspensionForce);
      this.controller.setWheelSideFrictionStiffness(i, cfg.sideGrip);
    }
  }

  /** Advance the car by one fixed step. Call right before the physics world steps. */
  step(input: DriveInput, dt: number): void {
    const cfg = this.cfg;
    const c = this.controller;
    this.lowRange = input.lowRange;

    // Speed along the car's nose.
    const v = this.body.linvel();
    const f = this.forwardDirection();
    this.forwardSpeed = v.x * f.x + v.y * f.y + v.z * f.z;
    const speed = this.forwardSpeed;

    // --- knocks: a sudden change of velocity wears the car a little ----------
    const dvx = v.x - this.lastVelocity.x;
    const dvy = v.y - this.lastVelocity.y;
    const dvz = v.z - this.lastVelocity.z;
    const knock = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
    this.lastImpact = knock > DAMAGE.minImpact ? knock : 0;
    if (this.lastImpact > 0) this.condition = Math.max(0, this.condition - (knock - DAMAGE.minImpact) * DAMAGE.perImpact);
    this.lastVelocity = { x: v.x, y: v.y, z: v.z };
    const enginePower = DAMAGE.minEnginePower + (1 - DAMAGE.minEnginePower) * this.condition;

    // --- water: drag grows with depth, deep water makes the car float --------
    const floating = this.waterDepth > WATER.deepWater;
    this.body.setLinearDamping(this.waterDepth * WATER.dragPerMetre);
    this.body.setAngularDamping(this.waterDepth * WATER.dragPerMetre);

    // --- engine and brakes -------------------------------------------------
    const maxForward = input.lowRange ? cfg.lowRangeMaxSpeed : cfg.maxSpeed;
    const maxReverse = input.lowRange ? Math.min(cfg.lowRangeMaxSpeed, cfg.reverseMaxSpeed) : cfg.reverseMaxSpeed;
    const forceScale = (input.lowRange ? cfg.lowRangeForceMultiplier : 1) * enginePower;
    let engine = 0; // total drive force, + = forward
    let brake = 0; // per wheel

    // The engine does not jump to full power: the pedal eases towards the input.
    const pedalStep = cfg.throttleResponse * dt;
    this.pedal += Math.max(-pedalStep, Math.min(pedalStep, input.throttle - this.pedal));
    if (input.throttle === 0) this.pedal = 0; // lifting off is immediate

    if (input.throttle > 0) {
      if (speed < -0.5) {
        brake = cfg.brakeForce * input.throttle; // rolling backwards: brake first
      } else {
        // Full force at standstill, fading to zero at top speed.
        const fade = Math.max(0, 1 - speed / maxForward);
        engine = cfg.engineForce * forceScale * Math.max(0, this.pedal) * Math.min(1, fade * 2);
        this.gear = 'D';
      }
    } else if (input.throttle < 0) {
      if (speed > 0.5) {
        brake = cfg.brakeForce * -input.throttle; // rolling forwards: brake first
      } else {
        const fade = Math.max(0, 1 + speed / maxReverse);
        engine = cfg.engineForce * forceScale * Math.min(0, this.pedal) * Math.min(1, fade * 2);
        this.gear = 'R';
      }
    } else {
      brake = input.lowRange ? cfg.lowRangeEngineBrake : cfg.engineBrake;
      if (Math.abs(speed) < 0.3) this.gear = 'N';
    }

    // --- steering: slower and smaller at speed, eased towards the target ---
    const speedFraction = Math.min(1, Math.abs(speed) / cfg.maxSpeed);
    const maxAngle = cfg.maxSteerAngle * (1 - speedFraction * (1 - cfg.steerAtTopSpeed));
    const target = -input.steer * maxAngle; // positive angle turns left
    const maxChange = cfg.steerSpeed * dt;
    this.steering += Math.max(-maxChange, Math.min(maxChange, target - this.steering));

    // --- apply to the 4 wheels ----------------------------------------------
    for (let i = 0; i < 4; i++) {
      const isFront = i < 2;
      const wheel = this.wheels[i];
      // Grip depends on what the wheel stood on in the previous step.
      const surface = wheel.surface ? SURFACES[wheel.surface] : SURFACES.dirt;
      const surfaceGrip = surface.grip * (floating ? WATER.deepWaterGrip : 1);
      const grip = cfg.tyreGrip * surfaceGrip;
      c.setWheelFrictionSlip(i, grip);
      // Traction limit: a tyre cannot push harder than grip x the weight on it.
      // A wheel in the air or on mud therefore delivers little or no drive.
      const maxDrive = grip * (wheel.inContact ? (c.wheelSuspensionForce(i) ?? 0) : 0);
      const wanted = engine / 4; // 4-wheel drive: equal share for every wheel
      wheel.slipping = Math.abs(wanted) > maxDrive + 1;
      // What reaches the ground: the gripped part of the engine force, minus
      // the drag of the surface (mud). The physics engine ignores brakes on a
      // driven wheel, so the drag is subtracted here.
      const dragForce = wheel.inContact ? surface.drag / dt : 0;
      const gripped = Math.min(Math.abs(wanted), maxDrive);
      const net = gripped - dragForce;
      const driving = net > 0;
      c.setWheelEngineForce(i, driving ? Math.sign(wanted) * net : 0);
      c.setWheelSteering(i, isFront ? this.steering : 0);
      // Brakes cannot do more than the surface allows; mud adds its own drag.
      const braking = (brake + (!isFront && input.handbrake ? cfg.handbrakeForce : 0)) * Math.min(1, surfaceGrip * 1.15);
      c.setWheelBrake(i, driving ? 0 : braking + (wheel.inContact ? surface.drag : 0));
    }

    c.updateVehicle(dt);

    // --- read back the wheel state for rendering and the debug overlay ------
    for (let i = 0; i < 4; i++) {
      const wheel = this.wheels[i];
      wheel.inContact = c.wheelIsInContact(i);
      wheel.surface = null;
      wheel.waterDepth = 0;
      if (wheel.inContact) {
        const p = c.wheelContactPoint(i);
        const n = c.wheelContactNormal(i);
        if (p && n) {
          const slope = n.y > 0.05 ? Math.sqrt(Math.max(0, 1 - n.y * n.y)) / n.y : 20;
          wheel.surface = this.env.surfaceAt(p.x, p.y, p.z, slope, this.physics.isTerrain(c.wheelGroundObject(i)));
          wheel.waterDepth = p.y < 0 ? -p.y : 0;
        }
      }
      wheel.suspensionLength = c.wheelSuspensionLength(i) ?? cfg.suspensionRestLength;
      wheel.steering = c.wheelSteering(i) ?? 0;
      wheel.rotation = c.wheelRotation(i) ?? 0;
    }

    // Summary values for sound, effects and the HUD.
    this.waterDepth = 0;
    this.mudDrag = 0;
    this.slippingWheels = 0;
    let contacts = 0;
    for (const wheel of this.wheels) {
      if (wheel.inContact) contacts++;
      if (wheel.slipping) this.slippingWheels++;
      if (wheel.waterDepth > this.waterDepth) this.waterDepth = wheel.waterDepth;
      if (wheel.surface && SURFACES[wheel.surface].drag > this.mudDrag) this.mudDrag = SURFACES[wheel.surface].drag;
    }
    // No wheel on the ground (rolled over or afloat): measure from the body.
    if (contacts === 0) this.waterDepth = Math.max(0, 0.4 - this.body.translation().y);
  }

  /** How upright the car is: 1 = on its wheels, 0 = on its side, -1 = on its roof. */
  uprightness(): number {
    const q = this.body.rotation();
    return 1 - 2 * (q.x * q.x + q.z * q.z);
  }

  /** Removes the car from the physics world. */
  dispose(): void {
    this.physics.world.removeVehicleController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }

  /** Unit vector pointing out of the car's nose, in world space. */
  forwardDirection(): Vec3 {
    const q = this.body.rotation();
    // Rotate (0, 0, 1) by the quaternion q.
    return {
      x: 2 * (q.x * q.z + q.w * q.y),
      y: 2 * (q.y * q.z - q.w * q.x),
      z: 1 - 2 * (q.x * q.x + q.y * q.y),
    };
  }

  /** Put the car on its wheels at a position, keeping the direction it looked in. */
  placeAt(position: Vec3, yaw?: number): void {
    const f = this.forwardDirection();
    const angle = yaw ?? Math.atan2(f.x, f.z);
    this.body.setTranslation(position, true);
    this.body.setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.lastVelocity = { x: 0, y: 0, z: 0 };
  }

  /** Everything another player needs to draw this car (used in the multiplayer phase). */
  snapshot(): VehicleSnapshot {
    const p = this.body.translation();
    const q = this.body.rotation();
    const v = this.body.linvel();
    const w = this.body.angvel();
    return {
      position: [p.x, p.y, p.z],
      rotation: [q.x, q.y, q.z, q.w],
      linearVelocity: [v.x, v.y, v.z],
      angularVelocity: [w.x, w.y, w.z],
      steering: this.steering,
    };
  }
}
