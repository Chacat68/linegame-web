import { MERCHANT_EXPLORATION_DEFAULTS, MERCHANT_EXPLORATION_TARGETS } from '../../data/merchant.js';
import { isValidTechSnapshot } from './MerchantTechnology.js';
import { getPlanetIntelligence } from './MerchantIntelligence.js';

const integer = value => Number.isSafeInteger(value) && value >= 0;
const exploring = ship => ship.phase === 'exploring' || ship.phase === 'explore_return';
const underway = event => event?.status === 'exploring' || event?.status === 'returning';
export const getExplorationRules = portId => MERCHANT_EXPLORATION_TARGETS.find(rule => rule.targetPortId === portId);
const legacySurveyMs = Object.freeze({ nebula_forge: 30_000, aurora_depot: 60_000 });

// v33 及更早的探索时间来自当时的规则；保留已支付任务与历史记录的原定时间。
export function restoreLegacyExplorationTiming(merchant) {
  const exploration = merchant.exploration;
  if (!exploration) return;
  for (const event of [...(exploration.completed || []), ...(exploration.event ? [exploration.event] : [])]) {
    if (event.surveyMs === undefined) event.surveyMs = event.status === 'available' ? 0 : legacySurveyMs[event.portId];
  }
}
// 去程与勘察共用持久化的 exploring 状态，展示阶段由真实时间推导。
export const getExplorationStage = (event, at = Date.now()) => event?.status === 'exploring'
  ? at < event.startedAt + event.legMs ? 'outbound' : 'surveying'
  : event?.status || null;
const eligible = (merchant, rule) => merchant.companyLevel >= rule.companyLevel &&
  merchant.researchedTechIds.includes(rule.techId) &&
  rule.requiresPorts.every(id => merchant.unlockedPorts.includes(id)) && !merchant.unlockedPorts.includes(rule.targetPortId);

export function createExplorationState() {
  return { ...MERCHANT_EXPLORATION_DEFAULTS, completed: [] };
}

export function initExploration(merchant) {
  if (merchant.exploration === undefined) merchant.exploration = createExplorationState();
  if (merchant.exploration.rngState === 0) merchant.exploration.rngState = Math.floor(Math.random() * 0xffff_ffff) + 1;
  return merchant.exploration;
}

function publishSignal(merchant, portId, at) {
  const exploration = merchant.exploration;
  if (exploration.event?.status === 'completed') exploration.completed.push({ ...exploration.event });
  exploration.event = {
    id: `event-${merchant.nextId++}`, portId, status: 'available',
    shipId: null, from: null, appearedAt: at,
    startedAt: 0, legMs: 0, surveyMs: 0, arriveAt: 0, completedAt: 0,
    techIds: [],
  };
  exploration.nextEventAt = 0;
  exploration.nextPortId = null;
}

export function scheduleExploration(merchant, at) {
  const exploration = merchant.exploration;
  if (exploration.event && exploration.event.status !== 'completed') return;
  const rule = MERCHANT_EXPLORATION_TARGETS.find(item => eligible(merchant, item));
  if (!rule) return;
  if (getPlanetIntelligence(merchant, rule.targetPortId)) {
    // 已购坐标在取得勘察资格后直接标记，仍沿用单项探索与返港开港规则。
    publishSignal(merchant, rule.targetPortId, at);
    return;
  }
  if (exploration.nextEventAt) return;
  let seed = exploration.rngState;
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  exploration.rngState = seed >>> 0;
  if (rule.minDelayMs === 0 && rule.maxDelayMs === 0) {
    publishSignal(merchant, rule.targetPortId, at);
    return;
  }
  const range = rule.maxDelayMs - rule.minDelayMs + 1;
  exploration.nextEventAt = at + rule.minDelayMs + Math.floor(exploration.rngState / 0x1_0000_0000 * range);
  exploration.nextPortId = rule.targetPortId;
}

export function nextExplorationAt(merchant) {
  const exploration = merchant.exploration;
  if (underway(exploration.event)) return exploration.event.arriveAt;
  return exploration.nextEventAt || Infinity;
}

