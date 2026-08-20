import { describe, expect, it, vi } from 'vitest';
import { createUsageDataExportEffect } from '../js/core/UsageDataExportEffect.js';

function createHarness(options) {
  var config = options || {};
  var anchor = {
    click: config.click || vi.fn(),
    download: '',
    href: '',
  };
  var body = {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  };
  var document = {
    body: body,
    createElement: vi.fn(function (tagName) {
      if (tagName !== 'a') throw new Error('unexpected element: ' + tagName);
      return anchor;
    }),
  };
  var buildPayload = vi.fn(function (state, payloadOptions) {
    return {
      exportSchemaVersion: 1,
      exportedAt: payloadOptions.exportedAt,
      summary: { day: state && state.day ? state.day : 0 },
    };
  });
  var createBlob = vi.fn(function (parts, blobOptions) {
    return { parts: parts, type: blobOptions.type };
  });
  var createObjectURL = vi.fn(function () { return 'blob:usage-data-test'; });
  var revokeObjectURL = vi.fn();
  var effect = createUsageDataExportEffect({
    buildPayload: buildPayload,
    getDocument: function () { return config.document === undefined ? document : config.document; },
    now: function () { return new Date('2026-08-21T08:30:00.000Z'); },
    createBlob: createBlob,
    createObjectURL: createObjectURL,
    revokeObjectURL: revokeObjectURL,
  });
  return {
    anchor: anchor,
    body: body,
    buildPayload: buildPayload,
    createBlob: createBlob,
    createObjectURL: createObjectURL,
    effect: effect,
    revokeObjectURL: revokeObjectURL,
  };
}

describe('UsageDataExportEffect', function () {
  it('统一构造脱敏 payload、JSON 文件名与一次性下载节点', function () {
    var harness = createHarness();

    var result = harness.effect.exportFile({ day: 42 });

    expect(result).toEqual({
      filename: 'linegame-usage-data-2026-08-21.json',
      mimeType: 'application/json',
      payload: {
        exportSchemaVersion: 1,
        exportedAt: '2026-08-21T08:30:00.000Z',
        summary: { day: 42 },
      },
      serializedLength: expect.any(Number),
    });
    expect(harness.buildPayload).toHaveBeenCalledWith(
      { day: 42 },
      { exportedAt: '2026-08-21T08:30:00.000Z' },
    );
    expect(harness.createBlob).toHaveBeenCalledWith(
      [expect.stringContaining('"exportSchemaVersion": 1')],
      { type: 'application/json' },
    );
    expect(harness.anchor.href).toBe('blob:usage-data-test');
    expect(harness.anchor.download).toBe('linegame-usage-data-2026-08-21.json');
    expect(harness.anchor.click).toHaveBeenCalledOnce();
    expect(harness.body.appendChild).toHaveBeenCalledWith(harness.anchor);
    expect(harness.body.removeChild).toHaveBeenCalledWith(harness.anchor);
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:usage-data-test');
  });

  it('下载点击失败时仍释放临时 DOM 与 object URL', function () {
    var clickError = new Error('download blocked');
    var harness = createHarness({
      click: vi.fn(function () { throw clickError; }),
    });

    expect(function () { harness.effect.exportFile(null); }).toThrow(clickError);
    expect(harness.body.removeChild).toHaveBeenCalledWith(harness.anchor);
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:usage-data-test');
  });

  it('没有活动 document 时明确拒绝，而不是静默伪装成功', function () {
    var harness = createHarness({ document: null });

    expect(function () { harness.effect.exportFile(null); }).toThrow('requires an active document');
    expect(harness.createObjectURL).not.toHaveBeenCalled();
  });
});
