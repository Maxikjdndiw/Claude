import * as THREE from 'three';
import { BIOMES } from './data/biomes';
import { BUILDING } from './data/buildings';
import { BuildingsView } from './render/buildings';
import { View } from './render/view';
import * as cmd from './sim/commands';
import { TOWN_CELL } from './sim/grid';
import { hashString } from './sim/rng';
import { startNewGame } from './sim/setup';
import { Sim } from './sim/sim';
import type { Endpoint, GameEvent, GameState } from './sim/state';
import { buildRoad, planRoad, type RoadPlan } from './sim/roads';
import { layoutTowns } from './sim/world/townLayout';
import { generateWorld } from './sim/world/generate';
import { analyzeSite, biomeOf, heightAt, type SiteAnalysis } from './sim/world/query';
import type { World } from './sim/world/types';
import { Store } from './ui/store';

export type Screen = 'menu' | 'pickStart' | 'playing';
export type LeftPanel = null | 'finance' | 'log' | 'lines';
export type Tool = null | 'road' | 'line';

export const START_RADIUS = 14;
/** Real seconds per simulated day at 1x speed. */
export const DAY_SECONDS = 1;

export interface Toast extends GameEvent {
  id: number;
  born: number;
}

export interface Placement extends cmd.PlacementCheck {
  type: string;
  x: number;
  y: number;
}

export interface UIState {
  screen: Screen;
  seedText: string;
  companyName: string;
  hover: SiteAnalysis | null;
  selected: SiteAnalysis | null;
  showResources: boolean;
  /** Bumped whenever simulation state changes (UI re-reads `game.state`). */
  tick: number;
  speed: number;
  buildType: string | null;
  placement: Placement | null;
  selectedBuilding: number | null;
  selectedTown: number | null;
  leftPanel: LeftPanel;
  toasts: Toast[];
  error: string | null;
  tool: Tool;
  roadStart: number | null;
  roadPlan: RoadPlan | null;
  lineFrom: Endpoint | null;
  lineDraft: { from: Endpoint; to: Endpoint } | null;
}

/** Turns a free-text seed into a number ("42" -> 42, "harbor" -> hash). */
export function parseSeed(text: string): number {
  const t = text.trim();
  if (/^\d+$/.test(t)) return Number(t) >>> 0;
  return hashString(t || 'tycoon');
}

export function randomSeedText(): string {
  return String(Math.floor(Math.random() * 1e6));
}

/** Top-level controller: connects simulation, renderer and UI. */
export class Game {
  readonly ui: Store<UIState>;
  readonly view: View;
  world: World | null = null;
  sim: Sim | null = null;
  buildingsView: BuildingsView | null = null;
  private ghost: THREE.Group | null = null;
  private lastHover = '';
  private acc = 0;
  private toastId = 0;
  private lastSpeed = 1;

  constructor(viewport: HTMLElement) {
    this.view = new View(viewport);
    this.ui = new Store<UIState>({
      screen: 'menu',
      seedText: randomSeedText(),
      companyName: 'Evergreen Industries',
      hover: null,
      selected: null,
      showResources: true,
      tick: 0,
      speed: 1,
      buildType: null,
      placement: null,
      selectedBuilding: null,
      selectedTown: null,
      leftPanel: null,
      toasts: [],
      error: null,
      tool: null,
      roadStart: null,
      roadPlan: null,
      lineFrom: null,
      lineDraft: null,
    });
    this.view.rig.onClick = (e) => this.onMapClick(e);
    this.view.dom.addEventListener('pointermove', (e) => this.onMapHover(e));
    this.view.dom.addEventListener('contextmenu', () => {
      this.cancelBuild();
      if (this.ui.state.tool) this.setTool(null);
    });
    this.view.onFrame = (dt) => this.frame(dt);
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.loadMenuBackdrop();
  }

  get state(): GameState | null {
    return this.sim?.state ?? null;
  }

  // ---------------------------------------------------------------- menu

  /** A slowly rotating world behind the main menu. */
  private loadMenuBackdrop(): void {
    this.setWorld(generateWorld(parseSeed(this.ui.state.seedText)));
    this.view.overlays!.markersVisible = false;
    this.view.labelsVisible = false;
    this.view.rig.setView(0.6, 0.75, this.world!.size * 1.05, true);
    this.view.rig.autoRotate = 0.05;
    this.view.rig.enabled = false;
  }

