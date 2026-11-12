// The phase 1 test ground: a flat field with a few ramps, bumps and crates.
// It is described as plain data so the simulation and the renderer can both
// build it without knowing about each other. Seeded terrain replaces it later.
import type { SurfaceId } from '../config';
import { quatFromAxisAngle, type Quat, type Vec3 } from './physicsWorld';

export interface CourseBox {
  halfExtents: Vec3;
  position: Vec3;
  rotation: Quat;
  surface: SurfaceId;
  color: number;
  /** Loose boxes have a mass and can be pushed. */
  mass?: number;
}

const NO_ROTATION: Quat = { x: 0, y: 0, z: 0, w: 1 };
const X_AXIS = { x: 1, y: 0, z: 0 };
const Z_AXIS = { x: 0, y: 0, z: 1 };
const deg = (d: number) => (d * Math.PI) / 180;

/** A ramp that climbs towards +Z at the given angle, starting at ground level. */
function ramp(x: number, z: number, width: number, length: number, angleDeg: number, color: number): CourseBox {
  const a = deg(angleDeg);
  const thickness = 0.5;
  // Place the box so that the low end of its top surface touches the ground.
  return {
    halfExtents: { x: width / 2, y: thickness / 2, z: length / 2 },
    position: {
      x,
      y: (Math.sin(a) * length) / 2 - (Math.cos(a) * thickness) / 2,
      z: z + (Math.cos(a) * length) / 2 + (Math.sin(a) * thickness) / 2,
    },
    rotation: quatFromAxisAngle(X_AXIS, -a),
    surface: 'rock',
    color,
  };
}

export const GROUND_HALF_SIZE = 250;

export function buildTestCourse(): CourseBox[] {
  const boxes: CourseBox[] = [];
  const ROCK = 0x9a8f80;
  const ROCK_DARK = 0x7d7468;
  const WOOD = 0xb9824a;

  // Straight ahead of the spawn: a gentle ramp onto a platform and down again.
  boxes.push(ramp(0, 18, 5, 10, 12, ROCK));
  const top = Math.sin(deg(12)) * 10;
  boxes.push({ halfExtents: { x: 2.5, y: top / 2, z: 3 }, position: { x: 0, y: top / 2, z: 18 + Math.cos(deg(12)) * 10 + 3 }, rotation: NO_ROTATION, surface: 'rock', color: ROCK_DARK });

  // To the left (+X): three ramps, each steeper than the one before.
  [20, 30, 40].forEach((angle, i) => {
    boxes.push(ramp(14 + i * 7, 10, 5, 9, angle, i % 2 ? ROCK_DARK : ROCK));
  });

  // To the right (-X): alternating bumps that twist the suspension.
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    boxes.push({
      halfExtents: { x: 0.9, y: 0.18, z: 0.5 },
      position: { x: -14 + side * 0.75, y: 0.1, z: 8 + i * 2.2 },
      rotation: NO_ROTATION,
      surface: 'rock',
      color: i % 2 ? ROCK : ROCK_DARK,
    });
  }

  // Further right: a side slope to test how easily the car rolls over.
  const a = deg(25);
  boxes.push({
    halfExtents: { x: 4, y: 0.25, z: 12 },
    position: { x: -27, y: Math.sin(a) * 4 - 0.25, z: 20 },
    rotation: quatFromAxisAngle(Z_AXIS, a),
    surface: 'rock',
    color: ROCK,
  });

  // Behind the spawn: a small stack of loose crates to push.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3 - row; col++) {
      boxes.push({
        halfExtents: { x: 0.4, y: 0.4, z: 0.4 },
        position: { x: (col - (2 - row) / 2) * 0.85, y: 0.4 + row * 0.8, z: -12 },
        rotation: NO_ROTATION,
        surface: 'dirt',
        color: WOOD,
        mass: 25,
      });
    }
  }
  return boxes;
}
