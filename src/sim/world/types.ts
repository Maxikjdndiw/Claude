import type { BiomeId } from '../../data/biomes';

/** Water kind stored per vertex. */
export const Water = { None: 0, Ocean: 1, Lake: 2, River: 3 } as const;

export interface DepositSeed {
  id: number;
  resource: string;
  /** Cell coordinates of the cluster center. */
  x: number;
  y: number;
  radius: number;
  amount: number;
  hidden: boolean;
}

export interface TownSite {
  id: number;
  name: string;
  x: number;
  y: number;
  population: number;
  coastal: boolean;
}

/**
 * Static world data, generated deterministically from the seed. It is never
 * serialized; save files store the seed plus a sparse list of terrain edits.
 *
 * Grid: `size` x `size` cells, `n = size + 1` vertices per side.
 * Vertex arrays are indexed `y * n + x`, cell arrays `y * size + x`.
 */
export interface World {
  seed: number;
  size: number;
  n: number;
  /** Terrain height per vertex (world units; sea level = 0). */
  heights: Float32Array;
  /** Water surface per vertex, or NaN when dry. */
  waterLevel: Float32Array;
  water: Uint8Array;
  moisture: Float32Array;
  /** Per-cell biome index into BIOME_IDS. */
  biome: Uint8Array;
  /** Per-cell fields 0..1. */
  fertility: Float32Array;
  forest: Float32Array;
  fish: Float32Array;
  /** Per-cell distance (cells) to nearest fresh water and to the sea. */
  freshDist: Float32Array;
  seaDist: Float32Array;
  towns: TownSite[];
  deposits: DepositSeed[];
  /** Direction (radians) the ocean side faces, used for camera framing. */
  oceanAngle: number;
}

export interface CellInfo {
  x: number;
  y: number;
  biome: BiomeId;
  height: number;
  slope: number;
  fertility: number;
  forest: number;
  fish: number;
  freshDist: number;
  seaDist: number;
}
