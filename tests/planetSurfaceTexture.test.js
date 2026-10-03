import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  createPlanetSurfaceData,
  getPlanetTextureDimensions,
} from '../js/ui/PlanetSurfaceTexture.js';

// 从精简计算前的生产实现采集，校验全部字节，防止优化改变地表、云层或灯光。
const SOL_SURFACE_BASELINE = {
  high: {
    albedo: 'de967d7316104ced8d7ec8456fbf69ab8fb6637286637171cd883794a2cbb530',
    bump: 'c8b14a68675834ea7926f1687a1e4f2de29f2bd3739e379c288fec5fc071c897',
    clouds: '246524deafdbc3d48d81262f518a88207e2145e99a605042fa08d22d0780c82e',
    emissive: 'f1eb882041bdb175939d2b03f5c22bdaf4072f2d5a4c10472b728b668656079e',
  },
  medium: {
    albedo: 'e0ad48e98bd13372cb22441f966c824811cf72c6ff018351c6750b2d0ba73fad',
    bump: 'ab05d1f66526d7e79036fc6a6201d8fa83e6bacfc8a905fbd5d6a9bc0253ce2d',
    clouds: '93f92bf59b66a2e9f13f1d4b79516a09024229f79354d9e20e5af6aba697089f',
    emissive: '3936397cc7b6741d2dafec0f31478d7b56c88184537181a9a57649e62a6cceda',
  },
  low: {
    albedo: '927f4142590ff5d2fa30598481ce369cc16cf97cceb9492c3f425b5c06fb2a1b',
    bump: 'd2d2f2229e504dabf637b994ae002b56be2aadbaa70cab5145223e8eeb829e05',
    clouds: '8e8bf62c719d917a5d9cf4dfed7c8ce0977ff54acb0a895940b705f9c211f8ba',
    emissive: '6ebd2426f4e5444574ad60bf505d4edb2f8d1b21dc23f74cbdf14cbd1f95f0b0',
  },
};

function expectHorizontalSeamToMatch(buffer, width, height) {
  for (let y = 0; y < height; y += 1) {
    const left = (y * width) * 4;
    const right = (y * width + width - 1) * 4;
    expect(Array.from(buffer.slice(right, right + 4))).toEqual(Array.from(buffer.slice(left, left + 4)));
  }
}

describe('PlanetSurfaceTexture', function () {
  it.each(['high', 'medium', 'low'])('主星 %s 的四层完整像素与优化前基线一致', quality => {
    const surface = createPlanetSurfaceData({ id: 'sol_prime', type: 'agricultural' }, '#82b6a1', true, quality);
    expect({ width: surface.width, height: surface.height }).toEqual(getPlanetTextureDimensions(quality));
    expect({ hasClouds: surface.hasClouds, hasLights: surface.hasLights, gaseous: surface.gaseous })
      .toEqual({ hasClouds: true, hasLights: true, gaseous: false });
    for (const [layer, hash] of Object.entries(SOL_SURFACE_BASELINE[quality])) {
      expect(createHash('sha256').update(surface[layer]).digest('hex'), layer).toBe(hash);
    }
  });

  it('使用 2:1 经纬贴图并让所有图层的左右边缘逐像素闭合', function () {
    const surface = createPlanetSurfaceData(
      { id: 'seam-test-world', type: 'technology' },
      '#55a8ff',
      true,
      'low'
    );

    expect(surface.width).toBe(surface.height * 2);
    expectHorizontalSeamToMatch(surface.albedo, surface.width, surface.height);
    expectHorizontalSeamToMatch(surface.bump, surface.width, surface.height);
    expectHorizontalSeamToMatch(surface.clouds, surface.width, surface.height);
    expectHorizontalSeamToMatch(surface.emissive, surface.width, surface.height);
  });

  it('相同星球稳定生成，而不同产业类型拥有不同的地貌与灯光层', function () {
    const first = createPlanetSurfaceData(
      { id: 'stable-world', type: 'agricultural' },
      '#5fd47a',
      true,
      'low'
    );
    const second = createPlanetSurfaceData(
      { id: 'stable-world', type: 'agricultural' },
      '#5fd47a',
      true,
      'low'
    );
    const city = createPlanetSurfaceData(
      { id: 'stable-world', type: 'commercial' },
      '#d277ff',
      true,
      'low'
    );

    expect(first.albedo).toEqual(second.albedo);
    expect(first.albedo).not.toEqual(city.albedo);
    expect(first.hasLights).toBe(true);
    expect(city.hasLights).toBe(true);
    expect(city.emissive.some(function (value) { return value > 0; })).toBe(true);
  });

  it('按画质提高分辨率，同时保持标准经纬宽高比', function () {
    expect(getPlanetTextureDimensions('low')).toEqual({ width: 192, height: 96 });
    expect(getPlanetTextureDimensions('medium')).toEqual({ width: 256, height: 128 });
    expect(getPlanetTextureDimensions('high')).toEqual({ width: 384, height: 192 });
  });

  it('主星的海岸和云层可重复生成，所有贴图在经度接缝闭合', function () {
    const args = [{ id: 'sol_prime', type: 'agricultural' }, '#82b6a1', true, 'low'];
    const surface = createPlanetSurfaceData(...args);
    const repeated = createPlanetSurfaceData(...args);
    for (const layer of ['albedo', 'bump', 'clouds', 'emissive']) {
      expect(surface[layer]).toEqual(repeated[layer]);
      expectHorizontalSeamToMatch(surface[layer], surface.width, surface.height);
    }
    const ocean = [], land = [];
    for (let i = 0; i < surface.albedo.length; i += 4) {
      const [r, g, b] = surface.albedo.slice(i, i + 3);
      if (b > r * 1.5) ocean.push(i);
      if (g > b * 1.2) land.push(i);
    }
    expect(ocean.length).toBeGreaterThan(surface.width * surface.height * 0.1);
    expect(land.length).toBeGreaterThan(surface.width * surface.height * 0.1);
  });
});
