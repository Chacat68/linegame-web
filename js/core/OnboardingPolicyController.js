// js/core/OnboardingPolicyController.js — 首次进入与教程完成后的内容策略
//
// OnboardingUiController 管理延迟视图与 DOM 生命周期；本 controller 只决定
// 欢迎反馈、教程完成反馈和首批任务投影，不持有 UI 或 session 快照。

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('OnboardingPolicyController requires ' + label + '.');
  return value;
}

function _formatQuestNames(quests) {
  return quests.map(function (quest) { return '「' + quest.name + '」'; }).join('、');
}

export function createOnboardingPolicyController(dependencies) {
  var deps = dependencies || {};
  var Quest = deps.Quest || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var emitLog = typeof deps.emitLog === 'function' ? deps.emitLog : _noop;
  var refreshActionGuide = typeof deps.refreshActionGuide === 'function' ? deps.refreshActionGuide : _noop;
  var recommendationCount = 0;
  var tutorialCompletionCount = 0;
  var welcomeCount = 0;

  function showWelcomeMessages() {
    emitLog({ text: '🚀 欢迎来到银河历 3045 年！您的星际贸易之旅由此开始……', type: 'info' });
    emitLog({
      text: '💡 提示：点击星图上的星系前往贸易，买低卖高赚取差价。多条长期路线等待推进——查看顶部进度了解详情！',
      type: 'tip',
    });
    emitLog({
      text: '🔬 新功能：查看【科技】标签研究群星科技，【派系】标签管理外交关系！',
      type: 'tip',
    });
    emitLog({
      text: '📋 新功能：【档案】入口可接取任务、查看探索报告、研究科技、查看派系与成就，右上角【设置】可管理存档！',
      type: 'tip',
    });
    welcomeCount += 1;
  }

  function recommendStarterQuests() {
    var state = getState();
    if (!state || typeof state !== 'object') return [];
    var recommendations = typeof Quest.getStarterRecommendations === 'function'
      ? (Quest.getStarterRecommendations(state, 3) || [])
      : [];
    var activeQuests = typeof Quest.getActiveQuests === 'function'
      ? (Quest.getActiveQuests(state) || [])
      : [];
    var activeQuest = activeQuests.length > 0 ? activeQuests[0] : null;

    recommendationCount += 1;
    if (activeQuest) {
      emitLog({
        text: '📋 当前正在推进「' + activeQuest.name + '」，底部当前行动会继续给出可直接执行的下一步。',
        type: 'info',
      });
      if (recommendations.length > 0) {
        emitLog({
          text: '🧭 跑完手头这单后，还可以继续接 ' + _formatQuestNames(recommendations) + '。',
          type: 'tip',
        });
      }
      return recommendations;
    }

    if (recommendations.length === 0) {
      emitLog({
        text: '📋 教程结束后可前往任务页查看当前章节任务，继续推进你的贸易生涯。',
        type: 'tip',
      });
      return recommendations;
    }

    emitLog({
      text: '📋 可接取任务：' + _formatQuestNames(recommendations) + '。',
      type: 'tip',
    });
    emitLog({
      text: '🧭 底部当前行动会直接接取并推进适合作为教程后第一阶段目标的任务。',
      type: 'info',
    });
    return recommendations;
  }

  function handleTutorialComplete() {
    tutorialCompletionCount += 1;
    emitLog({
      text: '🧭 操作教程完成。底部当前行动会继续引导你登记首轮交易并进入正式委托。',
      type: 'tip',
    });
    var recommendations = recommendStarterQuests();
    refreshActionGuide();
    return recommendations;
  }

  function getDiagnostics() {
    return Object.freeze({
      recommendationCount: recommendationCount,
      tutorialCompletionCount: tutorialCompletionCount,
      welcomeCount: welcomeCount,
    });
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    handleTutorialComplete: handleTutorialComplete,
    recommendStarterQuests: recommendStarterQuests,
    showWelcomeMessages: showWelcomeMessages,
  });
}
