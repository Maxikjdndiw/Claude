// The car simulation: a Rapier "raycast vehicle".
// The chassis is one rigid box. Each wheel is a ray cast downwards with a
// spring on it; the physics engine computes suspension, grip and drive forces.
// No rendering code in here.
import RAPIER from '@dimforge/rapier3d-compat';
import { SURFACES, type SurfaceId, type VehicleConfig } from '../config';
import type { VehicleSnapshot } from '../net/types';
import type { DriveInput } from './input';
import type { PhysicsWorld, Vec3 } from './physicsWorld';

/** Wheel order used everywhere: front-left, front-right, rear-left, rear-right. */
export const WHEEL_NAMES = ['FL', 'FR', 'RL', 'RR'] as const;

export interface WheelState {
  inContact: boolean;
  surface: SurfaceId | null;
  /** Current spring length (rest length when hanging in the air). */
  suspensionLength: number;
  steering: number;
  /** Spin angle around the axle, radians. */
  rotation: number;
}

export type Gear = 'D' | 'R' | 'N';

export class Vehicle {
  readonly body: RAPIER.RigidBody;
  readonly wheels: WheelState[];
  /** Wheel mounting points in car space (the car drives towards +Z). */
  readonly wheelMounts: Vec3[];
  /** Signed speed along the car's nose, m/s. Negative = rolling backwards. */
  forwardSpeed = 0;
  gear: Gear = 'N';
  lowRange = false;

  private controller: RAPIER.DynamicRayCastVehicleController;
  private steering = 0;

  constructor(
    private physics: PhysicsWorld,
    readonly cfg: VehicleConfig,
    spawn: Vec3,
  ) {
    const he = cfg.chassisHalfExtents;
    // Sleeping is switched off: the wheel forces are applied by the vehicle
    // controller, which a sleeping body would not notice.
    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(spawn.x, spawn.y, spawn.z).setCanSleep(false),
    );
    // Mass and inertia of a solid box, but with the centre of mass moved down
    // (engine, gearbox and axles are low in a real car).
    const m = cfg.mass / 3;
    const inertia = {
      x: m * (he.y * he.y + he.z * he.z),
      y: m * (he.x * he.x + he.z * he.z),
      z: m * (he.x * he.x + he.y * he.y),
    };
    const collider = RAPIER.ColliderDesc.cuboid(he.x, he.y, he.z)
      .setMassProperties(cfg.mass, { x: 0, y: cfg.centerOfMassY, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(0.4);
    physics.world.createCollider(collider, this.body);

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
      this.controller.setWheelSuspensionStiffness(i, cfg.springStiffness);
      this.controller.setWheelSuspensionCompression(i, cfg.dampingCompression);
      this.controller.setWheelSuspensionRelaxation(i, cfg.dampingRelaxation);
      this.controller.setWheelMaxSuspensionTravel(i, cfg.suspensionTravel);
      this.controller.setWheelMaxSuspensionForce(i, cfg.maxSuspensionForce);
      this.controller.setWheelFrictionSlip(i, cfg.tyreGrip);
      this.controller.setWheelSideFrictionStiffness(i, cfg.sideGrip);
      this.wheels.push({ inContact: false, surface: null, suspensionLength: cfg.suspensionRestLength, steering: 0, rotation: 0 });
    });
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

    // --- engine and brakes -------------------------------------------------
    const maxForward = input.lowRange ? cfg.lowRangeMaxSpeed : cfg.maxSpeed;
    const maxReverse = input.lowRange ? Math.min(cfg.lowRangeMaxSpeed, cfg.reverseMaxSpeed) : cfg.reverseMaxSpeed;
    const forceScale = input.lowRange ? cfg.lowRangeForceMultiplier : 1;
    let engine = 0; // total drive force, + = forward
    let brake = 0; // per wheel

    if (input.throttle > 0) {
      if (speed < -0.5) {
        brake = cfg.brakeForce * input.throttle; // rolling backwards: brake first
      } else {
        // Full force at standstill, fading to zero at top speed.
        const fade = Math.max(0, 1 - speed / maxForward);
        engine = cfg.engineForce * forceScale * input.throttle * Math.min(1, fade * 2);
        this.gear = 'D';
      }
    } else if (input.throttle < 0) {
      if (speed > 0.5) {
        brake = cfg.brakeForce * -input.throttle; // rolling forwards: brake first
      } else {
        const fade = Math.max(0, 1 + speed / maxReverse);
        engine = cfg.engineForce * forceScale * input.throttle * Math.min(1, fade * 2);
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
      const surfaceGrip = wheel.surface ? SURFACES[wheel.surface].grip : 1;
      c.setWheelFrictionSlip(i, cfg.tyreGrip * surfaceGrip);
      c.setWheelEngineForce(i, engine / 4); // 4-wheel drive
      c.setWheelSteering(i, isFront ? this.steering : 0);
      c.setWheelBrake(i, brake + (!isFront && input.handbrake ? cfg.handbrakeForce : 0));
    }

    c.updateVehicle(dt);

    // --- read back the wheel state for rendering and the debug overlay ------
    for (let i = 0; i < 4; i++) {
      const wheel = this.wheels[i];
      wheel.inContact = c.wheelIsInContact(i);
      wheel.surface = wheel.inContact ? this.physics.surfaceOf(c.wheelGroundObject(i)) : null;
      wheel.suspensionLength = c.wheelSuspensionLength(i) ?? cfg.suspensionRestLength;
      wheel.steering = c.wheelSteering(i) ?? 0;
      wheel.rotation = c.wheelRotation(i) ?? 0;
    }
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

  /** Put the car back on its wheels, a little above where it is now. */
  reset(): void {
    const p = this.body.translation();
    const f = this.forwardDirection();
    const yaw = Math.atan2(f.x, f.z);
    this.body.setTranslation({ x: p.x, y: p.y + 1.2, z: p.z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
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
