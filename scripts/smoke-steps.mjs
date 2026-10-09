// Gameplay steps for the smoke test. Grows with each milestone.
export default async function steps(page, out) {
  // Start a new game on a fixed seed.
  await page.evaluate(() => window.game.newGame('42', 'Smoke Test Co'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/02-pick-start.png` });

  // Pick a start location next to the first town via the same code path as a click.
  const ok = await page.evaluate(() => {
    const g = window.game;
    const t = g.world.towns[0];
    return g.debugSelectStart(t.x + 6, t.y + 4);
  });
  if (!ok) throw new Error('could not select a start location');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/03-site-selected.png` });

  await page.evaluate(() => window.game.confirmStart());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/04-playing.png` });
}
