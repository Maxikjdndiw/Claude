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
  const summary = await page.evaluate(() => {
    const s = window.game.state;
    return { day: s.day, cash: Math.round(s.companies[0].cash), buildings: s.buildings.map((b) => [b.type, b.workers, b.status]) };
  });
  console.log(JSON.stringify(summary));
}
