import * as THREE from 'three';
import { FloorMaterialType } from '../types/floorplan';

function makeCanvas(size = 512): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function finalizeTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function createWoodPlankTexture(
  baseRgb: [number, number, number],
  grainRgb: [number, number, number],
  seamColor: string,
  seed: number
): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);
  const rand = seededRandom(seed);

  const planks = 8;
  const plankH = size / planks;

  for (let p = 0; p < planks; p++) {
    const y0 = p * plankH;
    const offset = Math.floor(rand() * size * 0.7) + 40;
    const segments = [
      { x: 0, w: offset },
      { x: offset, w: size - offset },
    ];

    for (const seg of segments) {
      const toneShift = (rand() - 0.5) * 18;
      const r = Math.max(0, Math.min(255, Math.round(baseRgb[0] + toneShift)));
      const g = Math.max(0, Math.min(255, Math.round(baseRgb[1] + toneShift * 0.85)));
      const b = Math.max(0, Math.min(255, Math.round(baseRgb[2] + toneShift * 0.7)));

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(seg.x, y0, seg.w, plankH);

      // Fine wood grain streaks
      for (let i = 0; i < 28; i++) {
        const gy = y0 + rand() * plankH;
        const alpha = 0.03 + rand() * 0.065;
        ctx.strokeStyle = `rgba(${grainRgb[0]},${grainRgb[1]},${grainRgb[2]},${alpha})`;
        ctx.lineWidth = 0.6 + rand() * 1.4;
        ctx.beginPath();
        ctx.moveTo(seg.x, gy);
        const midY = gy + (rand() - 0.5) * 3.5;
        ctx.quadraticCurveTo(seg.x + seg.w * 0.5, midY, seg.x + seg.w, gy + (rand() - 0.5) * 2);
        ctx.stroke();
      }
    }

    // Horizontal plank bevel seam
    ctx.strokeStyle = seamColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(size, y0);
    ctx.stroke();

    // Vertical butt joint
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(offset, y0);
    ctx.lineTo(offset, y0 + plankH);
    ctx.stroke();
  }

  return finalizeTexture(canvas, 0.55, 0.55);
}

function createTravertineTexture(): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);
  const rand = seededRandom(402);

  ctx.fillStyle = '#EAE3D6';
  ctx.fillRect(0, 0, size, size);

  const tiles = 3;
  const step = size / tiles;

  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const x0 = tx * step;
      const y0 = ty * step;
      const delta = (rand() - 0.5) * 10;
      ctx.fillStyle = `rgb(${234 + delta},${227 + delta},${214 + delta})`;
      ctx.fillRect(x0, y0, step, step);

      // Subtle mineral veining
      for (let v = 0; v < 18; v++) {
        const vy = y0 + rand() * step;
        ctx.strokeStyle = `rgba(186, 174, 155, ${0.05 + rand() * 0.08})`;
        ctx.lineWidth = 1 + rand() * 3;
        ctx.beginPath();
        ctx.moveTo(x0, vy);
        ctx.bezierCurveTo(
          x0 + step * 0.35,
          vy + (rand() - 0.5) * 10,
          x0 + step * 0.7,
          vy + (rand() - 0.5) * 10,
          x0 + step,
          vy + (rand() - 0.5) * 6
        );
        ctx.stroke();
      }
    }
  }

  // Hairline limestone grout
  ctx.strokeStyle = 'rgba(165, 156, 141, 0.45)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= tiles; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  return finalizeTexture(canvas, 0.5, 0.5);
}

function createSpaTileTexture(): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);
  const rand = seededRandom(777);

  ctx.fillStyle = '#DFE3E2';
  ctx.fillRect(0, 0, size, size);

  const tiles = 4;
  const step = size / tiles;
  for (let r = 0; r < tiles; r++) {
    for (let c = 0; c < tiles; c++) {
      const d = (rand() - 0.5) * 8;
      ctx.fillStyle = `rgb(${223 + d},${228 + d},${227 + d})`;
      ctx.fillRect(c * step + 1, r * step + 1, step - 2, step - 2);
    }
  }

  ctx.strokeStyle = 'rgba(155, 164, 163, 0.55)';
  ctx.lineWidth = 2.2;
  for (let i = 0; i <= tiles; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  return finalizeTexture(canvas, 0.65, 0.65);
}

