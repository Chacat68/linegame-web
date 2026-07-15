import { describe, expect, it } from 'vitest';
import {
  createPlanetSurfaceData,
  getPlanetTextureDimensions,
} from '../js/ui/PlanetSurfaceTexture.js';

function expectHorizontalSeamToMatch(buffer, width, height) {
  for (let y = 0; y < height; y += 1) {
    const left = (y * width) * 4;
    const right = (y * width + width - 1) * 4;
    expect(Array.from(buffer.slice(right, right + 4))).toEqual(Array.from(buffer.slice(left, left + 4)));
  }
}

describe('PlanetSurfaceTexture', function () {
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
});