export function processExploration(merchant, at) {
  const exploration = merchant.exploration;
  scheduleExploration(merchant, at);
  const pendingRule = getExplorationRules(exploration.nextPortId);
  if (exploration.nextEventAt && pendingRule?.minDelayMs === 0 && pendingRule.maxDelayMs === 0) {
    // 旧档尚在等待首次信号时，恢复后也立即开放；不改在途探索的时间。
    exploration.nextEventAt = Math.min(exploration.nextEventAt, at);
  }
  if (exploration.nextEventAt && exploration.nextEventAt <= at) publishSignal(merchant, exploration.nextPortId, exploration.nextEventAt);
  const event = exploration.event;
  while (underway(event) && event.arriveAt <= at) {
    const ship = merchant.ships.find(item => item.id === event.shipId);
    if (!ship || ship.taskId !== event.id) return;
    if (event.status === 'exploring') {
      ship.departAt = event.arriveAt;
      event.status = 'returning'; event.arriveAt += event.legMs;
      ship.phase = 'explore_return'; ship.arriveAt = event.arriveAt;
    } else {
      event.status = 'completed'; event.completedAt = event.arriveAt;
      if (!merchant.unlockedPorts.includes(event.portId)) merchant.unlockedPorts.push(event.portId);
      Object.assign(ship, { taskId: null, phase: 'idle', departAt: 0, arriveAt: 0, trip: null, waitReason: '' });
      scheduleExploration(merchant, event.completedAt);
    }
  }
}

export function previewExploration(state, input, { legDuration, operatingReserve }) {
  const merchant = state.merchant;
  const event = merchant.exploration.event;
  const rule = getExplorationRules(event?.portId) || MERCHANT_EXPLORATION_TARGETS[0];
  const result = { ok: false, reason: '', cost: rule.cost, legMs: 0, surveyMs: rule.surveyMs, durationMs: 0 };
  const reject = reason => ({ ...result, reason });
  if (merchant.companyLevel < rule.companyLevel) return reject(`公司达到 Lv.${rule.companyLevel} 后开放探索。`);
  if (!merchant.researchedTechIds.includes(rule.techId)) return reject(rule.techId === 'planet_survey' ? '请先研发新港勘察。' : '请先研发远域勘察。');
  if (merchant.unlockedPorts.includes(rule.targetPortId)) return reject('新港口已经开放。');
  if (!event || event.status !== 'available') return reject(underway(event) ? '探索正在进行，请等待飞船返港。' : '暂时没有可接受的探索信号。');
  if (!eligible(merchant, rule)) return reject('请先开放前置港口。');
  const from = input?.from || 'sol_prime';
  if (!merchant.unlockedPorts.includes(from) || from === event.portId) return reject('请选择一个已开放的出发港口。');
  const ship = merchant.ships.find(item => item.id === input?.shipId);
  if (!ship) return reject('请选择一艘空闲飞船。');
  result.legMs = legDuration(ship.typeId, from, event.portId, merchant);
  result.durationMs = 2 * result.legMs + rule.surveyMs;
  if (ship.taskId || ship.phase !== 'idle') return reject('这艘飞船已被占用，请选择空闲飞船。');
  if (state.credits < rule.cost) return reject(`可用 CR 不足，需要 ${rule.cost.toLocaleString('zh-CN')} CR 探索费用。`);
  if (state.credits - rule.cost < operatingReserve) return reject(`需保留至少 ${operatingReserve.toLocaleString('zh-CN')} CR 首航货本。`);
  return { ...result, ok: true };
}

export function startExploration(state, input, at, helpers) {
  const event = state.merchant.exploration.event;
  if (!event || event.id !== input?.eventId) return { ok: false, msg: '找不到可接受的探索信号。' };
  const offer = previewExploration(state, input, helpers);
  if (!offer.ok) return { ok: false, msg: offer.reason };
  if (!integer(at) || !integer(at + offer.durationMs)) return { ok: false, msg: '探索计时无效，请重试。' };
  const ship = state.merchant.ships.find(item => item.id === input.shipId);
  state.credits -= offer.cost;
  Object.assign(event, {
    status: 'exploring', shipId: ship.id, from: input.from || 'sol_prime',
    startedAt: at, legMs: offer.legMs, surveyMs: offer.surveyMs,
    arriveAt: at + offer.legMs + offer.surveyMs, completedAt: 0,
    techIds: [...state.merchant.researchedTechIds],
  });
  Object.assign(ship, { taskId: event.id, phase: 'exploring', departAt: at, arriveAt: event.arriveAt, trip: null, waitReason: '' });
  return { ok: true, msg: '探索已派出，返港后开放新星球与商路。', eventId: event.id };
}

