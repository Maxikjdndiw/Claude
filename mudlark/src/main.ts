// Entry point: wires simulation, rendering and UI together.
// Simulation (src/sim) knows nothing about rendering (src/render) or the page.
import * as THREE from 'three';
import './style.css';
import { PHYSICS, SHORT_4X4 } from './config';
import { BodySync } from './render/bodySync';
import { CarModel } from './render/carModel';
import { ChaseCamera } from './render/chaseCamera';
import { GameScene } from './render/scene';
import { Input } from './sim/input';
import { PhysicsWorld } from './sim/physicsWorld';
import { buildTestCourse, GROUND_HALF_SIZE } from './sim/testCourse';
import { Vehicle } from './sim/vehicle';
import { DebugOverlay } from './ui/debugOverlay';

const $ = (id: string) => document.getElementById(id)!;

async function main(): Promise<void> {
  const canvas = $('game') as HTMLCanvasElement;
  const startScreen = $('start-screen');
  const startButton = $('start-button') as HTMLButtonElement;

  await PhysicsWorld.load();

  // --- simulation ------------------------------------------------------------
  const physics = new PhysicsWorld();
  physics.addStaticBox(
    { x: GROUND_HALF_SIZE, y: 1, z: GROUND_HALF_SIZE },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
    'grass',
  );
  const vehicle = new Vehicle(physics, SHORT_4X4, { x: 0, y: 1.2, z: 0 });
  const input = new Input();

  // --- rendering -------------------------------------------------------------
  const game = new GameScene(canvas);
  const chase = new ChaseCamera(canvas);
  const car = new CarModel(SHORT_4X4);
  game.scene.add(car.group);
  const synced: BodySync[] = [new BodySync(vehicle.body, car.group)];
  const carSync = synced[0];

  for (const box of buildTestCourse()) {
    const mesh = game.addBox(box);
    if (box.mass) {
      synced.push(new BodySync(physics.addDynamicBox(box.halfExtents, box.position, box.mass), mesh));
    } else {
      physics.addStaticBox(box.halfExtents, box.position, box.rotation, box.surface);
    }
  }

  // --- UI ----------------------------------------------------------------------
  const debug = new DebugOverlay($('debug'));
  const hudSpeed = $('hud-speed');
  const hudGear = $('hud-gear');
  const hudRange = $('hud-range');

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    game.resize(w, h);
    chase.resize(w, h);
  };
  window.addEventListener('resize', resize);
  resize();

  startButton.disabled = false;
  startButton.textContent = 'Click to start';
  startButton.addEventListener('click', () => {
    startScreen.hidden = true;
    $('hud').hidden = false;
    $('hint').hidden = false;
    input.enabled = true;
    // Capturing the mouse is optional; without it you orbit by dragging.
    try {
      const lock = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      lock?.catch?.(() => {});
    } catch {
      /* not available here */
    }
  });
  canvas.addEventListener('click', () => {
    if (input.enabled && !document.pointerLockElement) {
      try {
        (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
      } catch {
        /* ignore */
      }
    }
  });

  // --- main loop: fixed physics steps, one render per screen refresh ----------
  let last = performance.now();
  let accumulator = 0;
  let drive = input.poll().drive;

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); // never try to catch up more than 0.1 s
    last = now;

    const polled = input.poll();
    drive = polled.drive;
    if (polled.actions.toggleDebug) debug.toggle();
    if (polled.actions.toggleCamera) chase.toggleMode();
    if (polled.actions.resetVehicle && input.enabled) vehicle.reset();
    chase.orbit(polled.actions.lookX * 900 * dt, polled.actions.lookY * 600 * dt);

    accumulator += dt;
    while (accumulator >= PHYSICS.timestep) {
      vehicle.step(drive, PHYSICS.timestep);
      physics.step();
      for (const s of synced) s.read();
      accumulator -= PHYSICS.timestep;
    }

    const alpha = accumulator / PHYSICS.timestep;
    for (const s of synced) s.apply(alpha);
    car.updateWheels(vehicle);
    carSync.apply(alpha);
    chase.update(car.group, vehicle.forwardSpeed, dt);
    game.followWithSun(car.group.position);

    hudSpeed.textContent = Math.abs(vehicle.forwardSpeed * 3.6).toFixed(0);
    hudGear.textContent = vehicle.gear;
    hudRange.textContent = vehicle.lowRange ? 'LOW' : 'HIGH';
    hudRange.classList.toggle('is-low', vehicle.lowRange);
    debug.update(dt, vehicle, 'none yet (flat test ground)', chase.mode);

    game.renderer.render(game.scene, chase.camera);
  }
  requestAnimationFrame(frame);

  // Small hook for automated tests and for poking around in the console.
  (window as unknown as Record<string, unknown>).__game = { vehicle, physics, THREE };
}

main().catch((err) => {
  console.error(err);
  $('start-button').textContent = 'Could not start: ' + (err instanceof Error ? err.message : String(err));
});
