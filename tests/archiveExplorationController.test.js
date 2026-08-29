import { describe, expect, it } from 'vitest';
import { createArchiveExplorationController } from '../js/ui/ArchiveExplorationController.js';

function createReportTarget(reportId) {
  return {
    dataset: { archiveReportId: reportId },
    closest: function (selector) { return selector === '[data-archive-report-id]' ? this : null; },
  };
}

function createContainer(target) {
  return {
    onclick: null,
    onkeydown: null,
    querySelector: function () { return target || null; },
  };
}

describe('ArchiveExplorationController', function () {
  it('以单一根节点委托点击和键盘报告检查', function () {
    var inspected = [];
    var container = createContainer();
    var controller = createArchiveExplorationController({
      inspectReport: function (id, source) { inspected.push([id, source]); },
    });
    expect(controller.bind(container)).toBe(true);
    container.onclick({ target: createReportTarget('report-a') });
    var prevented = false;
    container.onkeydown({
      key: ' ',
      target: createReportTarget('report-b'),
      preventDefault: function () { prevented = true; },
    });
    expect(prevented).toBe(true);
    expect(inspected).toEqual([
      ['report-a', 'archive-report-card'],
      ['report-b', 'archive-report-card'],
    ]);
    expect(controller.getDiagnostics()).toEqual(expect.objectContaining({
      active: true,
      bindCount: 1,
      inspectCount: 2,
      lastReportId: 'report-b',
    }));
  });

  it('聚焦连续任务并记录成功诊断', function () {
    var classNames = [];
    var attributes = [];
    var scrollOptions = null;
    var target = {
      classList: { add: function (name) { classNames.push(name); } },
      setAttribute: function (name, value) { attributes.push([name, value]); },
      scrollIntoView: function (options) { scrollOptions = options; },
    };
    var container = createContainer(target);
    var controller = createArchiveExplorationController({});
    controller.bind(container);
    expect(controller.revealFocus('sol_prime', 'chain-a')).toBe(true);
    expect(classNames).toEqual(['is-guide-focus']);
    expect(attributes).toEqual([['data-guide-focus', 'true']]);
    expect(scrollOptions).toEqual({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    expect(controller.getDiagnostics()).toEqual(expect.objectContaining({ revealCount: 1, revealSuccessCount: 1 }));
  });

  it('忽略无关按键，重新绑定和 reset 会释放旧根', function () {
    var inspected = 0;
    var first = createContainer();
    var second = createContainer();
    var controller = createArchiveExplorationController({ inspectReport: function () { inspected += 1; } });
    controller.bind(first);
    first.onkeydown({ key: 'ArrowDown', target: createReportTarget('report-a') });
    controller.bind(second);
    expect(first.onclick).toBeNull();
    expect(first.onkeydown).toBeNull();
    expect(inspected).toBe(0);
    expect(controller.revealFocus(null)).toBe(false);
    expect(controller.reset()).toEqual({
      active: false,
      bindCount: 0,
      inspectCount: 0,
      lastReportId: null,
      resetCount: 1,
      revealCount: 0,
      revealSuccessCount: 0,
    });
    expect(second.onclick).toBeNull();
    expect(second.onkeydown).toBeNull();
  });
});
