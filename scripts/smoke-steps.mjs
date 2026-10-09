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
  const summary = await page.evaluate(() => {
    const s = window.game.state;
    return { day: s.day, cash: Math.round(s.companies[0].cash), buildings: s.buildings.map((b) => [b.type, b.workers, b.status]), lines: s.lines.map((l) => [l.status, l.length, l.vehicles, l.last, l.from, l.to]) };
  });
  console.log(JSON.stringify(summary));
}
