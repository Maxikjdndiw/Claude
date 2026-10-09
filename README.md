# Tycoon Isles

A single-player, low-poly 3D economy simulation that teaches real economics.
Build a company on a procedurally generated island, run production chains, ship goods
by truck, train and ship, compete with AI companies, borrow, go public and take over rivals,
while the game explains the economics behind what just happened, using your own numbers.

Built with TypeScript, Vite, Three.js, Preact and uPlot.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run build` | Type-check and bundle to `dist/` (static files, host anywhere) |
| `npm test` | Unit tests of the simulation (markets, production, transport, AI, banking, save/load determinism) |
| `npm run smoke` | Headless browser run through the whole game (needs `npm run build` first); screenshots go to `./screenshots` |

## How to play

1. **Main menu**: free play (pick a seed and the number of rivals), a scenario, the tutorial, or continue/load a save.
2. **Pick a start location**: hover to compare sites (soil, forest, fish, deposits, towns), click, then found your company.
3. **Build** from the dock (Food, Forestry, Mining, Industry, Logistics). Buildings must be within reach of your HQ or other buildings.
4. **Workers & wages**: click a building. Hire while the marginal worker adds more than his wage; pay at least the market wage.
5. **Sell**: goods sell automatically to towns within 12 km. Farther away: build a 🛣 road (or 🛤 rail), then a 🚚 line.
6. **Grow**: research technology, borrow from the 🏦 bank, list your company on the 📊 stock exchange, buy rivals.

Controls: left-drag pan · right-drag (or Shift+drag) rotate · wheel zoom · WASD / arrows pan · Q/E rotate · R/F zoom ·
Space pause · 1/2/3 speed · Esc cancel / menu.

## What is simulated

- **World**: seeded heightmap with ocean, rivers (flow accumulation), lakes (priority flood), biomes, deposits (some hidden), forests, fish, towns and country roads.
- **Markets**: every town is a market for every good. Price follows stock pressure on a constant-elasticity demand curve, with outside supply, an import ceiling and an export floor. Your deliveries move prices.
- **Production**: Cobb-Douglas output with diminishing returns to labor, site quality, training, technology, upgrades (economies of scale), finite deposits with open pits dug into the terrain, renewable forests and fish with logistic regrowth.
- **Labor**: town labor pools, market wages driven by unemployment, hiring, quitting and minimum wage.
- **Logistics**: A* roads and railways, sea routes, trucks, trains and ships with capacity, speed, fuel-linked running costs and depreciation.
- **Accounting**: accrual ledger, income statement (contribution margin, operating and net profit), cash flow statement, balance sheet, per-building profit with transfer pricing.
- **Macro**: business cycle, inflation and price level, a Taylor-rule central bank, data-driven random events (recessions, oil shocks, regulation, disasters, discoveries…).
- **Finance**: credit ratings, fixed and variable annuity loans, IPO, share prices from fundamentals and sentiment, dividends, issues, buybacks, takeovers, losing control of your company.
- **AI rivals**: aggressive, cautious or specialist bots on easy, normal or hard. They use the same commands as you and react to the same prices.
- **Learning**: 42 concepts explained once each when they matter, with live examples; a glossary; charts.
- **Game modes**: 5 scenarios, 22 achievements, a tutorial, save slots and monthly autosave.

## Adding content

Everything is data-driven; the engine does not need to change.

| File | Add… |
|---|---|
| `src/data/goods.ts` | goods (price, demand per capita, elasticities) |
| `src/data/buildings.ts` | buildings (recipe, workers, site requirement, low-poly model made of primitives) |
| `src/data/techs.ts` | technologies and their effects |
| `src/data/transport.ts` | vehicles and infrastructure costs |
| `src/data/events.ts` | random events and their effects |
| `src/data/concepts.ts` | economics concepts for the learning layer |
| `src/data/scenarios.ts`, `achievements.ts` | challenges and achievements |
| `src/data/resources.ts`, `biomes.ts` | resources and terrain types |

## Code layout

- `src/data/`: content as config.
- `src/sim/`: deterministic simulation (no DOM / Three.js). `sim.ts` runs the daily systems in order; `commands.ts` holds the player/AI actions; `world/` generates the map.
- `src/render/`: Three.js view (terrain, water, props, towns, roads, buildings, vehicles, overlays, camera).
- `src/ui/`: Preact UI (menus, panels, charts).
- `src/game.ts`: connects simulation, renderer and UI. `src/save.ts`: localStorage saves.
