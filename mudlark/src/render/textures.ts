// Every texture is painted in code on a canvas when the game starts: no image
// files. The paintings are light grey-ish; the real colour comes from the
// vertex or instance colour they are multiplied with.
import * as THREE from 'three';

/** A small repeatable random generator for painting (not used by the simulation). */
function painter(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 8) / 16777216;
  };
}

const grey = (v: number, a = 1) => `rgba(${Math.round(v)},${Math.round(v)},${Math.round(v * 0.96)},${a})`;

/** Where each kind of surface sits in the foliage atlas (v from, v to). */
export const ATLAS = {
  needle: [0.505, 0.995] as const,
  leaf: [0.13, 0.495] as const,
  bark: [0.008, 0.115] as const,
};

/**
 * One texture for all trees:
 *  - top half: hanging conifer branches with a ragged, see-through lower edge
 *  - middle: a mass of leaves with gaps
 *  - bottom strip: bark
 * It repeats sideways.
 */
export function makeFoliageAtlas(): THREE.Texture {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const rnd = painter(777);
  /** Draws something three times so it wraps around the left and right edge. */
  const wrapped = (draw: (dx: number) => void) => {
    for (const dx of [-S, 0, S]) draw(dx);
  };

  // --- conifer branches: canvas y 0 (top of a tier) .. 256 (hanging tips) ---
  const shade = ctx.createLinearGradient(0, 0, 0, 120);
  shade.addColorStop(0, grey(120));
  shade.addColorStop(1, grey(185));
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, S, 96);
  ctx.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const x = rnd() * S;
    const y0 = 20 + rnd() * 110;
    const len = 70 + rnd() * 75;
    const sway = (rnd() - 0.5) * 40;
    const light = 150 + rnd() * 105;
    wrapped((dx) => {
      // The twig, then needles left and right of it, shorter towards the tip.
      const steps = 16;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const px = x + dx + sway * t * t;
        const py = y0 + len * t;
        if (py > 254) break;
        const needle = (11 - 8 * t) * (0.8 + rnd() * 0.4);
        ctx.strokeStyle = grey(light * (0.75 + 0.25 * t));
        ctx.lineWidth = 2.2 - t;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + side * needle, Math.min(254, py + needle * 0.9));
          ctx.stroke();
        }
      }
    });
  }

  // --- leaves: canvas y 258 .. 446 ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 258, S, 188);
  ctx.clip();
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * S;
    const y = 258 + rnd() * 188;
    const r = 5 + rnd() * 6;
    const turn = rnd() * Math.PI;
    const light = 120 + rnd() * 135;
    wrapped((dx) => {
      ctx.fillStyle = grey(light);
      ctx.beginPath();
      ctx.ellipse(x + dx, y, r, r * 0.55, turn, 0, Math.PI * 2);
      ctx.fill();
      // A darker vein gives each leaf a little form.
      ctx.strokeStyle = grey(light * 0.75, 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + dx - Math.cos(turn) * r, y - Math.sin(turn) * r);
      ctx.lineTo(x + dx + Math.cos(turn) * r, y + Math.sin(turn) * r);
      ctx.stroke();
    });
  }
  ctx.restore();

  // --- bark: canvas y 448 .. 512, fully opaque ---
  ctx.fillStyle = grey(190);
  ctx.fillRect(0, 448, S, 64);
  for (let i = 0; i < 220; i++) {
    const x = rnd() * S;
    ctx.strokeStyle = grey(110 + rnd() * 130, 0.7);
    ctx.lineWidth = 1 + rnd() * 3;
    ctx.beginPath();
    ctx.moveTo(x, 448 + rnd() * 30);
    ctx.lineTo(x + (rnd() - 0.5) * 6, 512);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A clump of grass blades seen from the side, with a see-through background. */
export function makeGrassTexture(): THREE.Texture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const rnd = painter(4242);
  for (let i = 0; i < 70; i++) {
    const baseX = 40 + rnd() * 176;
    const height = 110 + rnd() * 140;
    const lean = (rnd() - 0.5) * 120 + (baseX - 128) * 0.5;
    const width = 3 + rnd() * 3.5;
    const light = 150 + rnd() * 105;
    const tipX = baseX + lean;
    const tipY = S - height;
    const fill = ctx.createLinearGradient(0, S, 0, tipY);
    fill.addColorStop(0, grey(light * 0.55));
    fill.addColorStop(0.5, grey(light * 0.9));
    fill.addColorStop(1, grey(Math.min(255, light * 1.1)));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(baseX - width, S);
    ctx.quadraticCurveTo(baseX - width + lean * 0.15, S - height * 0.6, tipX, tipY);
    ctx.quadraticCurveTo(baseX + width + lean * 0.15, S - height * 0.6, baseX + width, S);
    ctx.fill();
    // Some stalks carry a seed head.
    if (rnd() < 0.25) {
      ctx.fillStyle = grey(240);
      ctx.beginPath();
      ctx.ellipse(tipX, tipY + 6, 3, 9, lean * 0.004, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Ground detail: a grey grain texture and a matching bump ("normal") map,
 * both tileable. The bump map makes sunlight catch on small lumps.
 */
export function makeGroundTextures(): { detail: THREE.Texture; normal: THREE.Texture } {
  const S = 256;
  const rnd = painter(12345);
  // Value noise on a wrapping grid, so the texture repeats without seams.
  const layer = (cells: number) => {
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    return (x: number, y: number) => {
      const gx = (x / S) * cells;
      const gy = (y / S) * cells;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      let fx = gx - x0;
      let fy = gy - y0;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      const at = (i: number, j: number) => grid[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
      return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
    };
  };
  const coarse = layer(5);
  const medium = layer(20);
  const fine = layer(72);
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) height[y * S + x] = coarse(x, y) * 0.4 + medium(x, y) * 0.35 + fine(x, y) * 0.2 + rnd() * 0.05;
  }

  const paint = (pixel: (x: number, y: number, out: Uint8ClampedArray, i: number) => void, colorSpace: THREE.ColorSpace) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        pixel(x, y, image.data, i);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = colorSpace;
    tex.anisotropy = 4;
    return tex;
  };
  const h = (x: number, y: number) => height[((y + S) % S) * S + ((x + S) % S)];
  const detail = paint((x, y, out, i) => {
    out[i] = out[i + 1] = out[i + 2] = Math.min(255, (0.6 + h(x, y) * 0.42) * 255);
  }, THREE.SRGBColorSpace);
  const normal = paint((x, y, out, i) => {
    const dx = (h(x + 1, y) - h(x - 1, y)) * 3.2;
    const dy = (h(x, y + 1) - h(x, y - 1)) * 3.2;
    const len = Math.sqrt(dx * dx + dy * dy + 1);
    out[i] = (-dx / len * 0.5 + 0.5) * 255;
    out[i + 1] = (dy / len * 0.5 + 0.5) * 255;
    out[i + 2] = (1 / len * 0.5 + 0.5) * 255;
  }, THREE.NoColorSpace);
  return { detail, normal };
}
