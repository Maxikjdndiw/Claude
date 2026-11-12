// One play session in one world. Owns the simulation objects and the 3D
// objects that show them, and runs the per-frame game rules (pebbles, camps,
// winch targeting, prompts). Created again when the seed changes.
import * as THREE from 'three';
import {
  LONG_4X4_COST, PAINTS, PHYSICS, SURFACES, UPGRADES, VEHICLES, WATER, WINCH, WORLD,
  type VehicleConfig, type VehicleId,
} from '../config';
import type { Sound } from '../audio/sound';
import { BodySync } from '../render/bodySync';
import { CarModel } from '../render/carModel';
import type { ChaseCamera } from '../render/chaseCamera';
import { Particles } from '../render/particles';
import { RopeView } from '../render/rope';
import type { GameScene } from '../render/scene';
import { WorldView } from '../render/worldView';
import type { DriveInput, InputActions } from '../sim/input';
import { PhysicsWorld } from '../sim/physicsWorld';
import { Vehicle } from '../sim/vehicle';
import { Winch } from '../sim/winch';
import { ChunkPhysics } from '../sim/world/chunkPhysics';
import { chunkKey, generateChunkObjects, type Anchor, type ChunkObjects } from '../sim/world/objects';
import { Terrain, campParking, type Feature } from '../sim/world/terrain';
import type { CampMenu, MenuSection } from '../ui/campMenu';
import type { DebugOverlay } from '../ui/debugOverlay';
import type { CompassMark, Hud } from '../ui/hud';
import type { TuningPanel } from '../ui/tuningPanel';
import { storeSave, worldProgress, type SaveData, type WorldProgress } from './save';

export interface GameDeps {
  scene: GameScene;
  chase: ChaseCamera;
  hud: Hud;
  debug: DebugOverlay;
  tuning: TuningPanel;
  menu: CampMenu;
  sound: Sound;
  save: SaveData;
  /** Called when the player chooses "back to the title screen". */
  onQuit: () => void;
}

const CAMP_NAMES = ['Heron', 'Larch', 'Otter', 'Juniper', 'Marten', 'Sorrel', 'Kestrel', 'Bracken', 'Alder', 'Finch', 'Thistle', 'Badger', 'Willow', 'Curlew', 'Rowan', 'Hazel'];
const PEBBLES_IN = { mudPit: 6, knoll: 8, camp: 0 };

