// Turns dist/index.html (a full HTML document) into dist/artifact.html:
// the same page without the <!doctype>/<html>/<head>/<body> wrapper tags,
// which the artifact host adds by itself when publishing.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const page = html
  .replace(/<!doctype html>/i, '')
  .replace(/<\/?(html|head|body)[^>]*>/gi, '')
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .trimStart();
writeFileSync('dist/artifact.html', page);
console.log(`dist/artifact.html written (${(page.length / 1e6).toFixed(2)} MB)`);
