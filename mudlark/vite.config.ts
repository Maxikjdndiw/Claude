import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The whole game (code, three.js, Rapier + its embedded WASM) is inlined into
// one dist/index.html, so the same build runs from a web server, from a file,
// or as a published single-file artifact.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2022', chunkSizeWarningLimit: 8000 },
});
