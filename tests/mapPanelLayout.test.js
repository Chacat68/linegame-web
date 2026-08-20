import { describe, expect, it } from 'vitest';
import { buildMapPanelLayout } from '../js/ui/MapPanelLayout.js';

describe('MapPanelLayout', function () {
  it('嵌入 Context Inspector 时清空浮动几何并返回冻结模型', function () {
    var layout = buildMapPanelLayout({ embedded: true, mode: 'planet' });

    expect(layout).toEqual({
      embedded: true,
      left: null,
      mode: 'planet',
      top: null,
      width: null,
    });
    expect(Object.isFrozen(layout)).toBe(true);
  });

  it('星系总览在宽屏与窄屏都保持安全边距', function () {
    expect(buildMapPanelLayout({
      containerHeight: 760,
      containerWidth: 1200,
      mode: 'galaxy',
    })).toMatchObject({ left: 846, top: 12, width: 340 });

    expect(buildMapPanelLayout({
      containerHeight: 720,
      containerWidth: 300,
      mode: 'galaxy',
    })).toMatchObject({ left: 8, top: 12, width: 284 });
  });

  it('优先使用 Renderer 屏幕坐标并避开底栏与行动引导', function () {
    var layout = buildMapPanelLayout({
      anchor: { x: 0.9, y: 0.1 },
      commandSurfaceTops: [700, 650],
      containerHeight: 760,
      containerWidth: 1200,
      mode: 'planet',
      panelHeight: 220,
      pinned: true,
      screenPosition: { x: 100, y: 700 },
    });

    expect(layout).toEqual({
      embedded: false,
      left: 114,
      mode: 'planet',
      top: 418,
      width: 360,
    });
  });

  it('无 Renderer 坐标时按归一化锚点定位摘要面板', function () {
    var layout = buildMapPanelLayout({
      anchor: { x: 0.8, y: 0.25 },
      containerHeight: 600,
      containerWidth: 800,
      mode: 'planet',
      panelHeight: 160,
      pinned: false,
    });

    expect(layout).toMatchObject({
      left: 326,
      mode: 'planet',
      top: 70,
      width: 300,
    });
  });
});
