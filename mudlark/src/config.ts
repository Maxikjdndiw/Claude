// ---------------------------------------------------------------------------
// ALL TUNING VALUES LIVE HERE.
// Change a number, save, and the dev server reloads the game.
// Units: metres, seconds, kilograms, radians (unless a name says otherwise).
// ---------------------------------------------------------------------------

export const PHYSICS = {
  gravity: -9.81,
  /** Fixed simulation step. The same on every machine (needed for multiplayer later). */
  timestep: 1 / 60,
};

/** Grip multiplier per surface. 1 = normal grip. Used by every wheel. */
export const SURFACES = {
  grass: { grip: 1.0 },
  dirt: { grip: 0.9 },
  mud: { grip: 0.45 },
  rock: { grip: 1.15 },
  wetRock: { grip: 0.6 },
} as const;
export type SurfaceId = keyof typeof SURFACES;

export interface VehicleConfig {
  name: string;
  // --- body ---
  mass: number;
  /** Half size of the chassis collision box (x = half width, y = half height, z = half length). */
  chassisHalfExtents: { x: number; y: number; z: number };
  /** Centre of mass height relative to the box centre. Lower = harder to roll over. */
  centerOfMassY: number;
  // --- wheels ---
  wheelRadius: number;
  wheelWidth: number;
  /** Distance between front and rear axle. */
  wheelBase: number;
  /** Distance between left and right wheel centres. */
  trackWidth: number;
  /** Height of the suspension mounting point relative to the box centre. */
  suspensionMountY: number;
  // --- suspension ---
  suspensionRestLength: number;
  /** How far the wheel may move from its rest position. */
  suspensionTravel: number;
  /** Spring stiffness (per kg of car). Higher = stiffer, sits higher. */
  springStiffness: number;
  /** Damping while the spring is being pushed in. */
  dampingCompression: number;
  /** Damping while the spring extends again. */
  dampingRelaxation: number;
  maxSuspensionForce: number;
  // --- grip ---
  /** Forward/backward grip of a tyre on a surface with grip 1. */
  tyreGrip: number;
  /** Sideways grip (0..1). Lower = slides more in corners. */
  sideGrip: number;
  // --- engine and brakes ---
  /** Total drive force in newtons, split over all 4 wheels (4-wheel drive). */
  engineForce: number;
  /** Top speed in high range, m/s. Engine force fades out towards this speed. */
  maxSpeed: number;
  reverseMaxSpeed: number;
  /** Low range: more force, less speed. */
  lowRangeForceMultiplier: number;
  lowRangeMaxSpeed: number;
  /** Brake force per wheel (impulse units of the physics engine). */
  brakeForce: number;
  /** Handbrake force on each rear wheel. */
  handbrakeForce: number;
  /** Gentle braking when no pedal is pressed (engine braking). */
  engineBrake: number;
  /** Stronger engine braking in low range, so the car creeps down hills. */
  lowRangeEngineBrake: number;
  // --- steering ---
  /** Maximum steering angle at standstill. */
  maxSteerAngle: number;
  /** Fraction of the steering angle that is left at top speed. */
  steerAtTopSpeed: number;
  /** How fast the wheels turn towards the wanted angle, radians per second. */
  steerSpeed: number;
}

/** The short boxy 4x4: agile, short wheelbase. */
export const SHORT_4X4: VehicleConfig = {
  name: 'Short 4x4',
  mass: 1700,
  chassisHalfExtents: { x: 0.8, y: 0.42, z: 1.8 },
  centerOfMassY: -0.35,
  wheelRadius: 0.4,
  wheelWidth: 0.28,
  wheelBase: 2.36,
  trackWidth: 1.5,
  suspensionMountY: -0.2,
  suspensionRestLength: 0.5,
  suspensionTravel: 0.3,
  springStiffness: 22,
  dampingCompression: 2.6,
  dampingRelaxation: 3.6,
  maxSuspensionForce: 60000,
  tyreGrip: 1.6,
  sideGrip: 0.85,
  engineForce: 9000,
  maxSpeed: 17, // about 60 km/h: this is not a racing game
  reverseMaxSpeed: 6,
  lowRangeForceMultiplier: 2.0,
  lowRangeMaxSpeed: 5,
  brakeForce: 45,
  handbrakeForce: 120,
  engineBrake: 3,
  lowRangeEngineBrake: 14,
  maxSteerAngle: 0.6,
  steerAtTopSpeed: 0.35,
  steerSpeed: 2.2,
};

export const CAMERA = {
  distance: 7.5,
  minDistance: 4,
  maxDistance: 16,
  /** Camera height angle above the car, radians. */
  pitch: 0.32,
  /** Higher = camera follows faster. */
  followSharpness: 5,
  /** Seconds without mouse movement before the camera swings back behind the car. */
  autoCenterDelay: 2.5,
  mouseSensitivity: 0.0028,
  fov: 55,
};
