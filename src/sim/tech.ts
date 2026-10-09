import { BUILDING, type BuildingDef } from '../data/buildings';
import { LICENSE_PREMIUM, TECH, TECHS, type TechEffect } from '../data/techs';
import { emit } from './events';
import { book } from './finance';
import type { Building, Company, GameState, Mode } from './state';

function matches(target: string, def: BuildingDef): boolean {
  return target === 'all' || target === def.id || target === `cat:${def.category}`;
}

function effects(c: Company): TechEffect[] {
  return c.techs.flatMap((t) => TECH[t]?.effects ?? []);
}

/** Output multiplier from researched technologies. */
export function techOutput(state: GameState, b: Building): number {
  const c = state.companies[b.owner];
  const def = BUILDING[b.type];
  let m = 1;
  for (const e of effects(c)) if (e.kind === 'output' && matches(e.target, def)) m *= e.mult;
  return m;
}

/** Labor requirement multiplier (automation lowers the workers needed). */
export function techLabor(state: GameState, b: Building): number {
  const c = state.companies[b.owner];
  const def = BUILDING[b.type];
  let m = 1;
  for (const e of effects(c)) if (e.kind === 'labor' && matches(e.target, def)) m *= e.mult;
  return m;
}

export function transportFactors(c: Company, mode: Mode): { perKm: number; daily: number } {
  let perKm = 1;
  let daily = 1;
  for (const e of effects(c)) {
    if (e.kind !== 'transport' || (e.mode !== 'all' && e.mode !== mode)) continue;
    perKm *= e.perKm ?? 1;
    daily *= e.daily ?? 1;
  }
  return { perKm, daily };
}

export function regrowthFactor(state: GameState): number {
  // Regrowth is a property of the land; any company's replanting helps (a public good).
  let m = 1;
  for (const c of state.companies) for (const e of effects(c)) if (e.kind === 'regrowth') m = Math.max(m, e.mult);
  return m;
}

/** Is a building / vehicle / network unlocked for this company? */
export function isUnlocked(c: Company, what: string): boolean {
  const lockedBy = TECHS.find((t) => t.effects.some((e) => e.kind === 'unlock' && e.what === what));
  if (!lockedBy) return true;
  return c.techs.includes(lockedBy.id);
}

export function canBuildType(c: Company, type: string): boolean {
  const def = BUILDING[type];
  return !def.requires || c.techs.includes(def.requires);
}

export function researchable(c: Company, id: string): boolean {
  const t = TECH[id];
  return !!t && !c.techs.includes(id) && t.requires.every((r) => c.techs.includes(r));
}

export function startResearch(state: GameState, owner: number, id: string): { ok: boolean; reason?: string } {
  const c = state.companies[owner];
  if (!researchable(c, id)) return { ok: false, reason: 'Prerequisites missing' };
  if (c.research) return { ok: false, reason: 'Already researching something' };
  c.research = { tech: id, daysLeft: TECH[id].days };
  emit(state, 'info', `Research started: ${TECH[id].name}.`, { concept: 'rnd', owner });
  return { ok: true };
}

export function cancelResearch(state: GameState, owner: number): { ok: boolean } {
  state.companies[owner].research = null;
  return { ok: true };
}

export function licenseCost(state: GameState, id: string): number {
  return Math.round(TECH[id].cost * LICENSE_PREMIUM * state.priceLevel);
}

export function buyLicense(state: GameState, owner: number, id: string): { ok: boolean; reason?: string } {
  const c = state.companies[owner];
  if (!researchable(c, id)) return { ok: false, reason: 'Prerequisites missing' };
  const cost = licenseCost(state, id);
  if (c.cash < cost) return { ok: false, reason: 'Not enough cash' };
  book(c, 'research', cost);
  c.techs.push(id);
  if (c.research?.tech === id) c.research = null;
  emit(state, 'good', `Licensed ${TECH[id].name} for $${cost.toLocaleString()}.`, { concept: 'rnd', owner });
  return { ok: true };
}

/** Daily research progress; the cost is spread over the research period. */
export function updateResearch(state: GameState): void {
  for (const c of state.companies) {
    const r = c.research;
    if (!r || c.bankrupt) continue;
    const t = TECH[r.tech];
    book(c, 'research', (t.cost * state.priceLevel) / t.days);
    r.daysLeft--;
    if (r.daysLeft <= 0) {
      c.techs.push(r.tech);
      c.research = null;
      emit(state, 'good', `Research complete: ${t.name}. ${t.description}`, { concept: 'productivity', owner: c.id });
    }
  }
}
