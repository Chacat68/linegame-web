import { describe, expect, it, vi } from 'vitest';
import { createResearchBoardController } from '../js/ui/ResearchBoardController.js';

function createTarget(selector, dataset, options) {
  var opts = options || {};
  return {
    dataset: Object.assign({}, dataset || {}),
    disabled: !!opts.disabled,
    classList: { contains: function (name) { return !!opts.disabled && name === 'disabled'; } },
    closest: function (candidate) { return candidate === selector ? this : null; },
  };
}

function createContainer() {
  return { onclick: null, onkeydown: null };
}

describe('ResearchBoardController', function () {
  it('以稳定根节点委托研究、队列、派遣和检查 intent', function () {
    var optionsContainer = createContainer();
    var completedContainer = createContainer();
    var trace = [];
    var recommendation = { goodId: 'technology' };
    var controller = createResearchBoardController({
      inspectTechnology: function (techId, source) { trace.push(['inspect', techId, source]); },
    });
    controller.bind({
      optionsContainer: optionsContainer,
      completedContainer: completedContainer,
      researchRecommendation: recommendation,
      onStartResearch: function (techId) { trace.push(['start', techId]); },
      onCancelQueuedResearch: function (techId) { trace.push(['cancel', techId]); },
      onMoveQueuedResearchUp: function (techId) { trace.push(['up', techId]); },
      onMoveQueuedResearchDown: function (techId) { trace.push(['down', techId]); },
      onApplyResearchDispatch: function (value) { trace.push(['apply', value]); },
      onResolveResearchBlocker: function (action) { trace.push(['blocker', action]); },
    });

    optionsContainer.onclick({ target: createTarget('.btn-research', { tech: 'reinforced_hull' }) });
    optionsContainer.onclick({ target: createTarget('.queue-cancel-btn', { tech: 'advanced_thrusters' }) });
    optionsContainer.onclick({ target: createTarget('.queue-up-btn', { tech: 'cargo_compression' }) });
    optionsContainer.onclick({ target: createTarget('.queue-down-btn', { tech: 'cargo_compression' }) });
    optionsContainer.onclick({ target: createTarget('.research-route-apply-btn') });
    optionsContainer.onclick({ target: createTarget('.research-route-blocker-btn', {
      actionId: 'market',
      reasonId: 'credits',
      marketWorkspaceId: 'capital',
      marketSubworkspaceId: 'local',
      marketFocusLabel: '资金管理',
      focusTechId: 'reinforced_hull',
      focusTechName: '强化船体合金',
    }) });
    completedContainer.onclick({ target: createTarget('[data-completed-tech]', { completedTech: 'reinforced_hull' }) });

    expect(trace).toEqual([
      ['start', 'reinforced_hull'],
      ['cancel', 'advanced_thrusters'],
      ['up', 'cargo_compression'],
      ['down', 'cargo_compression'],
      ['apply', recommendation],
      ['blocker', expect.objectContaining({ actionId: 'market', focusTechId: 'reinforced_hull' })],
      ['inspect', 'reinforced_hull', 'archive-research-completed'],
    ]);
    expect(controller.getDiagnostics()).toEqual(expect.objectContaining({
      bindCount: 1,
      intentCount: 7,
      lastIntent: 'research.completed.inspect',
      activeContext: { hasRecommendation: true },
    }));
    expect(Object.isFrozen(controller.getDiagnostics())).toBe(true);
    expect(Object.isFrozen(controller.getDiagnostics().activeContext)).toBe(true);
  });

  it('清空队列必须确认，并丢弃重新绑定后到达的旧确认', function () {
    var confirmations = [];
    var cleared = vi.fn();
    var container = createContainer();
    var controller = createResearchBoardController({
      openConfirmation: function (options) { confirmations.push(options); return true; },
    });
    var request = { optionsContainer: container, onClearResearchQueue: cleared };
    controller.bind(request);
    container.onclick({ target: createTarget('.queue-clear-btn', { queuedCount: '3' }) });
    expect(confirmations[0].details[0]).toEqual({ label: '队列项目', value: '3 项' });
    expect(cleared).not.toHaveBeenCalled();

    controller.bind(request);
    confirmations[0].onConfirm();
    expect(cleared).not.toHaveBeenCalled();
    expect(controller.getDiagnostics().droppedConfirmationCount).toBe(1);

    container.onclick({ target: createTarget('.queue-clear-btn', { queuedCount: '2' }) });
    confirmations[1].onConfirm();
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it('支持键盘检查，并在 reset 时解绑全部根节点', function () {
    var inspected = [];
    var optionsContainer = createContainer();
    var completedContainer = createContainer();
    var controller = createResearchBoardController({
      inspectTechnology: function (techId) { inspected.push(techId); },
    });
    controller.bind({ optionsContainer: optionsContainer, completedContainer: completedContainer });
    var prevented = false;
    optionsContainer.onkeydown({
      key: 'Enter',
      target: createTarget('.research-card[data-tech]', { tech: 'advanced_thrusters' }),
      preventDefault: function () { prevented = true; },
    });
    expect(prevented).toBe(true);
    expect(inspected).toEqual(['advanced_thrusters']);

    var diagnostics = controller.reset();
    expect(optionsContainer.onclick).toBeNull();
    expect(optionsContainer.onkeydown).toBeNull();
    expect(completedContainer.onclick).toBeNull();
    expect(diagnostics).toEqual(expect.objectContaining({ bindCount: 0, resetCount: 1, activeContext: null }));
  });
});
