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

/**
 * Per surface: grip multiplier (1 = normal) and rolling drag.
 * Drag works like a light brake on every wheel that stands on the surface;
 * deep mud has so much drag that the car gets stuck without low range or the winch.
 */
export const SURFACES = {
  grass: { grip: 0.85, drag: 0 },
  dirt: { grip: 1.0, drag: 0 },
  mud: { grip: 0.42, drag: 7 },
  deepMud: { grip: 0.24, drag: 24 },
  rock: { grip: 1.05, drag: 0 },
  wetRock: { grip: 0.6, drag: 1 },
} as const;
export type SurfaceId = keyof typeof SURFACES;

/** World generation. Changing these changes every world, so all players need the same values. */
export const WORLD = {
  /** Side length of one terrain chunk in metres. */
  chunkSize: 64,
  /** Grid cells per chunk side at full detail (2 m per cell). */
  chunkCells: 32,
  /** Chunks drawn around the player in every direction. */
  viewRadius: 6,
  /** Chunks around the player that have physics. */
  physicsRadius: 1,
  /** Camps and challenge spots are generated per region of this size. */
  regionSize: 320,
  campChance: 0.5,
  challengesPerRegion: 2,
  /** Knoll height divided by radius. 0.66 gives slopes of about 48 degrees: winch needed. */
  knollSteepness: 0.66,
  riverDepth: 1.6,
  fordDepth: 0.32,
  treeTriesPerChunk: 80,
  rockTriesPerChunk: 16,
  pebbleTriesPerChunk: 3,
};

export const WATER = {
  /** Extra air-like drag per metre the car sits in water. */
  dragPerMetre: 1.6,
  /** Deeper than this the car starts to float and loses most grip. */
  deepWater: 0.95,
  deepWaterGrip: 0.3,
};

export const WINCH = {
  /** How far away an anchor (tree or post) may be to attach. */
  range: 28,
  /** The rope cannot be let out further than this. */
  maxLength: 34,
  minLength: 2.5,
  /** Reel speed in metres per second. */
  reelSpeed: 1.2,
  /** Strongest pull in newtons (the car weighs about 17000 N). */
  maxForce: 30000,
  /** Rope stretchiness: force per metre of stretch. */
  stiffness: 30000,
  damping: 9000,
};

export const DAMAGE = {
  /** Sudden speed changes (m/s within one step) below this do no damage. */
  minImpact: 4,
  /** Condition lost per m/s of impact above the minimum (1 = whole car). */
  perImpact: 0.02,
  /** Engine power left when the car is completely worn (0..1). */
  minEnginePower: 0.55,
};

export interface VehicleConfig {
  id: 'short' | 'long';
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
  /** How fast the engine follows the pedal: 3 = from idle to full power in 1/3 second. */
  throttleResponse: number;
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
  id: 'short',
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
  tyreGrip: 0.75,
  sideGrip: 0.85,
  engineForce: 7000,
  throttleResponse: 3,
  maxSpeed: 17, // about 60 km/h: this is not a racing game
  reverseMaxSpeed: 6,
  lowRangeForceMultiplier: 2.2,
  lowRangeMaxSpeed: 5,
  brakeForce: 45,
  handbrakeForce: 120,
  engineBrake: 3,
  lowRangeEngineBrake: 14,
  maxSteerAngle: 0.6,
  steerAtTopSpeed: 0.35,
  steerSpeed: 2.2,
};

/** The long boxy 4x4: heavier and calmer, more stable on slopes, wider turning circle. */
export const LONG_4X4: VehicleConfig = {
  ...SHORT_4X4,
  id: 'long',
  name: 'Long 4x4',
  mass: 2050,
  chassisHalfExtents: { x: 0.82, y: 0.42, z: 2.25 },
  centerOfMassY: -0.42,
  wheelBase: 2.9,
  trackWidth: 1.56,
  springStiffness: 20,
  dampingCompression: 2.8,
  dampingRelaxation: 4.0,
  engineForce: 8000,
  maxSteerAngle: 0.5,
  steerSpeed: 1.8,
  brakeForce: 50,
};

export const VEHICLES = { short: SHORT_4X4, long: LONG_4X4 } as const;
export type VehicleId = keyof typeof VEHICLES;

/** Things to buy with pebbles at a camp. `apply` changes a copy of the car config. */
export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  apply: (cfg: VehicleConfig, winch: typeof WINCH) => void;
}
export const UPGRADES: UpgradeDef[] = [
  { id: 'tyres', name: 'Mud tyres', description: 'More grip on every surface.', cost: 12, apply: (c) => { c.tyreGrip *= 1.22; } },
  { id: 'engine', name: 'Engine tune', description: 'More pulling force.', cost: 18, apply: (c) => { c.engineForce *= 1.25; } },
  { id: 'lift', name: 'Suspension lift', description: 'More ground clearance and wheel travel.', cost: 15, apply: (c) => { c.suspensionRestLength += 0.1; c.suspensionTravel += 0.08; } },
  { id: 'winch', name: 'Long winch rope', description: 'Reach anchors further away and pull harder.', cost: 10, apply: (_c, w) => { w.range += 12; w.maxLength += 14; w.maxForce *= 1.3; } },
];
export const LONG_4X4_COST = 25;

/** Paint colours (cosmetic). The first one is free. */
export const PAINTS = [
  { id: 'sage', name: 'Sage', color: 0x6f8f72, roof: 0xf0e6d0, cost: 0 },
  { id: 'sand', name: 'Sand', color: 0xcfae78, roof: 0xf5efe0, cost: 5 },
  { id: 'rust', name: 'Rust', color: 0xa8553a, roof: 0xf0e6d0, cost: 5 },
  { id: 'sky', name: 'Lake blue', color: 0x5b8fa6, roof: 0xf5efe0, cost: 5 },
  { id: 'night', name: 'Charcoal', color: 0x3c4046, roof: 0x8d8f8c, cost: 8 },
  { id: 'butter', name: 'Butter', color: 0xe6c95a, roof: 0x2b2a28, cost: 8 },
] as const;

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

export const SKY = {
  /** Length of a full day and night in real minutes. */
  dayLengthMinutes: 18,
  /** Time of day a new game starts at: 0 = midnight, 0.5 = noon. */
  startTime: 0.31,
};
