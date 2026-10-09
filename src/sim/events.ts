import type { EventKind, GameState } from './state';

/**
 * Record that the player met an economics concept. The first time, queue a
 * pop-up with the live example (later encounters are not repeated).
 */
export function learn(state: GameState, concept: string, example: string): void {
  if (state.learning.seen[concept]) return;
  state.learning.seen[concept] = { day: state.day, example };
  state.learning.queue.push({ concept, example });
}

export function emit(
  state: GameState,
  kind: EventKind,
  text: string,
  extra: { concept?: string; at?: { x: number; y: number }; owner?: number } = {},
): void {
  // Only the player's own news is surfaced; bot news is emitted without an owner.
  if (extra.owner !== undefined && extra.owner !== 0) return;
  const e = { day: state.day, kind, text, concept: extra.concept, at: extra.at };
  if (extra.concept) learn(state, extra.concept, text);
  state.events.push(e);
  state.log.push(e);
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
}
