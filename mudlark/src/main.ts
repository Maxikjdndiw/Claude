// Entry point: creates the shared parts (renderer, camera, input, UI, sound),
// shows the title screen and runs the main loop.
// Simulation code lives in src/sim, rendering in src/render, rules in src/game.
import './style.css';
import { Sound } from './audio/sound';
import { SHORT_4X4 } from './config';
import { Game } from './game/game';
import { loadSave, storeSave } from './game/save';
import { ChaseCamera } from './render/chaseCamera';
import { GameScene } from './render/scene';
import { Input } from './sim/input';
import { PhysicsWorld } from './sim/physicsWorld';
import { CampMenu } from './ui/campMenu';
import { DebugOverlay } from './ui/debugOverlay';
import { Hud } from './ui/hud';
import { TuningPanel } from './ui/tuningPanel';

const $ = (id: string) => document.getElementById(id)!;

const SEED_WORDS_A = ['mossy', 'quiet', 'amber', 'misty', 'stony', 'golden', 'windy', 'muddy', 'pine', 'heron', 'foggy', 'rusty'];
const SEED_WORDS_B = ['ridge', 'hollow', 'creek', 'meadow', 'pass', 'ford', 'marsh', 'valley', 'track', 'summit', 'glen', 'moor'];
/** Picking a seed is not part of the world simulation, so Math.random is fine here. */
function randomSeed(): string {
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
  return `${pick(SEED_WORDS_A)}-${pick(SEED_WORDS_B)}-${Math.floor(Math.random() * 90 + 10)}`;
}

async function main(): Promise<void> {
  const canvas = $('game') as HTMLCanvasElement;
  const startScreen = $('start-screen');
  const startButton = $('start-button') as HTMLButtonElement;
  const seedInput = $('seed-input') as HTMLInputElement;

  const save = loadSave();
  seedInput.value = save.lastSeed || 'mudlark';

  await PhysicsWorld.load();

  const scene = new GameScene(canvas);
  const chase = new ChaseCamera(canvas);
  const input = new Input();
  const hud = new Hud();
  const debug = new DebugOverlay($('debug'));
  const sound = new Sound();
  const menu = new CampMenu($('menu'));
  const tuning = new TuningPanel($('tuning'), structuredClone(SHORT_4X4), SHORT_4X4, () => {});

  const lockPointer = () => {
    // Capturing the mouse is optional; without it you orbit by dragging.
    try {
      (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
    } catch {
      /* not available here */
    }
  };

  const showTitle = () => {
    game.active = false;
    input.enabled = false;
    hud.setVisible(false);
    startScreen.hidden = false;
    document.exitPointerLock?.();
  };
  const deps = { scene, chase, hud, debug, tuning, menu, sound, save, onQuit: showTitle };

  // A world is already running behind the title screen.
  let game = new Game(seedInput.value.trim().toLowerCase() || 'mudlark', deps);

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    scene.resize(w, h);
    chase.resize(w, h);
  };
  window.addEventListener('resize', resize);
  resize();

  $('seed-random').addEventListener('click', () => (seedInput.value = randomSeed()));
  startButton.disabled = false;
  startButton.textContent = 'Start driving';
  $('seed-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const seed = seedInput.value.trim().toLowerCase() || randomSeed();
    seedInput.value = seed;
    if (seed !== game.seedText) {
      game.dispose();
      game = new Game(seed, deps);
    }
    save.lastSeed = seed;
    storeSave(save);
    game.active = true;
    input.enabled = true;
    startScreen.hidden = true;
    hud.setVisible(true);
    seedInput.blur();
    sound.start(save.muted);
    lockPointer();
    hud.say(`World "${seed}"`);
  });

  canvas.addEventListener('click', () => {
    if (game.active && !document.pointerLockElement && !tuning.visible && !menu.visible) lockPointer();
  });
  $('menu-button').addEventListener('click', () => game.openPauseMenu());
  menu.onClose = () => {
    if (game.active) lockPointer();
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && menu.visible) menu.close();
  });

  let last = performance.now();
  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); // never try to catch up more than 0.1 s
    last = now;
    const { drive, actions } = input.poll();
    chase.orbit(actions.lookX * 900 * dt, actions.lookY * 600 * dt);
    game.frame(dt, drive, actions);
    scene.renderer.render(scene.scene, chase.camera);
  }
  requestAnimationFrame(frame);

  // Small hook for automated tests and for poking around in the console.
  Object.defineProperty(window, '__game', { get: () => game });
}

main().catch((err) => {
  console.error(err);
  $('start-button').textContent = 'Could not start: ' + (err instanceof Error ? err.message : String(err));
});
