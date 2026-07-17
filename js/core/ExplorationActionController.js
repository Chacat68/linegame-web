function _getState(context) {
  if (context && typeof context.getState === 'function') return context.getState();
  return context && context.state ? context.state : {};
}

function _call(context, name) {
  if (!context || typeof context[name] !== 'function') return undefined;
  return context[name].apply(null, Array.prototype.slice.call(arguments, 2));
}

export function isExplorationAction(actionType) {
  return actionType === 'exploration.poi';
}

export function getProcessingMessage() {
  return '已执行探索指令，正在刷新现场建议';
}

export function handleExplorationAction(suggestion, context) {
  if (!suggestion || !isExplorationAction(suggestion.actionType)) return false;

  var state = _getState(context || {});
  var payload = suggestion.payload || {};
  var systemId = payload.systemId || state.currentSystem;

  switch (suggestion.actionType) {
    case 'exploration.poi':
      if (payload.poiId) {
        _call(context, 'prepareDirectExecution');
        _call(context, 'explorePoi', systemId, payload.poiId);
      } else {
        _call(context, 'refreshActionGuide');
      }
      return true;

    default:
      _call(context, 'refreshActionGuide');
      return true;
  }
}
