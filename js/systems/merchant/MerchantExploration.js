import { MERCHANT_EXPLORATION_DEFAULTS, MERCHANT_EXPLORATION_RULES } from '../../data/merchant.js';

const integer = value => Number.isSafeInteger(value) && value >= 0;
const exploring = ship => ship.phase === 'exploring' || ship.phase === 'explore_return';
const underway = event => event?.status === 'exploring' || event?.status === 'returning';

export function createExplorationState() {
  return { ...MERCHANT_EXPLORATION_DEFAULTS };
}

export function initExploration(merchant) {
  if (merchant.exploration === undefined) merchant.exploration = createExplorationState();
  // 只在首次初始化抽取种子；之后的事件时间与随机状态一起保存，不因刷新重抽。
  if (merchant.exploration.rngState === 0) {
    merchant.exploration.rngState = Math.floor(Math.random() * 0xffff_ffff) + 1;
  }
  return merchant.exploration;
}

export function scheduleExploration(merchant, at) {
  const exploration = merchant.exploration;
  if (merchant.companyLevel < MERCHANT_EXPLORATION_RULES.companyLevel ||
      merchant.unlockedPorts.includes(MERCHANT_EXPLORATION_RULES.targetPortId) ||
      exploration.event || exploration.nextEventAt) return;
  let seed = exploration.rngState;
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  exploration.rngState = seed >>> 0;
  const range = MERCHANT_EXPLORATION_RULES.maxDelayMs - MERCHANT_EXPLORATION_RULES.minDelayMs + 1;
  const delay = MERCHANT_EXPLORATION_RULES.minDelayMs + Math.floor(exploration.rngState / 0x1_0000_0000 * range);
  exploration.nextEventAt = at + delay;
}

export function nextExplorationAt(merchant) {
  const exploration = merchant.exploration;
  if (underway(exploration.event)) return exploration.event.arriveAt;
  return exploration.event || !exploration.nextEventAt ? Infinity : exploration.nextEventAt;
}

export function processExploration(merchant, at) {
  const exploration = merchant.exploration;
  scheduleExploration(merchant, at);
  if (!exploration.event && exploration.nextEventAt && exploration.nextEventAt <= at) {
    exploration.event = {
      id: `event-${merchant.nextId++}`,
      portId: MERCHANT_EXPLORATION_RULES.targetPortId,
      status: 'available',
      shipId: null,
      from: null,
      appearedAt: exploration.nextEventAt,
      startedAt: 0,
      legMs: 0,
      arriveAt: 0,
      completedAt: 0,
    };
    exploration.nextEventAt = 0;
  }
  const event = exploration.event;
  // 去程包含勘察时间，返程完毕才开放港口；只推进已经由玩家发起的探索。
  while (underway(event) && event.arriveAt <= at) {
    const ship = merchant.ships.find(item => item.id === event.shipId);
    if (!ship || ship.taskId !== event.id) return;
    if (event.status === 'exploring') {
      ship.departAt = event.arriveAt;
      event.status = 'returning';
      event.arriveAt += event.legMs;
      ship.phase = 'explore_return';
      ship.arriveAt = event.arriveAt;
    } else {
      event.status = 'completed';
      event.completedAt = event.arriveAt;
      if (!merchant.unlockedPorts.includes(event.portId)) merchant.unlockedPorts.push(event.portId);
      ship.taskId = null;
      ship.phase = 'idle';
      ship.departAt = 0;
      ship.arriveAt = 0;
      ship.trip = null;
      ship.waitReason = '';
    }
  }
}

