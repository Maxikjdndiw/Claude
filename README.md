# Tycoon Isles

A single-player, low-poly 3D economy simulation that teaches real economics.
Built with TypeScript, Vite, Three.js, Preact and uPlot.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm run build` (type-check + bundle), `npm test` (unit tests for the simulation),
`npm run smoke` (headless browser run through the main flow; needs `npm run build` first; writes `./screenshots`).

## Controls

Left-drag pan · right-drag (or Shift+drag) rotate · wheel zoom · WASD / arrows pan · Q/E rotate · R/F zoom.

## Code layout

- `src/data/` – content as config (biomes, resources, goods, buildings, technologies, ...)
- `src/sim/` – deterministic simulation (no DOM / Three.js). `world/` generates the map from a seed.
- `src/render/` – Three.js view: terrain, water, props, towns, overlays, camera.
- `src/ui/` – Preact UI (menus, panels, charts).
- `src/game.ts` – connects simulation, renderer and UI.
