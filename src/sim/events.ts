import type { EventKind, GameState } from './state';

export function emit(
  state: GameState,
  kind: EventKind,
  text: string,
  extra: { concept?: string; at?: { x: number; y: number }; owner?: number } = {},
): void {
  // Only the player's own news is surfaced; bot news is emitted without an owner.
  if (extra.owner !== undefined && extra.owner !== 0) return;
  const e = { day: state.day, kind, text, concept: extra.concept, at: extra.at };
  state.events.push(e);
  state.log.push(e);
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
}
