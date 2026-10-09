import { companyValue } from './sim/finance';
import { SAVE_VERSION, type GameState } from './sim/state';

/**
 * Save games live in localStorage. The world itself is regenerated from the
 * seed; the state holds everything that changed (including terrain edits).
 */
export interface SaveMeta {
  slot: string;
  company: string;
  day: number;
  value: number;
  savedAt: number;
  version: number;
  scenario?: string;
}

const PREFIX = 'tycoon.save.';
export const SLOTS = ['auto', '1', '2', '3'];

export function saveGame(slot: string, state: GameState): { ok: boolean; reason?: string } {
  const meta: SaveMeta = {
    slot,
    company: state.companies[0].name,
    day: state.day,
    value: companyValue(state, state.companies[0]),
    savedAt: Date.now(),
    version: state.version,
    scenario: state.scenario?.id,
  };
  // Pending pop-ups and notifications are not worth saving.
  const data = { ...state, events: [] };
  try {
    localStorage.setItem(PREFIX + slot, JSON.stringify({ meta, state: data }));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.name === 'QuotaExceededError' ? 'Browser storage is full' : 'Could not save' };
  }
}

export function listSaves(): SaveMeta[] {
  const out: SaveMeta[] = [];
  for (const slot of SLOTS) {
    try {
      const raw = localStorage.getItem(PREFIX + slot);
      if (!raw) continue;
      const meta = JSON.parse(raw).meta as SaveMeta;
      out.push(meta);
    } catch {
      /* ignore broken slots */
    }
  }
  return out;
}

export function loadState(slot: string): { state?: GameState; reason?: string } {
  try {
    const raw = localStorage.getItem(PREFIX + slot);
    if (!raw) return { reason: 'Empty slot' };
    const { state } = JSON.parse(raw) as { state: GameState };
    if (state.version !== SAVE_VERSION) return { reason: 'This save is from an older version of the game' };
    state.events = [];
    return { state };
  } catch {
    return { reason: 'Save file is damaged' };
  }
}

export function deleteSave(slot: string): void {
  try {
    localStorage.removeItem(PREFIX + slot);
  } catch {
    /* ignore */
  }
}
