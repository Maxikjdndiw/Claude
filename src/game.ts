import { createState, type GameState } from './sim/state';
import { hashString } from './sim/rng';
import { generateWorld } from './sim/world/generate';
import { analyzeSite, biomeOf, type SiteAnalysis } from './sim/world/query';
import type { World } from './sim/world/types';
import { Store } from './ui/store';
import { View } from './render/view';
import { BIOMES } from './data/biomes';

export type Screen = 'menu' | 'pickStart' | 'playing';

export const START_RADIUS = 14;

export interface UIState {
  screen: Screen;
  seedText: string;
  companyName: string;
  hover: SiteAnalysis | null;
  selected: SiteAnalysis | null;
  showResources: boolean;
  /** Bumped whenever simulation state changes (UI re-reads `game.state`). */
  tick: number;
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
  state: GameState | null = null;
  private lastHover = '';

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
    });
    this.view.rig.onClick = (e) => this.onMapClick(e);
    this.view.dom.addEventListener('pointermove', (e) => this.onMapHover(e));
    this.loadMenuBackdrop();
  }

  /** A slowly rotating world behind the main menu. */
  private loadMenuBackdrop(): void {
    this.world = generateWorld(parseSeed(this.ui.state.seedText));
    this.view.setWorld(this.world);
    this.view.overlays!.markersVisible = false;
    this.view.labelsVisible = false;
    this.view.rig.setView(0.6, 0.75, this.world.size * 1.05, true);
    this.view.rig.autoRotate = 0.05;
    this.view.rig.enabled = false;
  }

  previewSeed(seedText: string): void {
    this.ui.set({ seedText });
    this.world = generateWorld(parseSeed(seedText));
    this.view.setWorld(this.world);
    this.view.overlays!.markersVisible = false;
    this.view.labelsVisible = false;
  }

  /** Main menu -> pick a start location on the generated map. */
  newGame(seedText: string, companyName: string): void {
    const seed = parseSeed(seedText);
    if (!this.world || this.world.seed !== seed) {
      this.world = generateWorld(seed);
      this.view.setWorld(this.world);
    }
    this.state = createState(seed, companyName.trim() || 'Evergreen Industries', this.world.deposits);
    const v = this.view;
    v.rig.autoRotate = 0;
    v.rig.enabled = true;
    v.rig.setView(0.5, 1.05, this.world.size * 1.0);
    v.rig.focus(this.world.size / 2, this.world.size / 2);
    v.overlays!.setDeposits(this.state.deposits);
    v.overlays!.markersVisible = true;
    v.labelsVisible = true;
    this.ui.set({ screen: 'pickStart', seedText, companyName, hover: null, selected: null });
  }

  private onMapHover(e: PointerEvent): void {
    if (this.ui.state.screen !== 'pickStart' || !this.world || !this.state || this.view.rig.dragging) return;
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
  }

  private onMapClick(e: PointerEvent): void {
    if (!this.world || !this.state) return;
    const p = this.view.pick(e.clientX, e.clientY);
    if (!p) return;
    if (this.ui.state.screen === 'pickStart') this.selectStart(p.cx, p.cy);
  }

  /** Select a start site. Returns false if the cell is not buildable. */
  selectStart(cx: number, cy: number): boolean {
    if (!this.world || !this.state) return false;
    if (!BIOMES[biomeOf(this.world, cx, cy)].buildable) return false;
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
    if (!sel || !this.state || !this.world) return;
    this.state.hq = { x: sel.x, y: sel.y };
    this.view.overlays!.cursor.visible = false;
    this.view.rig.focus(sel.x + 0.5, sel.y + 0.5, 55);
    this.ui.set({ screen: 'playing', hover: null });
  }

  toggleResources(): void {
    const show = !this.ui.state.showResources;
    if (this.view.overlays) this.view.overlays.markersVisible = show;
    this.ui.set({ showResources: show });
  }

  backToMenu(): void {
    this.state = null;
    this.view.overlays!.cursor.visible = false;
    this.view.overlays!.selection.visible = false;
    this.ui.set({ screen: 'menu', hover: null, selected: null });
    this.loadMenuBackdrop();
  }
}
