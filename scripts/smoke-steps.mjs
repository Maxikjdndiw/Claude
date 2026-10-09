// Gameplay steps for the smoke test. Grows with each milestone.
export default async function steps(page, out) {
  await page.evaluate(() => window.game.newGame('42', 'Smoke Test Co'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/02-pick-start.png` });

  // Pick a start location next to the biggest town.
  const ok = await page.evaluate(() => {
    const g = window.game;
    const t = g.world.towns[0];
    return g.debugSelectStart(t.x + 7, t.y + 2);
  });
  if (!ok) throw new Error('could not select a start location');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/03-site-selected.png` });
  await page.evaluate(() => window.game.confirmStart());
  await page.waitForTimeout(800);

  // Build the bread chain through the same code path as mouse placement.
  const built = await page.evaluate(() => {
    const g = window.game;
    g.setSpeed(0);
    const hq = g.state.companies[0].hq;
    const placeNear = (type, cx, cy) => {
      g.startBuild(type);
      for (let r = 0; r < 14; r++)
        for (let oy = -r; oy <= r; oy++)
          for (let ox = -r; ox <= r; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
            g.updatePlacement(cx + ox + 0.5, cy + oy + 0.5);
            if (g.ui.state.placement?.ok && g.tryBuild()) return true;
          }
      g.cancelBuild();
      return false;
    };
    return [placeNear('farm', hq.x + 4, hq.y), placeNear('mill', hq.x, hq.y + 4)];
  });
  if (!built.every(Boolean)) throw new Error('could not place buildings: ' + JSON.stringify(built));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/04-building.png` });

  // Road from the mill to the town, then a truck line to the second town.
  const lineOk = await page.evaluate(() => {
    const g = window.game;
    const s = g.state;
    const size = g.world.size;
    const mill = s.buildings.find((b) => b.type === 'mill');
    const t0 = s.towns[0];
    g.setTool('road');
    g['roadClick'](mill.y * size + mill.x);
    g['roadClick'](t0.y * size + t0.x);
    g.setTool('line');
    g['lineClick'](mill.x, mill.y);
    const t1 = s.towns.slice(1).sort((a, b) => Math.hypot(a.x - t0.x, a.y - t0.y) - Math.hypot(b.x - t0.x, b.y - t0.y))[0];
    g['lineClick'](t1.x, t1.y);
    return !!g.ui.state.lineDraft;
  });
  if (!lineOk) throw new Error('line dialog did not open');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/04b-line-dialog.png` });
  await page.evaluate(() => {
    const g = window.game;
    const d = g.ui.state.lineDraft;
    g.run((sim) => window.__tr.createLine(sim, 0, d.from, d.to, 'flour', 2));
    g.closeLineDraft();
  });

  // Let time pass, then inspect.
  await page.evaluate(() => window.game.advance(75));
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const g = window.game;
    const mill = g.state.buildings.find((b) => b.type === 'mill');
    g.focusBuilding(mill.id);
    g.setLeftPanel('finance');
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/05-running.png` });

  await page.evaluate(() => {
    const g = window.game;
    g.setLeftPanel('finance');
    g.selectTown(0);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/06-town.png` });
  // Close-up of a truck on the road.
  await page.evaluate(() => {
    const g = window.game;
    g.selectTown(null);
    const l = g.state.lines[0];
    const v = l.vehicles[0];
    const size = g.world.size;
    const c = l.path[Math.min(l.path.length - 1, Math.round(v.pos))];
    g.view.rig.focus((c % size) + 0.5, Math.floor(c / size) + 0.5, 16, true);
    g.view.rig.setView(0.8, 0.6, 16, true);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/07-truck.png` });
  // Milestone 4: research panel, a mine digging a pit, rail + ship lines.
  await page.evaluate(() => {
    const g = window.game;
    const { commands, tech } = window.__dbg;
    const s = g.state;
    s.companies[0].cash = 3e6;
    tech.buyLicense(s, 0, 'shipping');
    tech.buyLicense(s, 0, 'steam');
    tech.buyLicense(s, 0, 'railways');
    // Debug: a second office next to an iron deposit so the mine is in build range.
    const dep = s.deposits.find((d) => d.resource === 'iron' && !d.hidden);
    const tryPlace = (type, x, y, r) => {
      for (let d = 0; d < r; d++)
        for (let oy = -d; oy <= d; oy++)
          for (let ox = -d; ox <= d; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== d) continue;
            const res = commands.build(g.sim, 0, type, x + ox, y + oy);
            if (res.ok) return res.building;
          }
      return null;
    };
    tryPlace('hq', dep.x + 6, dep.y + 3, 8);
    const mine = tryPlace('iron_mine', dep.x + 3, dep.y, 8);
    if (mine) {
      mine.town = 0;
      mine.buildLeft = 1;
    }
    window.__mineDep = dep;
    g.setLeftPanel('research');
    g.afterChange();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/08-research.png` });
  await page.evaluate(() => {
    const g = window.game;
    const mine = g.state.buildings.find((b) => b.type === 'iron_mine');
    if (mine) {
      mine.workers = mine.targetWorkers = 24;
    }
    // Pretend most of the deposit has been mined to see a deep pit.
    const dep0 = window.__mineDep;
    dep0.amount = dep0.initial * 0.35;
    g.advance(30);
    g.setLeftPanel('research');
    const dep = window.__mineDep;
    g.view.rig.focus(dep.x + 0.5, dep.y + 0.5, 24, true);
    g.view.rig.setView(0.9, 0.75, 24, true);
    if (g.ui.state.showResources) g.toggleResources();
    if (mine) g.selectBuilding(mine.id);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/09-mine-pit.png` });
  // Milestone 5: competitors after a while.
  await page.evaluate(() => {
    const g = window.game;
    g.advance(300);
    g.selectBuilding(null);
    g.setLeftPanel('rivals');
    const bot = g.state.buildings.find((b) => b.owner > 0 && b.type !== 'hq');
    if (bot) g.focusBuilding(bot.id);
    g.view.rig.setView(0.7, 0.9, 40, true);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/10-rivals.png` });
  // Milestone 6: bank, stocks, economy panels.
  await page.evaluate(() => {
    const g = window.game;
    g.selectBuilding(null);
    g.setLeftPanel('bank');
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/11-bank.png` });
  await page.evaluate(() => {
    const g = window.game;
    g.advance(400);
    g.setLeftPanel('stocks');
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/12-stocks.png` });
  await page.evaluate(() => window.game.setLeftPanel('economy'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/13-economy.png` });
  // Milestone 7: charts and glossary (and a lesson card).
  await page.evaluate(() => window.game.setLeftPanel('charts'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/14-charts.png` });
  await page.evaluate(() => window.game.setLeftPanel('learn'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/15-glossary.png` });
  // Milestone 8: save, load, pause menu, scenarios, tutorial.
  const loaded = await page.evaluate(() => {
    const g = window.game;
    g.setLeftPanel(null);
    const before = { day: g.state.day, cash: Math.round(g.state.companies[0].cash), buildings: g.state.buildings.length };
    g.saveTo('1');
    const ok = g.loadFrom('1');
    const after = { day: g.state.day, cash: Math.round(g.state.companies[0].cash), buildings: g.state.buildings.length };
    return { ok, same: JSON.stringify(before) === JSON.stringify(after), before, after };
  });
  if (!loaded.ok || !loaded.same) throw new Error('save/load mismatch ' + JSON.stringify(loaded));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/16-loaded.png` });
  await page.evaluate(() => window.game.setMenu(true));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/17-pause-menu.png` });
  const summary = await page.evaluate(() => {
    const s = window.game.state;
    return { day: s.day, cash: Math.round(s.companies[0].cash), buildings: s.buildings.filter((b) => b.owner === 0).map((b) => [b.type, b.workers, b.status]), rivals: s.companies.map((c) => [c.name, Math.round(c.cash), s.buildings.filter((b) => b.owner === c.id).length, c.bankrupt]), lines: s.lines.map((l) => [l.status, l.length, l.last]), learned: Object.keys(s.learning.seen), mineDep: window.__mineDep && [window.__mineDep.amount, window.__mineDep.initial, window.__mineDep.pitDepth, window.__mineDep.pitBase, window.game.world.heights[window.__mineDep.y * window.game.world.n + window.__mineDep.x], window.game.view.terrain.world === window.game.sim.world, Object.keys(s.terrainEdits).length, window.__mineDep.x, window.__mineDep.y, (() => { const d = window.__mineDep; let best = 99; for (const m of window.game.view.terrain.meshes) { const p = m.geometry.attributes.position.array; for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i] - d.x) < 1 && Math.abs(p[i + 2] - d.y) < 1) best = Math.min(best, p[i + 1]); } return best; })(), Array.from(window.game.view.terrain.dug).filter(Boolean).length] };
  });
  console.log(JSON.stringify(summary));

  await page.evaluate(() => window.game.backToMenu());
  await page.waitForTimeout(1200);
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.includes('Scenarios')).click());
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/18-scenarios.png` });
  await page.evaluate(() => window.game.newGame('', 'Scenario Co', 'normal', 'storm'));
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const g = window.game;
    g.debugSelectStart(g.world.towns[0].x + 6, g.world.towns[0].y + 3);
    g.confirmStart();
    g.advance(40);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/19-scenario.png` });
  await page.evaluate(() => {
    const g = window.game;
    g.backToMenu();
    g.startTutorial('Tutorial Co');
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/20-tutorial.png` });
}
