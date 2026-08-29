// js/core/LogMessage.js — 通讯日志事件 envelope 与来源契约

export const LOG_MESSAGE_SOURCE = Object.freeze({
  SYSTEM: 'system',
  COMMERCE: 'commerce',
  NAVIGATION: 'navigation',
  FLEET: 'fleet',
  QUEST: 'quest',
  RESEARCH: 'research',
  EXPLORATION: 'exploration',
  GUIDANCE: 'guidance',
  EVENT: 'event',
  PROGRESSION: 'progression',
  PERSISTENCE: 'persistence',
  FEATURE: 'feature',
  SETTINGS: 'settings',
  TUTORIAL: 'tutorial',
  ACHIEVEMENT: 'achievement',
  VICTORY: 'victory',
  FACTION: 'faction',
});

export const LOG_MESSAGE_SOURCE_LABELS = Object.freeze({
  system: '系统',
  commerce: '交易',
  navigation: '航行',
  fleet: '舰队',
  quest: '任务',
  research: '科研',
  exploration: '探索',
  guidance: '引导',
  event: '事件',
  progression: '成长',
  persistence: '存档',
  feature: '功能',
  settings: '设置',
  tutorial: '教程',
  achievement: '成就',
  victory: '长期路线',
  faction: '派系',
});

export const LOG_MESSAGE_TYPES = Object.freeze([
  'info',
  'tip',
  'trade',
  'travel',
  'buy',
  'sell',
  'upgrade',
  'danger',
  'error',
]);

const LOG_MESSAGE_SOURCES = Object.freeze(Object.values(LOG_MESSAGE_SOURCE));
const LEGACY_SOURCE_BY_TYPE = Object.freeze({
  trade: LOG_MESSAGE_SOURCE.COMMERCE,
  buy: LOG_MESSAGE_SOURCE.COMMERCE,
  sell: LOG_MESSAGE_SOURCE.COMMERCE,
  travel: LOG_MESSAGE_SOURCE.NAVIGATION,
});

function _normalizeEnum(value, allowed, fallback) {
  var normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowed.indexOf(normalized) >= 0 ? normalized : fallback;
}

export function normalizeLogMessage(value, defaults) {
  var fallback = defaults || {};
  var input = value && typeof value === 'object'
    ? value
    : { text: value, type: fallback.type };
  var type = _normalizeEnum(input.type, LOG_MESSAGE_TYPES, _normalizeEnum(fallback.type, LOG_MESSAGE_TYPES, 'info'));
  var fallbackSource = _normalizeEnum(fallback.source, LOG_MESSAGE_SOURCES, '');
  var source = _normalizeEnum(
    input.source,
    LOG_MESSAGE_SOURCES,
    fallbackSource || LEGACY_SOURCE_BY_TYPE[type] || LOG_MESSAGE_SOURCE.SYSTEM
  );

  return Object.freeze({
    text: String(input.text == null ? '' : input.text),
    type: type,
    source: source,
  });
}

export function createScopedLogEmitter(emit, source) {
  if (typeof emit !== 'function') throw new TypeError('createScopedLogEmitter requires emit().');
  var normalizedSource = _normalizeEnum(source, LOG_MESSAGE_SOURCES, '');
  if (!normalizedSource) throw new TypeError('Unknown log message source: ' + source);

  return function emitScopedLog(message, type) {
    var input = message && typeof message === 'object'
      ? message
      : { text: message, type: type };
    return emit(normalizeLogMessage(input, { source: normalizedSource }));
  };
}

export function isLogMessageSource(value) {
  return LOG_MESSAGE_SOURCES.indexOf(value) >= 0;
}
