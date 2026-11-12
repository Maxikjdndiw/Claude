// Progress saved in the browser (pebbles, upgrades, found camps).
// Storage can be missing or blocked, so every access is wrapped in try/catch
// and the game works without it.
import type { VehicleId } from '../config';

export interface WorldProgress {
  /** Ids of collected pebbles. */
  collected: string[];
  /** Ids of discovered camps. */
  camps: string[];
}

export interface SaveData {
  pebbles: number;
  upgrades: string[];
  vehicles: VehicleId[];
  vehicle: VehicleId;
  paints: string[];
  paint: string;
  muted: boolean;
  lastSeed: string;
  worlds: Record<string, WorldProgress>;
}

const KEY = 'mudlark-save-v1';

function fresh(): SaveData {
  return { pebbles: 0, upgrades: [], vehicles: ['short'], vehicle: 'short', paints: ['sage'], paint: 'sage', muted: false, lastSeed: '', worlds: {} };
}

export function loadSave(): SaveData {
  try {
    const text = localStorage.getItem(KEY);
    if (text) return { ...fresh(), ...JSON.parse(text) };
  } catch {
    /* no storage: start fresh */
  }
  return fresh();
}

export function storeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* no storage: progress lasts until the page is closed */
  }
}

export function worldProgress(data: SaveData, seed: string): WorldProgress {
  return (data.worlds[seed] ??= { collected: [], camps: [] });
}