  private setWorld(world: World): void {
    this.world = world;
    this.view.setWorld(world);
    this.buildingsView = new BuildingsView(world);
    this.view.mapRoot.add(this.buildingsView.group);
    this.view.towns!.rebuild(world.towns, layoutTowns(world, world.towns));
  }

  previewSeed(seedText: string): void {
    this.ui.set({ seedText });
    this.setWorld(generateWorld(parseSeed(seedText)));
    this.view.overlays!.markersVisible = false;
    this.view.labelsVisible = false;
  }

  /** Main menu -> pick a start location on the generated map. */
  newGame(seedText: string, companyName: string): void {
    const seed = parseSeed(seedText);
    // Always regenerate: the previous game may have edited the terrain.
    this.setWorld(generateWorld(seed));
    this.sim = startNewGame(this.world!, companyName.trim() || 'Evergreen Industries');
    const state = this.sim.state;
    const v = this.view;
    v.rig.autoRotate = 0;
    v.rig.enabled = true;
    v.rig.setView(0.5, 1.05, this.world!.size * 1.0);
    v.rig.focus(this.world!.size / 2, this.world!.size / 2);
    v.overlays!.setDeposits(state.deposits);
    v.overlays!.markersVisible = this.ui.state.showResources;
    v.labelsVisible = true;
    this.afterChange();
    this.ui.set({ screen: 'pickStart', seedText, companyName, hover: null, selected: null });
  }

  /** Select a start site. Returns false if the cell is not buildable. */
  selectStart(cx: number, cy: number): boolean {
    if (!this.world || !this.state) return false;
    if (!BIOMES[biomeOf(this.world, cx, cy)].buildable) return false;
    if (this.sim!.occ.at(cx, cy) !== 0) return false;
    this.view.overlays!.placeSelection(cx + 0.5, cy + 0.5, START_RADIUS);
    this.ui.set({ selected: analyzeSite(this.world, cx, cy, START_RADIUS, this.state.deposits) });
    return true;
  }

  /** Test hook: select the nearest buildable cell around (x, y). */
  debugSelectStart(x: number, y: number): boolean {
    for (let r = 0; r < 10; r++)
      for (let oy = -r; oy <= r; oy++)
        for (let ox = -r; ox <= r; ox++) if (this.selectStart(x + ox, y + oy)) return true;
    return false;
  }

  confirmStart(): void {
    const sel = this.ui.state.selected;
    if (!sel || !this.sim) return;
    const res = cmd.foundCompany(this.sim, 0, sel.x, sel.y);
    if (!res.ok) {
      this.flashError(res.reason ?? 'Cannot found company here');
      return;
    }
    this.view.overlays!.cursor.visible = false;
    this.view.overlays!.selection.visible = false;
    this.view.rig.focus(sel.x + 0.5, sel.y + 0.5, 60);
    this.view.rig.setView(0.6, 0.85, 60);
    this.afterChange();
    this.ui.set({ screen: 'playing', hover: null, speed: 1 });
  }

  backToMenu(): void {
    this.sim = null;
    this.cancelBuild();
    this.view.overlays!.cursor.visible = false;
    this.view.overlays!.selection.visible = false;
    this.ui.set({
      screen: 'menu',
      hover: null,
      selected: null,
      selectedBuilding: null,
      selectedTown: null,
      leftPanel: null,
      toasts: [],
    });
    this.loadMenuBackdrop();
  }

  toggleResources(): void {
    const show = !this.ui.state.showResources;
    if (this.view.overlays) this.view.overlays.markersVisible = show;
    this.ui.set({ showResources: show });
  }

  // ---------------------------------------------------------------- time

  setSpeed(speed: number): void {
    if (speed > 0) this.lastSpeed = speed;
    this.ui.set({ speed });
  }

  togglePause(): void {
    this.setSpeed(this.ui.state.speed === 0 ? this.lastSpeed : 0);
  }

