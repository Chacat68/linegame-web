import { describe, expect, it } from 'vitest';
import { GAME_VERSION } from '../js/data/constants.js';
import {
  USAGE_DATA_EXPORT_SCHEMA_VERSION,
  buildUsageDataExport,
} from '../js/systems/metrics/UsageDataExport.js';
import { createTestState } from './helpers.js';

describe('UsageDataExport', function () {
  it('使用统一游戏版本和独立的导出格式版本', function () {
    var exportedAt = '2026-08-12T09:30:00.000Z';
    var payload = buildUsageDataExport(null, { exportedAt: exportedAt });

    expect(payload.exportedAt).toBe(exportedAt);
    expect(payload.gameVersion).toBe(GAME_VERSION);
    expect(payload.exportSchemaVersion).toBe(USAGE_DATA_EXPORT_SCHEMA_VERSION);
    expect(payload.exportSchemaVersion).toBe(1);
    expect(payload).not.toHaveProperty('schemaVersion');
  });

  it('没有指标时生成明确的空摘要', function () {
    var payload = buildUsageDataExport(null, { exportedAt: '2026-08-12T09:30:00.000Z' });

    expect(payload.summary).toEqual({
      empty: true,
      reason: '尚无可导出的本地平衡统计',
    });
    expect(payload.note).toContain('不会自动上传');
  });

  it('只导出脱敏后的平衡摘要，不携带公司或存档标识', function () {
    var state = createTestState({
      companyName: '不应导出的公司',
      saveName: '不应导出的存档',
      balanceMetrics: {
        firstTrade: { day: 2, action: 'sell', goodId: 'food', timestampMs: 123456 },
        continuedAfterTenMinutes: true,
        continuationDay: 3,
        lastActivity: { type: 'travel', day: 4, timestampMs: 456789 },
        trade: {
          actions: 7,
          buyActions: 3,
          sellActions: 4,
          realizedProfit: 825,
          realizedProfitByGood: { food: 825 },
        },
        routes: {
          trade_baron: {
            selectedDay: 20,
            completedDay: 68,
            daysToComplete: 48,
            selectedAssets: { credits: 10000 },
          },
        },
      },
    });

    var payload = buildUsageDataExport(state, { exportedAt: '2026-08-12T09:30:00.000Z' });
    var serialized = JSON.stringify(payload);

    expect(payload.summary).toEqual({
      firstTradeDay: 2,
      firstTradeAction: 'sell',
      continuedAfterTenMinutes: true,
      continuationDay: 3,
      tradeActions: 7,
      realizedProfit: 825,
      routes: [{
        pathId: 'trade_baron',
        selectedDay: 20,
        completedDay: 68,
        daysToComplete: 48,
      }],
    });
    expect(serialized).not.toContain('不应导出的公司');
    expect(serialized).not.toContain('不应导出的存档');
    expect(serialized).not.toContain('timestampMs');
    expect(serialized).not.toContain('goodId');
    expect(serialized).not.toContain('selectedAssets');
  });
});