function createTatamiTexture(): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);
  const rand = seededRandom(909);

  ctx.fillStyle = '#D8CFA8';
  ctx.fillRect(0, 0, size, size);

  // Fine rush-grass horizontal weave
  for (let y = 0; y < size; y += 2) {
    const a = 0.05 + rand() * 0.08;
    ctx.fillStyle = y % 4 === 0 ? `rgba(176, 168, 120, ${a})` : `rgba(235, 229, 194, ${a})`;
    ctx.fillRect(0, y, size, 1.5);
  }

  // Subtle dark olive-charcoal tatami heri borders
  ctx.strokeStyle = 'rgba(72, 78, 62, 0.58)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, size - 8, size * 0.5 - 8);
  ctx.strokeRect(4, size * 0.5 + 4, size - 8, size * 0.5 - 8);

  return finalizeTexture(canvas, 0.55, 0.55);
}

function createConcreteTexture(): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);
  const rand = seededRandom(303);

  ctx.fillStyle = '#DAD8D3';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 420; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 8 + rand() * 34;
    const v = rand() > 0.5 ? 245 : 192;
    ctx.fillStyle = `rgba(${v},${v - 2},${v - 5},0.03)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle architectural expansion joint
  ctx.strokeStyle = 'rgba(140, 138, 132, 0.28)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  return finalizeTexture(canvas, 0.42, 0.42);
}

export function createRugTexture(): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);
  const rand = seededRandom(515);

  ctx.fillStyle = '#EFE9DE';
  ctx.fillRect(0, 0, size, size);

  // Boucle woven fiber texture
  for (let i = 0; i < 2400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(212,201,184,0.22)' : 'rgba(252,249,243,0.25)';
    ctx.fillRect(x, y, 4, 2);
  }

  // Minimalist Nordic geometric border & motif
  ctx.strokeStyle = 'rgba(148, 118, 92, 0.42)';
  ctx.lineWidth = 6;
  ctx.strokeRect(28, 28, size - 56, size - 56);

  ctx.strokeStyle = 'rgba(200, 90, 50, 0.28)';
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 48, size - 96, size - 96);

  ctx.beginPath();
  ctx.moveTo(48, size * 0.5);
  ctx.lineTo(size - 48, size * 0.5);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export interface FloorMaterialCache {
  getMaterial: (type: FloorMaterialType) => THREE.MeshStandardMaterial;
  rugMaterial: THREE.MeshStandardMaterial;
  dispose: () => void;
}

export function createFloorMaterialCache(): FloorMaterialCache {
  const map = new Map<FloorMaterialType, THREE.MeshStandardMaterial>();
  const textures: THREE.Texture[] = [];

  const register = (
    type: FloorMaterialType,
    tex: THREE.CanvasTexture,
    roughness: number,
    metalness = 0.02
  ) => {
    textures.push(tex);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness,
      metalness,
    });
    map.set(type, mat);
  };

  register('oak', createWoodPlankTexture([214, 184, 144], [148, 112, 74], 'rgba(130,98,64,0.34)', 101), 0.62);
  register('walnut', createWoodPlankTexture([142, 104, 76], [88, 58, 38], 'rgba(68,45,28,0.42)', 202), 0.56);
  register('travertine', createTravertineTexture(), 0.52);
  register('tile', createSpaTileTexture(), 0.36, 0.04);
  register('tatami', createTatamiTexture(), 0.85, 0.0);
  register('concrete', createConcreteTexture(), 0.48, 0.04);

  const rugTex = createRugTexture();
  textures.push(rugTex);
  const rugMaterial = new THREE.MeshStandardMaterial({
    map: rugTex,
    roughness: 0.94,
    metalness: 0,
  });

  return {
    getMaterial: (type) => map.get(type) ?? map.get('oak')!,
    rugMaterial,
    dispose: () => {
      map.forEach((m) => m.dispose());
      rugMaterial.dispose();
      textures.forEach((t) => t.dispose());
    },
  };
}
