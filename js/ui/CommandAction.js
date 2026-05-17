// js/ui/CommandAction.js — shared command CTA metadata and rendering helpers

const SURFACE_LABELS = {
  market: '市场',
  quest: '任务',
  research: '科技',
  exploration: '探索',
  navigation: '航行',
  fleet: '机库',
  system: '系统',
};

const SURFACE_ICONS = {
  market: '📊',
  quest: '📋',
  research: '🔬',
  exploration: '🧭',
  navigation: '🧭',
  fleet: '📡',
  system: 'ℹ️',
};

function _inferSurface(action) {
  if (!action) return 'system';
  if (action.commandSurface) return action.commandSurface;
  if (action.actionId === 'market' || action.type === 'market') return 'market';
  if (action.actionId === 'quest-focus') return 'quest';
  if (action.actionId === 'research') return 'research';
  if (action.actionId === 'dispatch' || action.type === 'dispatch') return 'fleet';
  if (action.type === 'scan' || action.type === 'land' || action.type === 'poi') return 'exploration';
  if (action.type === 'travel') return 'navigation';
  return 'system';
}

function _inferIntent(action) {
  if (!action) return '';
  if (action.commandIntent) return action.commandIntent;
  if (action.marketFocusLabel) return action.marketFocusLabel;

  if (action.actionId === 'quest-focus') return '替代任务';
  if (action.actionId === 'research') return '科技解锁';

  switch (action.type) {
    case 'scan':
      return '轨道测绘';
    case 'land':
      return '首次着陆';
    case 'poi':
      return 'POI 调查';
    case 'travel':
      return '航线移动';
    default:
      return action.reasonId || '';
  }
}

export function getCommandSurfaceLabel(surfaceId) {
  return SURFACE_LABELS[surfaceId] || SURFACE_LABELS.system;
}

export function normalizeCommandAction(action, defaults) {
  var normalized = Object.assign({}, defaults || {}, action || {});
  normalized.commandSurface = _inferSurface(normalized);
  normalized.commandIntent = _inferIntent(normalized);
  normalized.commandVerb = normalized.commandVerb || normalized.label || '';
  return normalized;
}

export function getCommandKicker(action) {
  var normalized = normalizeCommandAction(action);
  var surfaceLabel = getCommandSurfaceLabel(normalized.commandSurface);
  return normalized.commandIntent
    ? surfaceLabel + ' · ' + normalized.commandIntent
    : surfaceLabel;
}

export function getCommandActionAttributes(action, escapeAttr) {
  var normalized = normalizeCommandAction(action);
  var encode = typeof escapeAttr === 'function'
    ? escapeAttr
    : function (value) { return String(value == null ? '' : value); };

  return ' data-command-surface="' + encode(normalized.commandSurface) + '"' +
    ' data-command-intent="' + encode(normalized.commandIntent || '') + '"' +
    ' data-command-verb="' + encode(normalized.commandVerb || '') + '"';
}

export function renderCommandActionContent(action, escapeHtml) {
  var normalized = normalizeCommandAction(action);
  var encode = typeof escapeHtml === 'function'
    ? escapeHtml
    : function (value) { return String(value == null ? '' : value); };
  var label = normalized.label || normalized.commandVerb || '执行动作';
  return '<span class="command-action-kicker">' + encode(getCommandKicker(normalized)) + '</span>' +
    '<span class="command-action-label">' + encode(label) + '</span>';
}

export function buildCommandFeedback(action, options) {
  var normalized = normalizeCommandAction(action);
  var opts = options || {};
  var icon = opts.icon || SURFACE_ICONS[normalized.commandSurface] || SURFACE_ICONS.system;
  var surfaceLabel = getCommandSurfaceLabel(normalized.commandSurface);
  var openedVerb = opts.openedVerb || (normalized.commandSurface === 'fleet' ? '已载入' : '已打开');
  var destination = opts.destination || (normalized.commandIntent
    ? (surfaceLabel + ' · ' + normalized.commandIntent)
    : surfaceLabel);
  var parts = [icon + ' ' + openedVerb + destination + '。'];

  if (opts.nextStep) {
    parts.push('下一步：' + opts.nextStep + '。');
  }
  if (opts.returnTo) {
    parts.push('返回：' + opts.returnTo + '。');
  }

  return parts.join('');
}
