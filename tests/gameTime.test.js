import { describe, it, expect, beforeEach } from 'vitest';
import { TECHNOLOGIES } from '../js/data/technologies.js';
import * as GameTime from '../js/systems/time/GameTimeSystem.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as Finance from '../js/systems/finance/FinanceSystem.js';
import * as TradeStation from '../js/systems/trade/TradeStationSystem.js';
import * as Commerce from '../js/systems/commerce/CommerceFacade.js';
import * as Quest from '../js/systems/quest/QuestSystem.js';
import * as Research from '../js/systems/research/ResearchSystem.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
  GameTime.setAdvancedDayProcessor(Commerce.advanceDay);
});

describe('GameTime.consumeElapsedDays', () => {
  it('按 60 秒换算 1 个游戏日并保留余数', () => {
    const clock = GameTime.createRealtimeClockState(0, 100);

    const first = GameTime.consumeElapsedDays(clock, 30000, 60000);
    expect(first.elapsedDays).toBe(0);
    expect(first.remainderMs).toBe(30000);

    const second = GameTime.consumeElapsedDays(clock, 61000, 60000);
    expect(second.elapsedDays).toBe(1);
    expect(second.remainderMs).toBe(1000);
  });
});

describe('GameTime.advanceDays', () => {
  it('延迟注入的高级经营结算会逐日执行', () => {
    const state = createTestState({ day: 1 });
    let processedDays = 0;
    GameTime.setAdvancedDayProcessor(function () {
      processedDays += 1;
      return { ok: true, msgs: [] };
    });

    GameTime.advanceDays(state, 2);

    expect(processedDays).toBe(2);
  });

  it('推进日期时会同步结算研究与 survive_days 任务', () => {
    const tech = TECHNOLOGIES[0];
    const state = createTestState({
      day: 1,
      credits: 5000,
      currentResearch: { techId: tech.id, daysLeft: 1 },
      researchOptions: [],
    });

    Faction.init(state);
    Fleet.init(state);
    Finance.init(state);
    TradeStation.init(state);
    Research.init(state);
    Quest.init(state);

    state.quests.push({
      id: 'test_survive_days_runtime',
      name: '生存两天',
      type: 'trade',
      phase: 1,
      objectives: [{ type: 'survive_days', amount: 2, current: 0 }],
      rewards: { credits: 100, exp: 10, reputation: 5 },
      timeLimit: 0,
      startDay: 1,
    });

    const result = GameTime.advanceDays(state, 2);

    expect(result.ok).toBe(true);
    expect(state.day).toBe(3);
    expect(state.researchedTechs).toContain(tech.id);
    expect(state.completedQuests).toContain('test_survive_days_runtime');
    expect(result.msgs.some(function (message) {
      return message.source === 'research';
    })).toBe(true);
    expect(result.msgs.some(function (message) {
      return message.source === 'quest';
    })).toBe(true);
    expect(result.msgs[0]).toMatchObject({ source: 'system' });
  });
});
