import { describe, expect, it, vi } from 'vitest';

describe('Renderer3DAdvanced dependency handling', function () {
  it('缺少 Babylon.js 时模块可导入且 init 会安全降级', async function () {
    var originalBabylon = globalThis.BABYLON;
    var originalDocument = globalThis.document;
    var warnSpy = vi.spyOn(console, 'warn').mockImplementation(function () {});

    globalThis.BABYLON = undefined;
    globalThis.document = {
      getElementById: function (id) {
        if (id !== 'map-3d-canvas') return null;
        return {
          style: {},
          addEventListener: function () {},
        };
      },
    };

    try {
      var Renderer = await import('../js/ui/Renderer3DAdvanced.js?no-babylon-test=' + Date.now());

      expect(Renderer.init()).toBe(false);
      expect(Renderer.isActive()).toBe(false);
      expect(function () { Renderer.resetCamera(); }).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith('[Renderer3DAdvanced] Babylon.js is unavailable; 3D starmap disabled.');
    } finally {
      warnSpy.mockRestore();
      if (originalBabylon === undefined) delete globalThis.BABYLON;
      else globalThis.BABYLON = originalBabylon;
      globalThis.document = originalDocument;
    }
  });
});