  private frame(dt: number): void {
    const s = this.ui.state;
    this.buildingsView?.update(dt, s.speed);
    if (this.sim) this.view.vehicles?.update(this.sim.state, Math.min(1, this.acc), this.sim.state.companies.map((c) => c.color));
    if (s.screen !== 'playing' || !this.sim || s.speed === 0 || this.sim.state.gameOver) return;
    this.acc += (dt * s.speed) / DAY_SECONDS;
    let steps = 0;
    while (this.acc >= 1 && steps < 8) {
      this.sim.step();
      this.acc -= 1;
      steps++;
    }
    if (steps) this.afterChange();
  }

  /** Advance N days immediately (tests, debugging). */
  advance(days: number): void {
    if (!this.sim) return;
    for (let i = 0; i < days; i++) this.sim.step();
    this.afterChange();
  }

  /** Push simulation changes to the renderer and UI. */
  afterChange(): void {
    const sim = this.sim;
    if (!sim) return;
    const v = this.view;
    if (sim.terrainDirty.length) {
      for (const r of sim.terrainDirty) {
        v.terrain?.updateRegion(r.x0, r.y0, r.x1, r.y1);
        const cells: number[] = [];
        for (let y = r.y0 - 1; y <= r.y1; y++)
          for (let x = r.x0 - 1; x <= r.x1; x++)
            if (x >= 0 && y >= 0 && x < sim.world.size && y < sim.world.size) cells.push(y * sim.world.size + x);
        v.props?.clearCells(cells);
      }
      sim.terrainDirty = [];
    }
    if (sim.roadsDirty) {
      v.roads?.rebuild(sim.state.roads);
      sim.roadsDirty = false;
    }
    if (sim.townsDirty) {
      v.towns?.rebuild(sim.state.towns, sim.occ.layouts);
      sim.townsDirty = false;
    }
    v.updateTownLabels(sim.state.towns);
    this.buildingsView?.sync(
      sim.state,
      sim.state.companies.map((c) => c.color),
    );
    const selB = this.ui.state.selectedBuilding;
    const b = selB !== null ? (sim.state.buildings.find((x) => x.id === selB) ?? null) : null;
    this.buildingsView?.select(b);

    const events = sim.state.events.splice(0);
    let toasts = this.ui.state.toasts;
    if (events.length) {
      const now = performance.now();
      toasts = [...toasts, ...events.map((e) => ({ ...e, id: ++this.toastId, born: now }))].slice(-5);
    }
    const speed = sim.state.gameOver ? 0 : this.ui.state.speed;
    this.ui.set({ tick: this.ui.state.tick + 1, toasts, speed, selectedBuilding: b ? b.id : null });
  }

  dismissToast(id: number): void {
    this.ui.set({ toasts: this.ui.state.toasts.filter((t) => t.id !== id) });
  }

  flashError(msg: string): void {
    this.ui.set({ error: msg });
    setTimeout(() => this.ui.state.error === msg && this.ui.set({ error: null }), 3000);
  }

  // ---------------------------------------------------------------- building

  startBuild(type: string): void {
    this.cancelBuild();
    this.ghost = BuildingsView.ghost(BUILDING[type]);
    this.ghost.visible = false;
    this.view.mapRoot.add(this.ghost);
    this.view.roads?.showPreview(null);
    this.ui.set({ buildType: type, placement: null, selectedBuilding: null, selectedTown: null, tool: null, roadStart: null, lineFrom: null });
    this.afterChange();
  }

  cancelBuild(): void {
    if (this.ghost) this.view.mapRoot.remove(this.ghost);
    this.ghost = null;
    if (this.ui.state.buildType) this.ui.set({ buildType: null, placement: null });
  }

  /** Top-left footprint cell for a pointer position. */
  private footprintAt(type: string, gx: number, gy: number): [number, number] {
    const [w, h] = BUILDING[type].footprint;
    return [Math.round(gx - w / 2), Math.round(gy - h / 2)];
  }

