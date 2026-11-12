// Data that will be sent over the network in the multiplayer phase.
// Terrain is never sent: every client builds it from the seed.

/** One car at one moment. Sent about 20 times per second per player. */
export interface VehicleSnapshot {
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion x, y, z, w
  linearVelocity: [number, number, number];
  angularVelocity: [number, number, number];
  steering: number;
}
