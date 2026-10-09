// Headless smoke test: builds nothing, expects `npm run build` first.
// Starts `vite preview`, drives the game through its main flow, fails on any
// console error and writes screenshots to ./screenshots.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4179;
const out = 'screenshots';
mkdirSync(out, { recursive: true });

const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server did not start')), 20000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(PORT))) {
      clearTimeout(t);
      resolve();
    }
  });
});

const errors = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.game?.world);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/01-menu.png` });

  const steps = (await import(`./smoke-steps.mjs?${Date.now()}`)).default;
  await steps(page, out);
} finally {
  await browser.close();
  server.kill();
}

if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('Smoke test passed. Screenshots in ./' + out);
process.exit(0);