  /** Move the placement ghost to a grid position and validate it. */
  updatePlacement(gx: number, gy: number): void {
    const type = this.ui.state.buildType;
    if (!type || !this.sim || !this.ghost) return;
    const [x, y] = this.footprintAt(type, gx, gy);
    const prev = this.ui.state.placement;
    if (prev && prev.x === x && prev.y === y && prev.type === type) return;
    const chk = cmd.checkPlacement(this.sim, 0, type, x, y);
    const [w, h] = BUILDING[type].footprint;
    this.ghost.visible = true;
    this.ghost.position.set(x + w / 2, heightAt(this.sim.world, x + w / 2, y + h / 2) + 0.05, y + h / 2);
    const pad = this.ghost.getObjectByName('pad') as THREE.Mesh;
    (pad.material as THREE.MeshBasicMaterial).color.set(chk.ok ? '#5bd18b' : '#ef6b5b');
    this.ui.set({ placement: { ...chk, type, x, y } });
  }

  /** Build at the current placement. */
  tryBuild(): boolean {
    const p = this.ui.state.placement;
    if (!p || !this.sim) return false;
    const res = cmd.build(this.sim, 0, p.type, p.x, p.y);
    if (!res.ok) {
      this.flashError(res.reason ?? 'Cannot build here');
      return false;
    }
    this.cancelBuild();
    this.ui.set({ selectedBuilding: res.building!.id });
    this.afterChange();
    return true;
  }

  // ---------------------------------------------------------------- transport tools

  setTool(tool: Tool): void {
    this.cancelBuild();
    this.view.roads?.showPreview(null);
    this.view.overlays!.cursor.visible = false;
    this.ui.set({
      tool: this.ui.state.tool === tool ? null : tool,
      roadStart: null,
      roadPlan: null,
      lineFrom: null,
      selectedBuilding: null,
      selectedTown: null,
    });
    this.afterChange();
  }

  /** What a click on this cell means as a line endpoint. */
  endpointAt(cx: number, cy: number): Endpoint | null {
    const sim = this.sim!;
    const o = sim.occ.at(cx, cy);
    if (o > 0) {
      const b = sim.state.buildings.find((x) => x.id === o);
      if (b && b.owner === 0 && b.type !== 'hq') return { kind: 'building', id: b.id };
      return null;
    }
    for (const t of sim.state.towns) {
      if (Math.hypot(t.x - cx, t.y - cy) <= (sim.occ.townRadius[t.id] ?? 4)) return { kind: 'town', id: t.id };
    }
    return null;
  }

  private roadClick(cell: number): void {
    const sim = this.sim!;
    const start = this.ui.state.roadStart;
    if (start === null) {
      this.ui.set({ roadStart: cell });
      return;
    }
    const plan = planRoad(sim, start, cell);
    const res = buildRoad(sim, 0, start, cell);
    if (!res.ok) {
      this.flashError(res.reason ?? 'Cannot build this road');
      return;
    }
    this.view.roads?.showPreview(null);
    // Chain: the next road starts where this one ended.
    this.ui.set({ roadStart: plan ? plan.path[plan.path.length - 1] : null, roadPlan: null });
    this.afterChange();
  }

  private roadHover(cell: number): void {
    const start = this.ui.state.roadStart;
    const size = this.sim!.world.size;
    this.view.overlays!.placeCursor((cell % size) + 0.5, ((cell / size) | 0) + 0.5, 0.8, true);
    if (start === null) return;
    const prev = this.ui.state.roadPlan;
    if (prev && prev.path[prev.path.length - 1] === cell) return;
    const plan = planRoad(this.sim!, start, cell);
    this.view.roads?.showPreview(plan ? plan.path : null);
    this.ui.set({ roadPlan: plan });
  }

  private lineClick(cx: number, cy: number): void {
    const e = this.endpointAt(cx, cy);
    if (!e) {
      this.flashError('Click one of your buildings or a town');
      return;
    }
    const from = this.ui.state.lineFrom;
    if (!from) this.ui.set({ lineFrom: e });
    else this.ui.set({ lineDraft: { from, to: e }, lineFrom: null, tool: null });
  }

  closeLineDraft(): void {
    this.ui.set({ lineDraft: null });
  }

  // ---------------------------------------------------------------- commands for the UI

  run(fn: (sim: Sim) => cmd.Result): void {
    if (!this.sim) return;
    const res = fn(this.sim);
    if (!res.ok && res.reason) this.flashError(res.reason);
    this.afterChange();
  }