export function previewExploration(state, input, { legDuration, operatingReserve }) {
  const merchant = state.merchant;
  const event = merchant.exploration.event;
  const cost = MERCHANT_EXPLORATION_RULES.cost;
  const result = { ok: false, reason: '', cost, legMs: 0, durationMs: 0 };
  const reject = reason => ({ ...result, reason });
  if (merchant.companyLevel < MERCHANT_EXPLORATION_RULES.companyLevel) {
    return reject(`公司达到 Lv.${MERCHANT_EXPLORATION_RULES.companyLevel} 后开放探索。`);
  }
  if (merchant.unlockedPorts.includes(MERCHANT_EXPLORATION_RULES.targetPortId)) return reject('新港口已经开放。');
  if (!event || event.status !== 'available') return reject(underway(event) ? '探索正在进行，请等待飞船返港。' : '暂时没有可接受的探索信号。');
  const from = input?.from || 'sol_prime';
  if (!merchant.unlockedPorts.includes(from) || from === event.portId) return reject('请选择一个已开放的出发港口。');
  const ship = merchant.ships.find(item => item.id === input?.shipId);
  if (!ship) return reject('请选择一艘空闲飞船。');
  result.legMs = legDuration(ship.typeId, from, event.portId);
  result.durationMs = 2 * result.legMs + MERCHANT_EXPLORATION_RULES.surveyMs;
  if (ship.taskId || ship.phase !== 'idle') return reject('这艘飞船已被占用，请选择空闲飞船。');
  if (state.credits < cost) return reject(`可用 CR 不足，需要 ${cost.toLocaleString('zh-CN')} CR 探索费用。`);
  if (state.credits - cost < operatingReserve) return reject(`需保留至少 ${operatingReserve.toLocaleString('zh-CN')} CR 首航货本。`);
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
    startedAt: at, legMs: offer.legMs,
    arriveAt: at + offer.legMs + MERCHANT_EXPLORATION_RULES.surveyMs, completedAt: 0,
  });
  Object.assign(ship, {
    taskId: event.id, phase: 'exploring', departAt: at, arriveAt: event.arriveAt,
    trip: null, waitReason: '',
  });
  return { ok: true, msg: '探索已派出，返港后开放新星球与商路。', eventId: event.id };
}

export function isValidExplorationState(merchant, legDuration) {
  const exploration = merchant.exploration;
  if (!exploration || typeof exploration !== 'object' || Array.isArray(exploration) ||
      !integer(exploration.rngState) || exploration.rngState > 0xffff_ffff || !integer(exploration.nextEventAt)) return false;
  const event = exploration.event;
  const targetOpened = merchant.unlockedPorts.includes(MERCHANT_EXPLORATION_RULES.targetPortId);
  if (event === null) {
    return !merchant.ships.some(exploring) && (!exploration.nextEventAt ||
      exploration.rngState > 0 && !targetOpened && merchant.companyLevel >= MERCHANT_EXPLORATION_RULES.companyLevel &&
      exploration.nextEventAt > merchant.lastTickAt);
  }
  if (!event || typeof event !== 'object' || Array.isArray(event) || exploration.rngState === 0 || exploration.nextEventAt !== 0 ||
      typeof event.id !== 'string' || !/^event-[1-9]\d*$/.test(event.id) || event.portId !== MERCHANT_EXPLORATION_RULES.targetPortId ||
      !['available', 'exploring', 'returning', 'completed'].includes(event.status) ||
      !integer(event.appearedAt) || event.appearedAt === 0 || event.appearedAt > merchant.lastTickAt ||
      !integer(event.startedAt) || !integer(event.legMs) || !integer(event.arriveAt) || !integer(event.completedAt)) return false;
  if (event.status === 'available') {
    return !targetOpened && merchant.companyLevel >= MERCHANT_EXPLORATION_RULES.companyLevel &&
      event.shipId === null && event.from === null && event.startedAt === 0 && event.legMs === 0 &&
      event.arriveAt === 0 && event.completedAt === 0 &&
      !merchant.ships.some(ship => exploring(ship) || ship.taskId === event.id);
  }
  const ship = merchant.ships.find(item => item.id === event.shipId);
  if (!ship || !merchant.unlockedPorts.includes(event.from) || event.from === event.portId ||
      event.startedAt < event.appearedAt || event.startedAt > merchant.lastTickAt || event.legMs === 0 ||
      event.legMs !== legDuration(ship.typeId, event.from, event.portId)) return false;
  const returningAt = event.startedAt + event.legMs + MERCHANT_EXPLORATION_RULES.surveyMs;
  const completedAt = returningAt + event.legMs;
  if (!integer(completedAt)) return false;
  if (event.status === 'completed') {
    return targetOpened && event.arriveAt === completedAt && event.completedAt === completedAt &&
      event.completedAt <= merchant.lastTickAt &&
      !merchant.ships.some(item => exploring(item) || item.taskId === event.id);
  }
  const isReturning = event.status === 'returning';
  return !targetOpened && merchant.companyLevel >= MERCHANT_EXPLORATION_RULES.companyLevel &&
    (!isReturning || returningAt <= merchant.lastTickAt) &&
    event.completedAt === 0 && event.arriveAt === (isReturning ? completedAt : returningAt) &&
    ship.phase === (isReturning ? 'explore_return' : 'exploring') && ship.taskId === event.id && ship.trip === null &&
    ship.departAt === (isReturning ? returningAt : event.startedAt) && ship.arriveAt === event.arriveAt &&
    merchant.ships.every(item => item === ship || !exploring(item) && item.taskId !== event.id);
}