export function isValidExplorationState(merchant, legDuration) {
  const exploration = merchant.exploration;
  if (!exploration || typeof exploration !== 'object' || Array.isArray(exploration) ||
      !integer(exploration.rngState) || exploration.rngState > 0xffff_ffff || !integer(exploration.nextEventAt) ||
      !Array.isArray(exploration.completed) || exploration.completed.length >= MERCHANT_EXPLORATION_TARGETS.length) return false;
  const event = exploration.event;
  const records = [...exploration.completed, ...(event ? [event] : [])];
  if (new Set(records.map(item => item?.id)).size !== records.length ||
      new Set(records.map(item => item?.portId)).size !== records.length) return false;
  if (exploration.completed.some(item => item?.status !== 'completed')) return false;
  if (exploration.nextEventAt) {
    const rule = getExplorationRules(exploration.nextPortId);
    if (!rule || !eligible(merchant, rule) || !exploration.rngState || exploration.nextEventAt <= merchant.lastTickAt ||
        event && event.status !== 'completed') return false;
  } else if (exploration.nextPortId !== null) return false;
  if (event === null) return !exploration.completed.length && !merchant.ships.some(exploring);
  if (!event || !exploration.rngState) return false;
  for (const item of records) {
    const rule = getExplorationRules(item?.portId);
    if (!rule || !isValidTechSnapshot(merchant, item.techIds) || typeof item.id !== 'string' || !/^event-[1-9]\d*$/.test(item.id) ||
        !['available', 'exploring', 'returning', 'completed'].includes(item.status) ||
        !integer(item.appearedAt) || !item.appearedAt || item.appearedAt > merchant.lastTickAt ||
        !integer(item.startedAt) || !integer(item.legMs) || !integer(item.surveyMs) || !integer(item.arriveAt) || !integer(item.completedAt)) return false;
    const opened = merchant.unlockedPorts.includes(item.portId);
    if (item.status === 'available') {
      if (!eligible(merchant, rule) || item.shipId !== null || item.from !== null || item.startedAt || item.legMs || item.surveyMs || item.arriveAt || item.completedAt) return false;
      continue;
    }
    const ship = merchant.ships.find(candidate => candidate.id === item.shipId);
    if (!ship || !merchant.unlockedPorts.includes(item.from) || item.from === item.portId ||
        item.startedAt < item.appearedAt || item.startedAt > merchant.lastTickAt || !item.legMs ||
        item.legMs !== legDuration(ship.typeId, item.from, item.portId, { researchedTechIds: item.techIds })) return false;
    if (![rule.surveyMs, legacySurveyMs[item.portId]].includes(item.surveyMs)) return false;
    const returningAt = item.startedAt + item.legMs + item.surveyMs;
    const completedAt = returningAt + item.legMs;
    if (!integer(completedAt)) return false;
    if (item.status === 'completed') {
      if (!opened || item.arriveAt !== completedAt || item.completedAt !== completedAt || completedAt > merchant.lastTickAt ||
          merchant.ships.some(candidate => candidate.taskId === item.id)) return false;
    } else {
      const returning = item.status === 'returning';
      if (!eligible(merchant, rule) || returning && returningAt > merchant.lastTickAt || item.completedAt !== 0 ||
          item.arriveAt !== (returning ? completedAt : returningAt) || ship.taskId !== item.id || ship.trip !== null ||
          ship.phase !== (returning ? 'explore_return' : 'exploring') || ship.departAt !== (returning ? returningAt : item.startedAt) ||
          ship.arriveAt !== item.arriveAt) return false;
    }
  }
  return merchant.ships.every(ship => !exploring(ship) || underway(event) && ship.id === event.shipId && ship.taskId === event.id) &&
    (underway(event) || !merchant.ships.some(ship => ship.taskId === event.id));
}