  selectBuilding(id: number | null): void {
    this.cancelBuild();
    this.ui.set({ selectedBuilding: id, selectedTown: null });
    this.afterChange();
  }

  selectTown(id: number | null): void {
    this.cancelBuild();
    this.ui.set({ selectedTown: id, selectedBuilding: null });
    this.afterChange();
    if (id !== null && this.state) {
      const t = this.state.towns[id];
      this.view.rig.focus(t.x + 0.5, t.y + 0.5);
    }
  }

  focusBuilding(id: number): void {
    const b = this.state?.buildings.find((x) => x.id === id);
    if (!b) return;
    const [w, h] = BUILDING[b.type].footprint;
    this.view.rig.focus(b.x + w / 2, b.y + h / 2);
    this.selectBuilding(id);
  }

  setLeftPanel(p: LeftPanel): void {
    this.ui.set({ leftPanel: this.ui.state.leftPanel === p ? null : p });
  }

  // ---------------------------------------------------------------- input

  private onMapHover(e: PointerEvent): void {
    const screen = this.ui.state.screen;
    if (!this.world || !this.state || this.view.rig.dragging) return;
    if (screen === 'pickStart') {
      const p = this.view.pick(e.clientX, e.clientY);
      if (!p) {
        this.view.overlays!.cursor.visible = false;
        return;
      }
      const ok = BIOMES[biomeOf(this.world, p.cx, p.cy)].buildable;
      this.view.overlays!.placeCursor(p.cx + 0.5, p.cy + 0.5, START_RADIUS, ok);
      const key = `${p.cx},${p.cy}`;
      if (key !== this.lastHover && ok) {
        this.lastHover = key;
        this.ui.set({ hover: analyzeSite(this.world, p.cx, p.cy, START_RADIUS, this.state.deposits) });
      }
    } else if (screen === 'playing' && this.ui.state.buildType) {
      const p = this.view.pick(e.clientX, e.clientY);
      if (p) this.updatePlacement(p.gx, p.gy);
    } else if (screen === 'playing' && this.ui.state.tool === 'road') {
      const p = this.view.pick(e.clientX, e.clientY);
      if (p) this.roadHover(p.cy * this.world.size + p.cx);
    }
  }

  private onMapClick(e: PointerEvent): void {
    if (!this.world || !this.sim) return;
    if (e.button === 2) return;
    const p = this.view.pick(e.clientX, e.clientY);
    if (!p) return;
    const screen = this.ui.state.screen;
    if (screen === 'pickStart') {
      this.selectStart(p.cx, p.cy);
      return;
    }
    if (screen !== 'playing') return;
    if (this.ui.state.buildType) {
      this.updatePlacement(p.gx, p.gy);
      this.tryBuild();
      return;
    }
    if (this.ui.state.tool === 'road') {
      this.roadClick(p.cy * this.world.size + p.cx);
      return;
    }
    if (this.ui.state.tool === 'line') {
      this.lineClick(p.cx, p.cy);
      return;
    }
    const o = this.sim.occ.at(p.cx, p.cy);
    if (o > 0) this.selectBuilding(o);
    else if (o === TOWN_CELL) this.selectTown(this.nearestTown(p.cx, p.cy));
    else {
      this.ui.set({ selectedBuilding: null, selectedTown: null });
      this.afterChange();
    }
  }

  private nearestTown(x: number, y: number): number {
    let best = 0;
    let bestD = Infinity;
    for (const t of this.sim!.state.towns) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < bestD) {
        bestD = d;
        best = t.id;
      }
    }
    return best;
  }

  private onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (this.ui.state.screen !== 'playing') return;
    if (e.key === 'Escape') {
      if (this.ui.state.tool) this.setTool(null);
      else if (this.ui.state.buildType) this.cancelBuild();
      else this.ui.set({ selectedBuilding: null, selectedTown: null, leftPanel: null });
      this.afterChange();
    } else if (e.key === ' ') {
      e.preventDefault();
      this.togglePause();
    } else if (e.key === '1') this.setSpeed(1);
    else if (e.key === '2') this.setSpeed(2);
    else if (e.key === '3') this.setSpeed(4);
  }
}
