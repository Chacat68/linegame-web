// js/ui/EventPresenter.js — 随机事件摘要、影响与选择项纯投影

function _freezeItems(items) {
  return Object.freeze(items.map(function (item) { return Object.freeze(item); }));
}

function _getRiskId(risk) {
  if (risk === 'safe' || risk === 'dangerous') return risk;
  return 'risky';
}

function _getStageId(stage) {
  if (stage === 'early' || stage === 'late' || stage === 'chain') return stage;
  return 'mid';
}

function _getRiskLabel(risk) {
  if (risk === 'safe') return '低风险';
  if (risk === 'dangerous') return '高风险';
  return '中风险';
}

function _getStageLabel(stage) {
  if (stage === 'early') return '前期事件';
  if (stage === 'late') return '后期事件';
  if (stage === 'chain') return '连续事件';
  return '中期事件';
}

function _isPressureChoice(choice) {
  var text = String((choice.text || '') + ' ' + (choice.tooltip || ''));
  return /花费|消耗|失去|损失|受损|风险|概率|失败|扣|减少|下降|高风险|触发|后续|调查/.test(text);
}

function _buildChoice(choice, index) {
  var source = choice && typeof choice === 'object' ? choice : {};
  var text = source.text ? String(source.text) : '选项 ' + (index + 1);
  var tooltip = source.tooltip ? String(source.tooltip) : '';
  return {
    ariaLabel: tooltip ? text + '，' + tooltip : text,
    fallbackClose: source._fallbackClose === true,
    hintId: 'event-choice-' + index + '-hint',
    index: index,
    labelId: 'event-choice-' + index + '-label',
    pressure: _isPressureChoice({ text: text, tooltip: tooltip }),
    text: text,
    tooltip: tooltip,
  };
}

export function buildEventView(event) {
  if (!event || typeof event !== 'object') return null;
  var risk = _getRiskId(event.risk);
  var stage = _getStageId(event.stage);
  var rawChoices = Array.isArray(event.choices) && event.choices.length > 0
    ? event.choices
    : [{ text: '确认', tooltip: '关闭事件简报', _fallbackClose: true }];
  var choices = rawChoices.map(_buildChoice);
  var riskLabel = _getRiskLabel(risk);
  var stageLabel = _getStageLabel(stage);
  var chainFollowUp = stage === 'chain' || !!event.chainFollowUp;
  var pressureCount = choices.filter(function (choice) { return choice.pressure; }).length;
  var firstHint = choices.find(function (choice) { return choice.tooltip; });
  var metaTags = [
    { text: riskLabel, className: 'event-tag event-tag-risk-' + risk },
    { text: stageLabel, className: 'event-tag' },
  ];

  if (chainFollowUp) {
    metaTags.push({
      text: stage === 'chain' ? '连续任务后续' : '可能引发后续事件',
      className: 'event-tag event-tag-chain',
    });
  }

  return Object.freeze({
    choices: _freezeItems(choices),
    description: event.description ? String(event.description) : '',
    icon: event.icon ? String(event.icon) : '📡',
    id: event.id == null ? null : String(event.id),
    impactItems: _freezeItems([
      { label: '风险程度', value: riskLabel, note: stageLabel },
      {
        label: '后续',
        value: chainFollowUp ? '可能延续' : '单次处置',
        note: event.chainDelay ? String(event.chainDelay) + ' 天窗口' : '即时结算',
      },
      {
        label: '资源压力',
        value: pressureCount > 0 ? String(pressureCount) + ' 项承压' : '低压力',
        note: firstHint ? firstHint.tooltip : '无明确资源消耗',
      },
      { label: '处置数量', value: String(choices.length) + ' 项', note: '选择后关闭事件简报' },
    ]),
    meta: Object.freeze({
      hidden: !!event.metaHidden,
      tags: _freezeItems(metaTags),
    }),
    risk: risk,
    stage: stage,
    summaryItems: _freezeItems([
      { label: '风险', value: riskLabel },
      { label: '阶段', value: stageLabel },
      { label: '处置', value: String(choices.length) + ' 项' },
    ]),
    title: event.title ? String(event.title) : '事件',
  });
}