/** Shortest way from angle a to angle b. */
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Game {
  /** False while the world is only the moving picture behind the title screen. */
  active = false;
  readonly terrain: Terrain;
  vehicle!: Vehicle;

  private physics = new PhysicsWorld();
  private chunkPhysics: ChunkPhysics;
  private objects = new Map<string, ChunkObjects>();
  private winch!: Winch;
  private winchSettings = { ...WINCH };
  private car!: CarModel;
  private carSync!: BodySync;
  private view: WorldView;
  private rope = new RopeView();
  private particles = new Particles();
  private marker: THREE.Mesh;
  private progress: WorldProgress;
  private collected: Set<string>;

  private accumulator = 0;
  private drive: DriveInput = { throttle: 0, steer: 0, handbrake: true, lowRange: false };
  private safeSpot: { x: number; y: number; z: number; yaw: number };
  private safeTimer = 0;
  private slowTimer = 0; // for things that do not need to run every frame
  private stuckTime = 0;
  private candidate: Anchor | null = null;
  private campHere: Feature | null = null;
  private emitDebt = 0;
  private time = 0;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  constructor(readonly seedText: string, private deps: GameDeps) {
    this.terrain = new Terrain(seedText);
    this.progress = worldProgress(deps.save, seedText);
    this.collected = new Set(this.progress.collected);
    this.chunkPhysics = new ChunkPhysics(this.physics, this.terrain, (cx, cz) => this.objectsOf(cx, cz));
    this.view = new WorldView(this.terrain, (cx, cz) => this.objectsOf(cx, cz), (id) => this.collected.has(id));

    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: 0xffc44d }));
    this.marker.visible = false;
    deps.scene.scene.add(this.view.group, this.rope.group, this.particles.points, this.marker);

    const spawn = this.terrain.spawnPoint();
    const y = this.terrain.height(spawn.x, spawn.z) + 1.3;
    this.safeSpot = { x: spawn.x, y, z: spawn.z, yaw: spawn.yaw };
    this.chunkPhysics.update(spawn.x, spawn.z);
    this.buildVehicle({ x: spawn.x, y, z: spawn.z }, spawn.yaw);
    this.discoverCamp(spawn.camp, false);
    // Build the closest chunks right away so there is ground to see.
    this.view.update(spawn.x, spawn.z, 0, 250);
  }

  // --- world data ----------------------------------------------------------------

  private objectsOf(cx: number, cz: number): ChunkObjects {
    const key = chunkKey(cx, cz);
    let o = this.objects.get(key);
    if (!o) {
      o = generateChunkObjects(this.terrain, cx, cz);
      this.objects.set(key, o);
      if (this.objects.size > 500) this.forgetFarObjects();
    }
    return o;
  }

  private forgetFarObjects(): void {
    const p = this.vehicle.body.translation();
    const pcx = Math.floor(p.x / WORLD.chunkSize);
    const pcz = Math.floor(p.z / WORLD.chunkSize);
    for (const key of this.objects.keys()) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > WORLD.viewRadius + 2 || Math.abs(cz - pcz) > WORLD.viewRadius + 2) this.objects.delete(key);
    }
  }

  // --- vehicle -------------------------------------------------------------------

  /** Creates the car the player chose, with all bought upgrades and paint. */
  private buildVehicle(position: { x: number; y: number; z: number }, yaw: number): void {
    const { save, scene, tuning } = this.deps;
    if (this.vehicle) {
      this.vehicle.dispose();
      this.car.group.removeFromParent();
    }
    const cfg: VehicleConfig = structuredClone(VEHICLES[save.vehicle]);
    this.winchSettings = { ...WINCH };
    for (const u of UPGRADES) if (save.upgrades.includes(u.id)) u.apply(cfg, this.winchSettings);

    const condition = this.vehicle?.condition ?? 1;
    this.vehicle = new Vehicle(this.physics, cfg, position, {
      surfaceAt: (x, y, z, slope, isTerrain) => (isTerrain ? this.terrain.classify(x, z, y, slope).surface : 'rock'),
    });
    this.vehicle.condition = condition;
    this.vehicle.placeAt(position, yaw);
    this.winch = new Winch(this.vehicle.body, this.vehicle.hookLocal, this.winchSettings);

    const paint = PAINTS.find((p) => p.id === save.paint) ?? PAINTS[0];
    this.car = new CarModel(cfg, { body: paint.color, roof: paint.roof });
    scene.scene.add(this.car.group);
    this.carSync = new BodySync(this.vehicle.body, this.car.group);
    tuning.setTarget(cfg, structuredClone(cfg), () => this.vehicle.applyConfig());
  }

  private yaw(): number {
    const f = this.vehicle.forwardDirection();
    return Math.atan2(f.x, f.z);
  }

  /** Moves the car somewhere else (fast travel, recovery). */
  private teleport(x: number, z: number, yaw?: number): void {
    this.winch.release();
    this.chunkPhysics.update(x, z);
    this.vehicle.placeAt({ x, y: this.terrain.height(x, z) + 1.3, z }, yaw);
  }

  private toCamp(camp: Feature): void {
    const spot = campParking(camp);
    this.teleport(spot.x, spot.z, spot.yaw);
  }

  /** T key: flip the car upright where it is, or back to dry, firm ground if it is stuck in water. */
  private recover(): void {
    const p = this.vehicle.body.translation();
    const inDeepWater = this.vehicle.waterDepth > WATER.deepWater * 0.8 || this.terrain.height(p.x, p.z) < -0.7;
    if (inDeepWater) {
      this.teleport(this.safeSpot.x, this.safeSpot.z, this.safeSpot.yaw);
      this.deps.hud.say('Back on dry ground');
    } else {
      this.teleport(p.x, p.z);
    }
  }

  // --- camps, pebbles, winch --------------------------------------------------------

  private campName(f: Feature): string {
    const [, rx, rz] = f.id.split(':').map(Number);
    return CAMP_NAMES[(((rx * 7 + rz * 13) % 16) + 16) % 16] + ' Camp';
  }

  private discoverCamp(f: Feature, announce: boolean): void {
    if (this.progress.camps.includes(f.id)) return;
    this.progress.camps.push(f.id);
    storeSave(this.deps.save);
    if (announce) this.deps.hud.say(`${this.campName(f)} discovered`);
  }

  private campById(id: string): Feature | undefined {
    const [, rx, rz] = id.split(':').map(Number);
    return this.terrain.featuresOfRegion(rx, rz).find((f) => f.id === id);
  }

  private collectPebbles(px: number, py: number, pz: number): void {
    const size = WORLD.chunkSize;
    const pcx = Math.floor(px / size);
    const pcz = Math.floor(pz / size);
    for (let cx = pcx - 1; cx <= pcx + 1; cx++) {
      for (let cz = pcz - 1; cz <= pcz + 1; cz++) {
        for (const p of this.objectsOf(cx, cz).pebbles) {
          if (this.collected.has(p.id)) continue;
          const dx = p.x - px;
          const dz = p.z - pz;
          if (dx * dx + dz * dz > 2.6 * 2.6 || Math.abs(p.y - py) > 3.5) continue;
          this.collected.add(p.id);
          this.progress.collected.push(p.id);
          this.deps.save.pebbles++;
          storeSave(this.deps.save);
          this.view.removePebble(p.id);
          this.deps.sound.ping();
        }
      }
    }
  }

  /** The best tree or post to hook onto: close, and roughly where the camera looks. */
  private findAnchor(): Anchor | null {
    const hook = this.winch.hook;
    const size = WORLD.chunkSize;
    const pcx = Math.floor(hook.x / size);
    const pcz = Math.floor(hook.z / size);
    const look = this.deps.chase.camera.getWorldDirection(this.tmpA);
    const range = this.winchSettings.range;
    let best: Anchor | null = null;
    let bestScore = Infinity;
    const consider = (x: number, y: number, z: number) => {
      const dx = x - hook.x;
      const dz = z - hook.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > range || d < 2 || Math.abs(y - hook.y) > range * 0.7) return;
      // Anchors in the middle of the view win over closer ones off to the side.
      const facing = (dx * look.x + dz * look.z) / d;
      const score = d * (1.7 - facing);
      if (score < bestScore) {
        bestScore = score;
        best = { x, y, z };
      }
    };
    for (let cx = pcx - 1; cx <= pcx + 1; cx++) {
      for (let cz = pcz - 1; cz <= pcz + 1; cz++) {
        const o = this.objectsOf(cx, cz);
        for (const t of o.trees) consider(t.x, t.y + 1.0, t.z);
        for (const p of o.posts) consider(p.x, p.y + 0.9, p.z);
      }
    }
    return best;
  }

  private toggleWinch(): void {
    const { hud, sound } = this.deps;
    if (this.winch.anchor) {
      this.winch.release();
      sound.click();
    } else if (this.candidate) {
      this.winch.attach(this.candidate);
      sound.click();
    } else {
      hud.say('No tree or post in reach of the winch');
    }
  }

  // --- menus ---------------------------------------------------------------------

  private openCampMenu(camp: Feature): void {
    const { save, menu } = this.deps;
    const again = () => this.openCampMenu(camp);
    const commit = () => {
      storeSave(save);
      again();
    };
    const rebuild = () => {
      const p = this.vehicle.body.translation();
      this.winch.release();
      this.buildVehicle({ x: p.x, y: p.y + 0.4, z: p.z }, this.yaw());
      commit();
    };
    const buy = (cost: number, then: () => void) => () => {
      if (save.pebbles < cost) return;
      save.pebbles -= cost;
      then();
    };
    const p = this.vehicle.body.translation();

    const travel = this.progress.camps
      .filter((id) => id !== camp.id)
      .map((id) => this.campById(id))
      .filter((f): f is Feature => !!f)
      .map((f) => ({
        title: this.campName(f),
        detail: `${Math.round(Math.sqrt((f.x - p.x) ** 2 + (f.z - p.z) ** 2))} m away`,
        action: 'Travel',
        onClick: () => {
          this.toCamp(f);
          menu.close();
        },
      }));

    const sections: MenuSection[] = [
      {
        heading: `Workshop · you have ${save.pebbles} pebbles`,
        items: [
          {
            title: 'Repair',
            detail: `Car condition ${Math.round(this.vehicle.condition * 100)}%. Repairs are free.`,
            action: 'Repair',
            disabled: this.vehicle.condition >= 0.995,
            onClick: () => {
              this.vehicle.condition = 1;
              again();
            },
          },
          {
            title: 'Recover vehicle',
            detail: 'Bring the car to this camp, on its wheels.',
            action: 'Recover',
            onClick: () => {
              this.toCamp(camp);
              menu.close();
            },
          },
        ],
      },
      {
        heading: 'Fast travel',
        items: travel.length > 0 ? travel : [{ title: 'No other camps found yet', detail: 'Camps you drive to appear here. Look for the flags.', action: null }],
      },
      {
        heading: 'Vehicles',
        items: (Object.keys(VEHICLES) as VehicleId[]).map((id) => {
          const owned = save.vehicles.includes(id);
          const inUse = save.vehicle === id;
          return {
            title: VEHICLES[id].name,
            detail: id === 'short' ? 'Short wheelbase: agile, turns tightly.' : 'Long wheelbase: heavier, calmer, steadier on slopes.',
            action: inUse ? null : owned ? 'Drive' : `Unlock · ${LONG_4X4_COST}`,
            disabled: !owned && save.pebbles < LONG_4X4_COST,
            onClick: owned
              ? () => { save.vehicle = id; rebuild(); }
              : buy(LONG_4X4_COST, () => { save.vehicles.push(id); save.vehicle = id; rebuild(); }),
          };
        }),
      },
      {
        heading: 'Upgrades',
        items: UPGRADES.map((u) => {
          const owned = save.upgrades.includes(u.id);
          return {
            title: u.name,
            detail: owned ? `${u.description} Installed.` : u.description,
            action: owned ? null : `Buy · ${u.cost}`,
            disabled: save.pebbles < u.cost,
            onClick: buy(u.cost, () => { save.upgrades.push(u.id); rebuild(); }),
          };
        }),
      },
      {
        heading: 'Paint',
        items: PAINTS.map((paint) => {
          const owned = save.paints.includes(paint.id);
          const inUse = save.paint === paint.id;
          return {
            title: paint.name,
            detail: inUse ? 'In use.' : owned ? 'Owned.' : 'Cosmetic.',
            action: inUse ? null : owned ? 'Use' : `Buy · ${paint.cost}`,
            disabled: !owned && save.pebbles < paint.cost,
            onClick: owned
              ? () => { save.paint = paint.id; rebuild(); }
              : buy(paint.cost, () => { save.paints.push(paint.id); save.paint = paint.id; rebuild(); }),
          };
        }),
      },
    ];
    menu.open(this.campName(camp), sections);
  }

  openPauseMenu(): void {
    const { save, menu, sound, onQuit } = this.deps;
    menu.open('Paused', [
      {
        heading: 'World',
        items: [
          { title: `Seed: ${this.seedText}`, detail: `${this.progress.collected.length} pebbles found here · ${this.progress.camps.length} camps discovered`, action: null },
          { title: 'Recover vehicle', detail: 'Put the car back on its wheels (same as the T key).', action: 'Recover', onClick: () => { this.recover(); menu.close(); } },
          {
            title: 'Sound',
            detail: save.muted ? 'Sound is off.' : 'Sound is on.',
            action: save.muted ? 'Turn on' : 'Turn off',
            onClick: () => { save.muted = !save.muted; sound.setMuted(save.muted); storeSave(save); this.openPauseMenu(); },
          },
          { title: 'Title screen', detail: 'Choose another seed. Your progress is kept.', action: 'Leave', onClick: () => { menu.close(); onQuit(); } },
        ],
      },
    ]);
  }

  // --- one frame -------------------------------------------------------------------

  frame(dt: number, drive: DriveInput, actions: InputActions): void {
    const { scene, chase, hud, debug, tuning, menu, sound, save } = this.deps;
    const vehicle = this.vehicle;
    this.time += dt;
    const paused = menu.visible;

    if (this.active && !paused) {
      this.drive = drive;
      if (actions.toggleCamera) chase.toggleMode();
      if (actions.resetVehicle) this.recover();
      if (actions.winch) this.toggleWinch();
      if (actions.camp && this.campHere) this.openCampMenu(this.campHere);
      if (actions.menu) this.openPauseMenu();
      if (actions.toggleMute) {
        save.muted = !save.muted;
        sound.setMuted(save.muted);
        storeSave(save);
        hud.say(save.muted ? 'Sound off' : 'Sound on');
      }
    } else {
      this.drive = { throttle: 0, steer: 0, handbrake: true, lowRange: this.drive.lowRange };
    }
    if (actions.toggleDebug) debug.toggle();
    if (actions.toggleTuning && this.active) tuning.toggle();

    // --- simulation: fixed steps ---
    const before = vehicle.body.translation();
    this.chunkPhysics.update(before.x, before.z);
    let knock = 0;
    if (!paused) {
      this.accumulator += dt;
      while (this.accumulator >= PHYSICS.timestep) {
        vehicle.step(this.drive, PHYSICS.timestep);
        this.winch.step(PHYSICS.timestep, this.active && actions.reelIn, this.active && actions.reelOut);
        this.physics.step();
        this.carSync.read();
        knock = Math.max(knock, vehicle.lastImpact);
        this.accumulator -= PHYSICS.timestep;
      }
    }
    if (knock > 0 && this.active) sound.thud(Math.min(1, knock / 10));

    const p = vehicle.body.translation();
    const speed = vehicle.forwardSpeed;
    // Safety net: never fall out of the world.
    if (p.y < this.terrain.height(p.x, p.z) - 6 || p.y < -30) this.teleport(this.safeSpot.x, this.safeSpot.z, this.safeSpot.yaw);

    // Remember the last firm, dry place, for recovery.
    this.safeTimer += dt;
    if (this.safeTimer > 1) {
      this.safeTimer = 0;
      const firm = vehicle.wheels.every((w) => w.inContact && w.surface !== 'deepMud' && w.waterDepth < 0.3);
      if (firm && vehicle.uprightness() > 0.85) this.safeSpot = { x: p.x, y: p.y, z: p.z, yaw: this.yaw() };
    }

    // --- game rules that are fine at 6 times per second ---
    this.slowTimer += dt;
    if (this.slowTimer > 0.16) {
      this.slowTimer = 0;
      if (this.active) this.collectPebbles(p.x, p.y, p.z);
      this.candidate = this.winch.anchor ? null : this.findAnchor();
      this.campHere = null;
      for (const f of this.terrain.featuresNear(p.x, p.z, 1)) {
        if (f.kind === 'camp' && (f.x - p.x) ** 2 + (f.z - p.z) ** 2 < 17 * 17) {
          this.campHere = f;
          if (this.active) this.discoverCamp(f, true);
        }
      }
      if (this.active) this.updateCompass(p.x, p.z);
    }

    // --- rendering ---
    const alpha = this.accumulator / PHYSICS.timestep;
    this.carSync.apply(paused ? 1 : alpha);
    this.car.updateWheels(vehicle);
    scene.updateSky(dt, actions.fastTime && this.active ? 150 : 1);
    this.car.setHeadlights(scene.darkness);
    if (!this.active) chase.orbit(dt * 14, 0); // slow turn behind the title screen
    chase.update(this.car.group, speed, dt, (x, z) => this.terrain.height(x, z));
    scene.followWithSun(this.car.group.position);
    this.view.update(p.x, p.z, dt, 5);
    this.updateRope();
    this.updateParticles(dt);

    this.marker.visible = this.active && !!this.candidate;
    if (this.candidate) {
      this.marker.position.set(this.candidate.x, this.candidate.y + 0.9 + Math.sin(this.time * 4) * 0.12, this.candidate.z);
      this.marker.rotation.y = this.time * 2;
    }

    // --- sound and HUD ---
    const throttle = Math.abs(this.drive.throttle);
    const mudLevel = Math.min(1, vehicle.mudDrag / SURFACES.deepMud.drag) * Math.min(1, Math.abs(speed) / 3 + vehicle.slippingWheels / 4);
    const reeling = !!this.winch.anchor && (actions.reelIn || actions.reelOut) && this.active;
    sound.update({
      speed: Math.abs(speed),
      throttle: this.active ? throttle : 0,
      mud: this.active ? mudLevel : 0,
      water: this.active ? Math.min(1, vehicle.waterDepth * 2) * Math.min(1, Math.abs(speed) / 4) : 0,
      winching: reeling,
    });

    if (this.active) {
      hud.setDrive(speed * 3.6, vehicle.gear, vehicle.lowRange);
      hud.setStatus(save.pebbles, vehicle.condition);
      hud.setWinch(this.winch.length, this.winch.anchor ? this.winch.tension / this.winchSettings.maxForce : null);
      this.stuckTime = throttle > 0.5 && Math.abs(speed) < 0.4 ? this.stuckTime + dt : 0;
      hud.setPrompt(paused ? '' : this.promptText());
    }

    debug.update(dt, () => {
      const g = this.terrain.ground(p.x, p.z);
      return [
        `seed    ${this.seedText}`,
        `speed   ${(speed * 3.6).toFixed(1)} km/h   gear ${vehicle.gear} ${vehicle.lowRange ? 'LOW' : 'HIGH'}`,
        `pos     ${p.x.toFixed(0)}  ${p.y.toFixed(1)}  ${p.z.toFixed(0)}`,
        `ground  ${g.biome}, ${g.surface}, slope ${(Math.atan(g.slope) * 57.3).toFixed(0)} deg, water ${vehicle.waterDepth.toFixed(2)} m`,
        `rope    ${this.winch.anchor ? `${this.winch.length.toFixed(1)} m, tension ${(this.winch.tension / 1000).toFixed(1)} kN` : 'not attached'}`,
        `car     condition ${(vehicle.condition * 100).toFixed(0)}%, upright ${vehicle.uprightness().toFixed(2)}`,
        `time    ${(scene.timeOfDay * 24).toFixed(1)} h   chunks waiting ${this.view.pending}   camera ${chase.mode}`,
        `wheels`,
        ...vehicle.wheels.map(
          (w, i) =>
            `  ${['FL', 'FR', 'RL', 'RR'][i]}  ${w.inContact ? 'ground' : 'air   '}  ${(w.surface ?? '-').padEnd(8)} spring ${w.suspensionLength.toFixed(2)} m${w.slipping ? '  SLIP' : ''}`,
        ),
      ];
    });
  }

  private promptText(): string {
    const v = this.vehicle;
    if (v.waterDepth > WATER.deepWater) return 'Too deep to drive. T brings you back to dry ground, or use the winch (E)';
    if (v.uprightness() < 0.35 && Math.abs(v.forwardSpeed) < 1) return 'T puts the car back on its wheels';
    if (this.winch.anchor) return 'R reel in · F let out · E release the winch';
    if (this.campHere) return 'G opens the camp' + (this.candidate ? ' · E attaches the winch' : '');
    if (this.stuckTime > 1.5) return this.candidate ? 'Stuck? Try low range (Shift) or attach the winch (E)' : 'Stuck? Try low range (Shift), or T to recover';
    if (this.candidate) return `E attaches the winch (${this.winch.distanceTo(this.candidate).toFixed(0)} m)`;
    return '';
  }

  private updateCompass(px: number, pz: number): void {
    const yaw = this.yaw();
    const marks: CompassMark[] = [
      { relative: angleDelta(yaw, 0), label: 'N', kind: 'north' },
      { relative: angleDelta(yaw, Math.PI / 2), label: 'W', kind: 'north' },
      { relative: angleDelta(yaw, Math.PI), label: 'S', kind: 'north' },
      { relative: angleDelta(yaw, -Math.PI / 2), label: 'E', kind: 'north' },
    ];
    // Nearest camp and nearest challenge spot that still has pebbles.
    let camp: Feature | null = null;
    let spot: Feature | null = null;
    let campD = Infinity;
    let spotD = Infinity;
    for (const f of this.terrain.featuresNear(px, pz, 2)) {
      const d = Math.sqrt((f.x - px) ** 2 + (f.z - pz) ** 2);
      if (f.kind === 'camp') {
        if (d > 20 && d < campD) { camp = f; campD = d; }
      } else if (d < spotD) {
        let left = false;
        for (let i = 0; i < PEBBLES_IN[f.kind]; i++) if (!this.collected.has(`${f.id}:${i}`)) left = true;
        if (left) { spot = f; spotD = d; }
      }
    }
    const mark = (f: Feature, d: number, label: string, kind: 'camp' | 'challenge') =>
      marks.push({ relative: angleDelta(yaw, Math.atan2(f.x - px, f.z - pz)), label: `${label} ${Math.round(d)} m`, kind });
    if (camp) mark(camp, campD, '▲ camp', 'camp');
    if (spot) mark(spot, spotD, spot.kind === 'mudPit' ? '◆ mud pit' : '◆ knoll', 'challenge');
    this.deps.hud.setCompass(marks);
  }

  private updateRope(): void {
    const anchor = this.winch.anchor;
    if (!anchor) {
      this.rope.hide();
      return;
    }
    const h = this.vehicle.hookLocal;
    const from = this.car.group.localToWorld(this.tmpA.set(h.x, h.y, h.z));
    const to = this.tmpB.set(anchor.x, anchor.y, anchor.z);
    const slack = this.winch.length - from.distanceTo(to);
    const ground = this.terrain.height((from.x + to.x) / 2, (from.z + to.z) / 2);
    this.rope.update(from, to, slack, this.winch.tension / this.winchSettings.maxForce, ground);
  }

  /** Mud clods, water spray and dust thrown up by the wheels. */
  private updateParticles(dt: number): void {
    const v = this.vehicle;
    const speed = Math.abs(v.forwardSpeed);
    this.emitDebt = Math.min(4, this.emitDebt + dt * 50);
    const vel = v.body.linvel();
    while (this.emitDebt >= 1) {
      this.emitDebt -= 1;
      const i = Math.floor(Math.random() * 4);
      const w = v.wheels[i];
      if (!w.inContact || !w.surface) continue;
      const mount = v.wheelMounts[i];
      const pos = this.car.group.localToWorld(this.tmpA.set(mount.x, mount.y - w.suspensionLength - v.cfg.wheelRadius * 0.8, mount.z));
      const muddy = w.surface === 'mud' || w.surface === 'deepMud';
      if (w.waterDepth > 0.05 && speed > 1.2) {
        this.particles.emit(pos.x, Math.max(pos.y, 0.05), pos.z, vel.x * 0.3, 2 + speed * 0.25, vel.z * 0.3, 0xd8eef2);
      } else if (muddy && (w.slipping || speed > 1)) {
        this.particles.emit(pos.x, pos.y, pos.z, -vel.x * 0.2, 1.5 + (w.slipping ? 2 : speed * 0.15), -vel.z * 0.2, w.surface === 'mud' ? 0x7a5a3c : 0x553b26);
      } else if (w.surface === 'dirt' && speed > 7 && Math.random() < 0.4) {
        this.particles.emit(pos.x, pos.y, pos.z, 0, 0.6, 0, 0xc2ab85);
      }
    }
    this.particles.update(dt);
  }

  dispose(): void {
    this.view.dispose();
    this.car.group.removeFromParent();
    this.rope.group.removeFromParent();
    this.particles.points.removeFromParent();
    this.marker.removeFromParent();
    this.vehicle.dispose();
    this.physics.dispose();
  }
}
