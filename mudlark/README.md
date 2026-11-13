# Mudlark

A slow, cozy low-poly off-road exploration game for the browser. No timers, no racing.
Three.js for rendering, Rapier (WASM) for physics, Vite + TypeScript.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/index.html = the whole game in one file
```

`npm run build` also writes `dist/artifact.html`, the same page without the outer
`<html>` wrapper, for publishing as a single-file artifact.

## Layout

| Folder | What lives there |
|---|---|
| `src/config.ts` | Every tuning value: car, surfaces, world generation, winch, water, damage, upgrades, sky |
| `src/sim/` | Simulation only, no rendering: seeded RNG and noise, terrain, features, chunk physics, vehicle, winch, input |
| `src/render/` | Three.js only: sky, water, terrain chunks with level of detail, painted textures, instanced trees and grass, car model, rope, particles, camera, screen effects |
| `src/game/` | One play session: game rules (pebbles, camps, winch targeting, menus) and the save file |
| `src/ui/` | HUD, camp and pause menu, tuning panel, debug overlay |
| `src/audio/` | Generated engine, mud, water and winch sounds and background notes |
| `src/net/` | Network data types (multiplayer comes in phase 8) |

The world is a pure function of the seed text (`src/sim/world/terrain.ts`). Nothing in
`src/sim` uses `Math.random`, and world generation avoids `sin`/`cos`, so every machine
builds the same world.

## Phases

1. **Done:** project setup, flat test ground, one drivable car
2. **Done:** driving feel, traction limit, live tuning panel (F2)
3. **Done:** seeded noise terrain with streamed chunks and level of detail
4. **Done:** surfaces (grass, dirt, mud, deep mud, rock, wet rock) with grip and drag
5. **Done:** winch with rope, trees and posts as anchors
6. **Done:** rivers and fords, rocks, challenge spots (mud pits, knolls), camps, day and night, sound
7. **Done:** second vehicle, pebbles, upgrades and paint
8. Multiplayer
