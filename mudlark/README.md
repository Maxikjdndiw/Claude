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
| `src/config.ts` | Every tuning value (springs, grip, engine, brakes, camera) |
| `src/sim/` | Simulation only: physics world, vehicle, input, test course. No rendering. |
| `src/render/` | Three.js only: scene, car model, camera |
| `src/ui/` | Debug overlay |
| `src/net/` | Network data types (multiplayer comes in phase 8) |

## Phases

1. **Done:** project setup, flat test ground, one drivable car
2. Tune driving feel
3. Seeded noise terrain with chunks
4. Surfaces with different grip
5. Winch and trees
6. Water, obstacles, challenge spots, camps
7. Second vehicle, upgrades
8. Multiplayer
