import { getSceneEnvironment } from '../data/sceneVisuals.js';

function rgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
}

function hash(x, y) {
  let value = Math.imul(x + 719, 374761393) ^ Math.imul(y + 3045, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function cacheNoiseGrid(minX, minY, width, height) {
  const values = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) values[y * width + x] = hash(minX + x, minY + y);
  }
  return { minX, minY, width, values };
}

// 三层坐标都由 0..1 的 u/v 决定；边界多留一格，保留原 hash 的双精度值。
const NOISE_GRIDS = [
  cacheNoiseGrid(0, 0, 7, 7),
  cacheNoiseGrid(41, 0, 15, 15),
  cacheNoiseGrid(0, 19, 33, 33),
];

function noise(x, y, grid) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const u = x - ix, v = y - iy;
  const sx = u * u * (3 - 2 * u), sy = v * v * (3 - 2 * v);
  const index = (iy - grid.minY) * grid.width + ix - grid.minX;
  const a = grid.values[index] * (1 - sx) + grid.values[index + 1] * sx;
  const b = grid.values[index + grid.width] * (1 - sx) + grid.values[index + grid.width + 1] * sx;
  return a * (1 - sy) + b * sy;
}

// 固定种子的远景尘埃带；仅在星系或画质变化时生成，不参与逐帧计算。
export function createGalaxyBackdropData(galaxyId, quality = 'medium', aspect = 1) {
  const edge = quality === 'high' ? 1024 : quality === 'low' ? 384 : 768;
  const ratio = Math.max(.2, Math.min(5, aspect));
  const width = Math.max(96, Math.round(edge * Math.min(1, ratio)));
  const height = Math.max(96, Math.round(edge / Math.max(1, ratio)));
  const environment = getSceneEnvironment(galaxyId);
  const base = rgb(environment.background), cool = rgb(environment.nebula), warm = rgb(environment.dust);
  const data = new Uint8ClampedArray(width * height * 4);
  const centers = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const u = x / (width - 1);
    centers[x] = .26 + u * .46 + Math.sin(u * 7 + .4) * .075;
  }
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const n = noise(u * 5, v * 5, NOISE_GRIDS[0]) * .56 + noise(u * 13 + 41, v * 13, NOISE_GRIDS[1]) * .29 + noise(u * 31, v * 31 + 19, NOISE_GRIDS[2]) * .15;
      const center = centers[x];
      const band = Math.exp(-Math.pow((v - center) / .22, 2));
      const cloud = Math.max(0, n - .22) * band;
      const dustLane = Math.exp(-Math.pow((v - center - .035 - (n - .5) * .12) / .03, 2));
      const warmMix = Math.max(0, Math.min(1, (u - .32) * 1.5 + n * .4));
      const light = cloud * (1 - dustLane * .76) * .88;
      const vignette = Math.max(.5, 1 - Math.hypot(u - .5, v - .5) * .46);
      const index = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const tint = cool[c] * (1 - warmMix) + warm[c] * warmMix;
        data[index + c] = Math.round((base[c] + tint * light) * vignette);
      }
      data[index + 3] = 255;
    }
  }
  // 微小背景恒星只作为装饰，不创建地点、航路或命中目标。
  const stars = quality === 'low' ? 220 : quality === 'high' ? 850 : 540;
  for (let i = 0; i < stars; i++) {
    const x = Math.floor(hash(i, 11) * (width - 2)) + 1;
    const y = Math.floor(hash(i, 71) * (height - 2)) + 1;
    const strength = 55 + hash(i, 101) * 130;
    const index = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) data[index + c] = Math.min(255, data[index + c] + strength * (c === 2 ? 1 : .9));
  }
  return { width, height, data };
}
