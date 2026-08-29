import { describe, expect, it } from 'vitest';
import { createAchievementBoardController } from '../js/ui/AchievementBoardController.js';

function createTarget(achievementId) {
  return {
    dataset: { achievementId: achievementId },
    closest: function (selector) { return selector === '.ach-card[data-achievement-id]' ? this : null; },
  };
}

function createContainer() {
  return { onclick: null, onkeydown: null };
}

describe('AchievementBoardController', function () {
  it('以单一根节点委托点击和键盘检查', function () {
    var inspected = [];
    var container = createContainer();
    var controller = createAchievementBoardController({
      inspectAchievement: function (id, source) { inspected.push([id, source]); },
    });
    expect(controller.bind(container)).toBe(true);
    container.onclick({ target: createTarget('first_trade') });
    var prevented = false;
    container.onkeydown({
      key: 'Enter',
      target: createTarget('first_million'),
      preventDefault: function () { prevented = true; },
    });
    expect(prevented).toBe(true);
    expect(inspected).toEqual([
      ['first_trade', 'archive-achievement-card'],
      ['first_million', 'archive-achievement-card'],
    ]);
    expect(controller.getDiagnostics()).toEqual(expect.objectContaining({
      bindCount: 1,
      inspectCount: 2,
      lastAchievementId: 'first_million',
      active: true,
    }));
    expect(Object.isFrozen(controller.getDiagnostics())).toBe(true);
  });

  it('忽略无关按键和无效目标', function () {
    var count = 0;
    var container = createContainer();
    var controller = createAchievementBoardController({ inspectAchievement: function () { count += 1; } });
    controller.bind(container);
    container.onkeydown({ key: 'ArrowDown', target: createTarget('first_trade') });
    container.onclick({ target: { closest: function () { return null; } } });
    expect(count).toBe(0);
    expect(controller.getDiagnostics().inspectCount).toBe(0);
  });

  it('重新绑定和 reset 会解绑旧根并清空交互诊断', function () {
    var first = createContainer();
    var second = createContainer();
    var controller = createAchievementBoardController({});
    controller.bind(first);
    controller.bind(second);
    expect(first.onclick).toBeNull();
    expect(first.onkeydown).toBeNull();
    var diagnostics = controller.reset();
    expect(second.onclick).toBeNull();
    expect(second.onkeydown).toBeNull();
    expect(diagnostics).toEqual({
      bindCount: 0,
      inspectCount: 0,
      resetCount: 1,
      lastAchievementId: null,
      active: false,
    });
  });
});
