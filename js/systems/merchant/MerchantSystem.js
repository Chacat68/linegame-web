import {
  MERCHANT_DEFAULTS, MERCHANT_RULES, MERCHANT_DISTANCES, MERCHANT_GOODS,
  MERCHANT_PORTS, MERCHANT_SHIPS, MERCHANT_TECHS, MERCHANT_COMPANY_LEVELS, merchantDistance,
} from '../../data/merchant.js';
import {
  initExploration, isValidExplorationState, scheduleExploration, processExploration,
  nextExplorationAt, previewExploration, startExploration,
} from './MerchantExploration.js';
import {
  createOnboardingState, isValidOnboardingState, syncOnboarding, commandOnboarding,
} from './MerchantOnboarding.js';

const clone = value => JSON.parse(JSON.stringify(value));
const integer = value => Number.isSafeInteger(value) && value >= 0;
const active = ship => ship.phase === 'outbound' || ship.phase === 'return';
const taskById = (merchant, id) => merchant.tasks.find(task => task.id === id);
const ordered = values => [...values].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

export const getPort = id => MERCHANT_PORTS.find(port => port.id === id);
export const getGood = id => MERCHANT_GOODS.find(good => good.id === id);
export const getShipType = id => MERCHANT_SHIPS.find(type => type.id === id);
export const getTech = id => MERCHANT_TECHS.find(tech => tech.id === id);
export const isShipTypeUnlocked = (merchant, typeId) => {
  const type = getShipType(typeId);
  return Boolean(type && (!type.techId || merchant.researchedTechIds?.includes(type.techId)));
};

export function getCompanyProgress(merchant) {
  const current = MERCHANT_COMPANY_LEVELS.find(item => item.level === merchant.companyLevel);
  const next = MERCHANT_COMPANY_LEVELS.find(item => item.level === merchant.companyLevel + 1);
  return {
    level: current.level, shipLimit: current.shipLimit, ownedShips: merchant.ships.length,
    remaining: Math.max(0, current.shipLimit - merchant.ships.length),
    upgradeCost: current.upgradeCost, nextShipLimit: next?.shipLimit ?? null,
  };
}

// 每种船型独立递增；逐艘取整后求和，使批购与连续单购保持同价。
export function getShipPurchaseQuote(merchant, typeId, quantity = 1) {
  const type = getShipType(typeId);
  if (!type || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) return null;
  const owned = merchant.ships.filter(ship => ship.typeId === typeId).length;
  let total = 0;
  let nextPrice = 0;
  let lastPrice = 0;
  for (let index = 0; index < quantity; index += 1) {
    const price = Math.ceil(type.price * MERCHANT_RULES.shipPriceGrowth ** (owned + index));
    total += price;
    if (!Number.isSafeInteger(price) || !Number.isSafeInteger(total)) return null;
    if (index === 0) nextPrice = price;
    lastPrice = price;
  }
  return { quantity, owned, nextPrice, lastPrice, total };
}

function newMarkets() {
  return Object.fromEntries(MERCHANT_PORTS.map(port => [port.id, {
    supply: { ...port.supply }, demand: { ...port.demand },
  }]));
}

export function init(state, now = Date.now()) {
  if (!state.merchant) state.merchant = clone(MERCHANT_DEFAULTS);
  const merchant = state.merchant;
  if (!merchant.markets || !Object.keys(merchant.markets).length) merchant.markets = newMarkets();
  if (!integer(merchant.lastTickAt) || merchant.lastTickAt === 0) {
    merchant.lastTickAt = Math.max(1, Math.floor(now));
    merchant.nextRestockAt = merchant.lastTickAt + MERCHANT_RULES.restockMs;
  }
  if (!integer(merchant.nextRestockAt) || merchant.nextRestockAt <= merchant.lastTickAt) {
    merchant.nextRestockAt = merchant.lastTickAt + MERCHANT_RULES.restockMs;
  }
  initExploration(merchant);
  if (merchant.onboarding === undefined) merchant.onboarding = createOnboardingState();
  syncOnboarding(merchant);
  return merchant;
}

function validReportRecord(record) {
  return Boolean(record && typeof record.shipId === 'string' && record.shipId &&
    getPort(record.from)?.buy?.[record.goodId] && getPort(record.to)?.sell?.[record.goodId] && record.from !== record.to &&
    integer(record.quantity) && record.quantity > 0 && integer(record.cost) && integer(record.revenue) && integer(record.fee) &&
    Number.isFinite(record.profit) && record.profit === record.revenue - record.cost - record.fee &&
    integer(record.departedAt) && integer(record.legMs) && record.legMs > 0 &&
    integer(record.completedAt) && record.completedAt >= record.departedAt);
}

function validTaskReport(task) {
  return Boolean(task && typeof task.id === 'string' && task.id && integer(task.rounds) &&
    Number.isFinite(task.profit) && Array.isArray(task.recent) && task.recent.every(validReportRecord) &&
    (task.stopReason === undefined || typeof task.stopReason === 'string'));
}

export function isValidMerchantState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!isValidOnboardingState(value.onboarding)) return false;
  if (!MERCHANT_COMPANY_LEVELS.some(item => item.level === value.companyLevel)) return false;
  if (!integer(value.lastTickAt) || !integer(value.nextRestockAt) || !integer(value.nextId) || value.nextId === 0) return false;
  if (value.lastTickAt && value.nextRestockAt <= value.lastTickAt) return false;
  if (!Array.isArray(value.ships) || !Array.isArray(value.tasks) || !Array.isArray(value.history) || !Array.isArray(value.unlockedPorts)) return false;
  if (!Array.isArray(value.researchedTechIds) || new Set(value.researchedTechIds).size !== value.researchedTechIds.length) return false;
  if (value.researchedTechIds.some(id => !getTech(id) || getTech(id).requires.some(required => !value.researchedTechIds.includes(required)))) return false;
  if (!value.markets || typeof value.markets !== 'object' || Array.isArray(value.markets)) return false;
  if (value.history.some(task => !validTaskReport(task) || !integer(task.closedAt))) return false;
  const reportIds = [...value.tasks, ...value.history].map(task => task?.id);
  if (value.exploration?.event) reportIds.push(value.exploration.event.id);
  if (new Set(reportIds).size !== reportIds.length) return false;
  // 已结束任务和历史船号也占用过序号，不能在后续采购或派遣时重新生成。
  const usedIds = [...reportIds, ...value.ships.map(ship => ship?.id), ...value.history.flatMap(task => [
    ...(Array.isArray(task.shipIds) ? task.shipIds : []), ...task.recent.map(record => record.shipId),
  ])];
  if (usedIds.some(id => {
    const sequence = /^(?:ship|task|event)-(\d+)$/.exec(id)?.[1];
    return sequence !== undefined && Number(sequence) >= value.nextId;
  })) return false;
  if (new Set(value.unlockedPorts).size !== value.unlockedPorts.length || value.unlockedPorts.some(id => !getPort(id))) return false;
  const marketIds = Object.keys(value.markets);
  if (marketIds.length !== 0 && MERCHANT_PORTS.some(port => {
    const market = value.markets[port.id];
    return !market || ['supply', 'demand'].some(side =>
      !market[side] || Object.entries(port[side]).some(([goodId, max]) =>
        !integer(market[side][goodId]) || market[side][goodId] > max));
  })) return false;
  if (marketIds.length === 0 && value.tasks.length) return false;
  const shipsById = new Map();
  const committedByTask = new Map();
  for (const ship of value.ships) {
    if (!ship || typeof ship.id !== 'string' || !getShipType(ship.typeId) || shipsById.has(ship.id)) return false;
    shipsById.set(ship.id, ship);
    if (!['idle', 'waiting', 'outbound', 'return', 'exploring', 'explore_return'].includes(ship.phase)) return false;
    if (!integer(ship.arriveAt) || !integer(ship.departAt)) return false;
    if (active(ship) && (!ship.taskId || !ship.trip || !integer(ship.trip.quantity) || ship.trip.quantity === 0
      || !integer(ship.trip.cost) || !integer(ship.trip.fee) || !integer(ship.trip.revenue)
      || !integer(ship.trip.departedAt) || !integer(ship.trip.legMs) || ship.trip.legMs === 0
      || !getPort(ship.trip.from) || !getPort(ship.trip.to) || !getGood(ship.trip.goodId)
      || ship.arriveAt <= ship.departAt)) return false;
    if (active(ship)) {
      const trip = ship.trip;
      if (trip.from === trip.to || trip.quantity > getShipType(ship.typeId).capacity ||
          trip.cost !== trip.quantity * getPort(trip.from).buy[trip.goodId] ||
          trip.revenue !== trip.quantity * getPort(trip.to).sell[trip.goodId] ||
          trip.fee !== roundTripFee(ship.typeId, trip.from, trip.to) ||
          trip.revenue <= trip.cost + trip.fee) return false;
      committedByTask.set(ship.taskId, (committedByTask.get(ship.taskId) || 0) + trip.cost + trip.fee);
    }
  }
  if (!isValidExplorationState(value, legDuration)) return false;
  const tasksById = new Map();
  const reservedByTask = new Map();
  for (const task of value.tasks) {
    if (!task || typeof task.id !== 'string' || tasksById.has(task.id) || !Array.isArray(task.shipIds)) return false;
    tasksById.set(task.id, task);
    if (!integer(task.budget) || !integer(task.available) || task.available > task.budget) return false;
    // 变更预算时仍按当前账本核对；待返港缩减的预算尚未释放。
    if (task.available + (committedByTask.get(task.id) || 0) !== task.budget) return false;
    if (!validTaskReport(task)) return false;
    if (typeof task.stopping !== 'boolean' || new Set(task.shipIds).size !== task.shipIds.length || !task.shipIds.length) return false;
    if (!value.unlockedPorts.includes(task.from) || !value.unlockedPorts.includes(task.to) || task.from === task.to
      || !getPort(task.from)?.buy?.[task.goodId] || !getPort(task.to)?.sell?.[task.goodId]) return false;
    const pending = task.pending;
    if (pending != null && (!integer(pending.budget) || pending.budget === 0 || pending.budget > task.budget
      || !Array.isArray(pending.shipIds) || !pending.shipIds.length
      || new Set(pending.shipIds).size !== pending.shipIds.length
      || !value.unlockedPorts.includes(pending.from) || !value.unlockedPorts.includes(pending.to)
      || pending.from === pending.to || !getPort(pending.from)?.buy?.[pending.goodId]
      || !getPort(pending.to)?.sell?.[pending.goodId])) return false;
    const reservedIds = [...task.shipIds, ...(pending?.shipIds || [])];
    if (reservedIds.some(id => shipsById.get(id)?.taskId !== task.id)) return false;
    reservedByTask.set(task.id, new Set(reservedIds));
  }
  return value.ships.every(ship => {
    if (ship.taskId == null) return true;
    const event = value.exploration.event;
    if (ship.taskId === event?.id) return ship.id === event.shipId && ['exploring', 'returning'].includes(event.status);
    const task = tasksById.get(ship.taskId);
    return Boolean(task && reservedByTask.get(task.id)?.has(ship.id) && (!active(ship) ||
      ship.trip.from === task.from && ship.trip.to === task.to && ship.trip.goodId === task.goodId));
  });
}

export function legDuration(shipTypeId, from, to) {
  const type = getShipType(shipTypeId);
  return Math.ceil(MERCHANT_RULES.legMsPerDistance * merchantDistance(from, to) / type.speed);
}

export function roundTripFee(shipTypeId, from, to) {
  const type = getShipType(shipTypeId);
  return Math.ceil(type.fee + MERCHANT_RULES.feePerDistance * merchantDistance(from, to));
}

export function minimumProfitableBudget(shipTypeId, from, to, goodId) {
  const type = getShipType(shipTypeId);
  const origin = getPort(from);
  const destination = getPort(to);
  const buy = origin?.buy?.[goodId];
  const sell = destination?.sell?.[goodId];
  if (!type || !buy || !sell || from === to || sell <= buy) return Infinity;
  const fee = roundTripFee(shipTypeId, from, to);
  const quantity = Math.floor(fee / (sell - buy)) + 1;
  const capacity = Math.min(type.capacity, origin.supply[goodId] || 0, destination.demand[goodId] || 0);
  return quantity <= capacity ? quantity * buy + fee : Infinity;
}

export function getOperatingReserve(state, extraTypeId) {
  const merchant = state.merchant;
  // 已出发航次返港会归还货本；可持续任务已独立占用货本，无需重复冻结自由资金。
  if (merchant.ships.some(ship => active(ship) && ship.trip && taskById(merchant, ship.taskId))) return 0;
  if (merchant.tasks.some(task => !task.stopping && merchant.ships.some(ship =>
    ship.taskId === task.id && task.available >= minimumProfitableBudget(ship.typeId, task.from, task.to, task.goodId)))) return 0;
  const typeIds = [...merchant.ships.map(ship => ship.typeId), ...(extraTypeId ? [extraTypeId] : [])];
  let minimum = Infinity;
  for (const typeId of typeIds) for (const from of merchant.unlockedPorts) for (const to of merchant.unlockedPorts) {
    for (const good of MERCHANT_GOODS) {
      minimum = Math.min(minimum, minimumProfitableBudget(typeId, from, to, good.id));
    }
  }
  return Number.isFinite(minimum) ? minimum : 0;
}

export function getExplorationPreview(state, input = {}) {
  init(state);
  return previewExploration(state, input, { legDuration, operatingReserve: getOperatingReserve(state) });
}

function quote(merchant, from, to, goodId, ship, budget, market) {
  const origin = getPort(from);
  const destination = getPort(to);
  const type = getShipType(ship.typeId);
  if (!origin || !destination || from === to || !type || !getGood(goodId)) return { quantity: 0, reason: '请选择不同港口、货物和船只。' };
  const buy = origin.buy[goodId];
  const sell = destination.sell[goodId];
  if (!buy || !sell) return { quantity: 0, reason: '该商路没有可成交的供需组合。' };
  const fee = roundTripFee(ship.typeId, from, to);
  const supply = market[from]?.supply?.[goodId] || 0;
  const demand = market[to]?.demand?.[goodId] || 0;
  const affordable = Math.floor((budget - fee) / buy);
  const quantity = Math.max(0, Math.min(type.capacity, supply, demand, affordable));
  const cost = quantity * buy;
  const revenue = quantity * sell;
  const profit = revenue - cost - fee;
  const reason = quantity === 0
    ? budget < fee + buy ? '货本不足，无法同时支付采购与完整往返费用。'
      : supply === 0 ? '出发港暂时无货。'
        : demand === 0 ? '目的港需求已满。' : '当前条件无法成交。'
    : profit <= 0 ? '实际可成交量不足以覆盖完整往返费用。' : '';
  return {
    quantity, cost, revenue, fee, profit, reason,
    legMs: legDuration(ship.typeId, from, to),
    fullLoad: quantity === type.capacity,
    supply, demand,
  };
}

// 市场机会与派遣发车共用同一报价规则；仅推荐此刻有船和货本可完成的盈利航次。
export function findRouteOpportunity(state, from, to, goodId) {
  const merchant = init(state);
  if (!merchant.unlockedPorts.includes(from) || !merchant.unlockedPorts.includes(to) || from === to) return null;
  const cash = Math.max(0, Math.floor(state.credits));
  const opportunityFor = (ship, available, purchaseCost = 0) => {
    const minimum = minimumProfitableBudget(ship.typeId, from, to, goodId);
    if (!Number.isFinite(minimum) || available < minimum) return null;
    const budget = Math.min(available, Math.max(220, minimum));
    const offer = quote(merchant, from, to, goodId, ship, budget, merchant.markets);
    if (!offer.quantity || offer.profit <= 0) return null;
    return {
      shipId: purchaseCost ? null : ship.id,
      typeId: ship.typeId,
      purchaseCost,
      budget,
      quantity: offer.quantity,
      profit: offer.profit,
    };
  };
  for (const ship of merchant.ships) {
    if (!ship.taskId) {
      const opportunity = opportunityFor(ship, cash);
      if (opportunity) return opportunity;
    }
  }
  if (!getCompanyProgress(merchant).remaining) return null;
  for (const type of MERCHANT_SHIPS) {
    if (!isShipTypeUnlocked(merchant, type.id)) continue;
    const purchase = getShipPurchaseQuote(merchant, type.id);
    if (!purchase) continue;
    const remaining = cash - purchase.total;
    if (remaining < getOperatingReserve(state, type.id)) continue;
    const opportunity = opportunityFor({ typeId: type.id }, remaining, purchase.total);
    if (opportunity) return opportunity;
  }
  return null;
}

export function listRouteOpportunities(state) {
  const merchant = init(state);
  const routes = [];
  for (const from of MERCHANT_PORTS) for (const to of MERCHANT_PORTS) {
    if (from.id === to.id || !merchant.unlockedPorts.includes(from.id) || !merchant.unlockedPorts.includes(to.id)) continue;
    for (const good of MERCHANT_GOODS) {
      if (!from.buy[good.id] || !to.sell[good.id]) continue;
      routes.push({
        from: from.id, to: to.id, goodId: good.id,
        opportunity: findRouteOpportunity(state, from.id, to.id, good.id),
      });
    }
  }
  return [...routes.filter(route => route.opportunity), ...routes.filter(route => !route.opportunity)];
}

export function preview(state, plan) {
  const merchant = init(state);
  const available = Math.max(0, Math.floor(Number(plan.budget) || 0));
  const market = clone(merchant.markets);
  let remaining = available;
  const rows = [];
  for (const id of plan.shipIds || []) {
    const ship = merchant.ships.find(item => item.id === id);
    if (!ship) continue;
    const result = quote(merchant, plan.from, plan.to, plan.goodId, ship, remaining, market);
    rows.push({ shipId: id, typeId: ship.typeId, ...result });
    if (result.quantity > 0 && result.profit > 0) {
      remaining -= result.cost + result.fee;
      market[plan.from].supply[plan.goodId] -= result.quantity;
      market[plan.to].demand[plan.goodId] -= result.quantity;
    }
  }
  return {
    rows,
    quantity: rows.reduce((sum, row) => sum + (row.profit > 0 ? row.quantity : 0), 0),
    profit: rows.reduce((sum, row) => sum + Math.max(0, row.profit || 0), 0),
    cost: rows.reduce((sum, row) => sum + (row.profit > 0 ? row.cost : 0), 0),
    fee: rows.reduce((sum, row) => sum + (row.profit > 0 ? row.fee : 0), 0),
    reason: rows.length ? [...new Set(rows.map(row => row.reason).filter(Boolean))].join('；') : '请至少分配一艘可用飞船。',
  };
}

function restock(merchant) {
  for (const port of MERCHANT_PORTS) {
    const market = merchant.markets[port.id];
    for (const side of ['supply', 'demand']) {
      for (const [goodId, max] of Object.entries(port[side])) {
        market[side][goodId] = Math.min(max, (market[side][goodId] || 0) + Math.max(1, Math.ceil(max * MERCHANT_RULES.restockFraction)));
      }
    }
  }
  merchant.nextRestockAt += MERCHANT_RULES.restockMs;
}

function finishTask(state, task) {
  const merchant = state.merchant;
  if (merchant.ships.some(ship => ship.taskId === task.id && active(ship))) return false;
  state.credits += task.available;
  for (const ship of merchant.ships) {
    if (ship.taskId === task.id) { ship.taskId = null; ship.phase = 'idle'; ship.waitReason = ''; }
  }
  merchant.tasks = merchant.tasks.filter(item => item !== task);
  merchant.history.unshift({ ...clone(task), closedAt: merchant.lastTickAt });
  merchant.history.length = Math.min(merchant.history.length, MERCHANT_RULES.archivedTasks);
  return true;
}

function stopTask(state, task, reason = '') {
  const merchant = state.merchant;
  // 调整尚未生效时，新增预留船并不属于旧航次，取消调整即释放，避免留下孤立占用。
  for (const ship of merchant.ships) {
    if (ship.taskId === task.id && !task.shipIds.includes(ship.id) && !active(ship)) {
      ship.taskId = null; ship.phase = 'idle'; ship.waitReason = '';
    }
  }
  task.stopping = true;
  task.pending = null;
  task.stopReason = reason;
  // 有效航次继续往返；未出航不扣款，所有航次返港后只归还一次货本。
  finishTask(state, task);
}

function autoStopMessage(state, task) {
  return `${task.stopReason}已自动解除派遣${taskById(state.merchant, task.id)
    ? '，在途船只返港后释放货本和船只。' : '，货本和船只已释放。'}`;
}

function applyPending(state, task) {
  const merchant = state.merchant;
  if (!task.pending || merchant.ships.some(ship => ship.taskId === task.id && active(ship))) return;
  const plan = task.pending;
  for (const ship of merchant.ships) {
    if (ship.taskId === task.id && !plan.shipIds.includes(ship.id)) {
      ship.taskId = null; ship.phase = 'idle'; ship.waitReason = '';
    }
  }
  const release = task.budget - plan.budget;
  if (release > 0) { task.available -= release; state.credits += release; }
  Object.assign(task, { from: plan.from, to: plan.to, goodId: plan.goodId, shipIds: [...plan.shipIds], budget: plan.budget, pending: null });
}

function depart(state, task, ship, at) {
  const merchant = state.merchant;
  const result = quote(merchant, task.from, task.to, task.goodId, ship, task.available, merchant.markets);
  if (!result.quantity || result.profit <= 0) {
    ship.phase = 'waiting'; ship.waitReason = result.reason;
    return false;
  }
  task.available -= result.cost + result.fee;
  merchant.markets[task.from].supply[task.goodId] -= result.quantity;
  merchant.markets[task.to].demand[task.goodId] -= result.quantity;
  ship.phase = 'outbound'; ship.departAt = at; ship.arriveAt = at + result.legMs;
  ship.waitReason = '';
  ship.trip = {
    from: task.from, to: task.to, goodId: task.goodId, quantity: result.quantity,
    cost: result.cost, fee: result.fee, revenue: result.revenue,
    departedAt: at, legMs: result.legMs,
  };
  return true;
}

function processAt(state, at) {
  const merchant = state.merchant;
  while (merchant.nextRestockAt <= at) restock(merchant);
  processExploration(merchant, at);
  for (const ship of ordered(merchant.ships)) {
    if (!active(ship) || ship.arriveAt > at) continue;
    const task = taskById(merchant, ship.taskId);
    if (!task || !ship.trip) continue;
    if (ship.phase === 'outbound') {
      ship.phase = 'return'; ship.departAt = at; ship.arriveAt = at + ship.trip.legMs;
    } else {
      const trip = ship.trip;
      const profit = trip.revenue - trip.cost - trip.fee;
      task.available += trip.cost + trip.fee;
      state.credits += profit;
      task.rounds += 1; task.profit += profit;
      task.recent.unshift({ shipId: ship.id, ...trip, profit, completedAt: at });
      task.recent.length = Math.min(task.recent.length, MERCHANT_RULES.recentTrips);
      ship.phase = 'idle'; ship.arriveAt = 0; ship.trip = null;
    }
  }
  for (const task of ordered(merchant.tasks)) {
    if (task.stopping) { finishTask(state, task); continue; }
    applyPending(state, task);
    if (task.pending) continue;
    const ships = ordered(merchant.ships.filter(item => item.taskId === task.id));
    let blocked = false;
    for (const ship of ships) {
      if (!active(ship) && !depart(state, task, ship, at)) blocked = true;
    }
    if (blocked) {
      // 完整货本仍能支持任一船盈利时，只是周转款暂被在途船占用，等待返港回款。
      const viable = ships.map(ship => quote(merchant, task.from, task.to, task.goodId, ship, task.budget, merchant.markets));
      if (!ships.some(active) || !viable.some(offer => offer.quantity > 0 && offer.profit > 0)) {
        stopTask(state, task, viable.find(offer => offer.reason)?.reason || '当前条件无法完成派遣。');
      } else {
        for (const ship of ships) if (!active(ship)) ship.waitReason = '等待同任务在途货本返港回款。';
      }
    }
  }
  syncOnboarding(merchant);
}

export function advance(state, now = Date.now()) {
  const merchant = init(state, now);
  const target = Math.max(merchant.lastTickAt, Math.floor(now));
  const elapsed = target - merchant.lastTickAt;
  if (elapsed >= 60_000) merchant.lastCatchupMs = elapsed;
  let cursor = merchant.lastTickAt;
  let events = 0;
  while (events < MERCHANT_RULES.maxEventsPerAdvance) {
    merchant.lastTickAt = cursor;
    processAt(state, cursor);
    const nextArrival = Math.min(...merchant.ships.filter(active).map(ship => ship.arriveAt), Infinity);
    const next = Math.min(nextArrival, merchant.nextRestockAt, nextExplorationAt(merchant));
    if (next > target || !Number.isFinite(next)) { merchant.lastTickAt = target; break; }
    cursor = next;
    events += 1;
  }
  syncOnboarding(merchant);
  return { caughtUp: merchant.lastTickAt >= target, processedEvents: events, pendingMs: target - merchant.lastTickAt };
}

function normalizePlan(state, input, existing) {
  const merchant = state.merchant;
  const from = String(input?.from || '');
  const to = String(input?.to || '');
  const goodId = String(input?.goodId || '');
  const budget = Math.floor(Number(input?.budget));
  const shipIds = [...new Set(Array.isArray(input?.shipIds) ? input.shipIds.map(String) : [])];
  if (!merchant.unlockedPorts.includes(from) || !merchant.unlockedPorts.includes(to) || from === to) return { error: '请选择两个已开放且不同的港口。' };
  if (!getPort(from)?.buy?.[goodId] || !getPort(to)?.sell?.[goodId]) return { error: '这条商路没有对应的供货与需求。' };
  if (!integer(budget) || budget === 0) return { error: '请输入大于零的周转货本。' };
  if (!shipIds.length) return { error: '请至少分配一艘飞船。' };
  for (const id of shipIds) {
    const ship = merchant.ships.find(item => item.id === id);
    if (!ship || (ship.taskId && ship.taskId !== existing?.id)) return { error: '所选飞船已被其他经营任务占用。' };
  }
  const extra = budget - (existing?.budget || 0);
  if (extra > state.credits) return { error: '未分配 CR 不足，无法划拨这笔货本。' };
  return { plan: { from, to, goodId, budget, shipIds } };
}

export function command(state, action, input, now = Date.now()) {
  const merchant = init(state, now);
  // 引导操作只更新自己的进度；失败或重复操作不触发经营补算、扣款或奖励。
  if (action === 'onboarding') return commandOnboarding(state, input);
  if (action === 'buyShip') {
    const type = getShipType(input?.typeId);
    const quantity = input?.quantity === undefined ? 1 : input.quantity;
    if (!type) return { ok: false, msg: '未知船型。' };
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) return { ok: false, msg: '购船数量应为 1 至 20 艘。' };
    if (!isShipTypeUnlocked(merchant, type.id)) return { ok: false, msg: `请先完成${getTech(type.techId).name}研发。` };
    const company = getCompanyProgress(merchant);
    if (quantity > company.remaining) return { ok: false, msg: `公司 Lv.${company.level} 最多持有 ${company.shipLimit} 艘飞船，请先升级公司。` };
    const purchase = getShipPurchaseQuote(merchant, type.id, quantity);
    if (!purchase) return { ok: false, msg: '船价超出可购买范围。' };
    const total = purchase.total;
    if (state.credits < total) return { ok: false, msg: `可用 CR 不足，需要 ${total.toLocaleString('zh-CN')} CR。` };
    const reserve = getOperatingReserve(state, type.id);
    if (state.credits - total < reserve) return { ok: false, msg: `需保留至少 ${reserve.toLocaleString('zh-CN')} CR 首航货本。` };
    const shipIds = [];
    for (let index = 0; index < quantity; index += 1) {
      const id = `ship-${merchant.nextId++}`;
      shipIds.push(id);
      merchant.ships.push({ id, typeId: type.id, taskId: null, phase: 'idle', arriveAt: 0, departAt: 0, trip: null });
    }
    state.credits -= total;
    return { ok: true, msg: `已购入 ${quantity} 艘${type.name}，共 ${total.toLocaleString('zh-CN')} CR。`, shipIds };
  }
  if (action === 'upgradeCompany') {
    const company = getCompanyProgress(merchant);
    if (company.upgradeCost === null) return { ok: false, msg: '公司已达到最高等级。' };
    if (state.credits < company.upgradeCost) return { ok: false, msg: `可用 CR 不足，需要 ${company.upgradeCost.toLocaleString('zh-CN')} CR。` };
    const reserve = getOperatingReserve(state);
    if (state.credits - company.upgradeCost < reserve) return { ok: false, msg: `需保留至少 ${reserve.toLocaleString('zh-CN')} CR 首航货本。` };
    state.credits -= company.upgradeCost;
    merchant.companyLevel += 1;
    scheduleExploration(merchant, Math.max(merchant.lastTickAt, Math.floor(now)));
    return { ok: true, msg: `公司已升级至 Lv.${merchant.companyLevel}，船只总上限提升至 ${company.nextShipLimit} 艘。` };
  }
  if (action === 'researchTech') {
    const tech = getTech(input?.techId);
    if (!tech) return { ok: false, msg: '未知航运科技。' };
    if (merchant.researchedTechIds.includes(tech.id)) return { ok: false, msg: `${tech.name}已完成研发。` };
    const missing = tech.requires.find(id => !merchant.researchedTechIds.includes(id));
    if (missing) return { ok: false, msg: `请先完成${getTech(missing).name}研发。` };
    if (merchant.companyLevel < tech.companyLevel) return { ok: false, msg: `公司达到 Lv.${tech.companyLevel} 后开放${tech.name}研发。` };
    if (state.credits < tech.cost) return { ok: false, msg: `可用 CR 不足，需要 ${tech.cost.toLocaleString('zh-CN')} CR。` };
    const reserve = getOperatingReserve(state);
    if (state.credits - tech.cost < reserve) return { ok: false, msg: `需保留至少 ${reserve.toLocaleString('zh-CN')} CR 首航货本。` };
    state.credits -= tech.cost;
    merchant.researchedTechIds.push(tech.id);
    return { ok: true, msg: `${tech.name}研发完成；${getShipType(tech.unlockShipId).name}已可购买。` };
  }
  const settlement = advance(state, now);
  if (action === 'explore') {
    if (!settlement.caughtUp) return { ok: false, msg: '经营记录仍在补算，请稍后再派出探索。' };
    return startExploration(state, input, merchant.lastTickAt, { legDuration, operatingReserve: getOperatingReserve(state) });
  }
  if (action === 'create') {
    const { plan, error } = normalizePlan(state, input);
    if (error) return { ok: false, msg: error };
    const task = {
      id: `task-${merchant.nextId++}`, ...plan,
      available: plan.budget, rounds: 0, profit: 0, recent: [], pending: null,
      stopping: false, createdAt: now,
    };
    state.credits -= plan.budget;
    merchant.tasks.push(task);
    for (const ship of merchant.ships) if (plan.shipIds.includes(ship.id)) ship.taskId = task.id;
    advance(state, now);
    return { ok: true, msg: task.stopReason ? autoStopMessage(state, task) : '经营安排已提交，商队开始自动跑商。', taskId: task.id };
  }
  if (action === 'update') {
    const task = taskById(merchant, input?.taskId);
    if (!task || task.stopping) return { ok: false, msg: '找不到可调整的经营任务。' };
    if (task.pending) return { ok: false, msg: '上一项调整仍在等待返港生效。' };
    const { plan, error } = normalizePlan(state, input, task);
    if (error) return { ok: false, msg: error };
    const increase = Math.max(0, plan.budget - task.budget);
    if (increase) { state.credits -= increase; task.available += increase; task.budget += increase; }
    for (const ship of merchant.ships) if (plan.shipIds.includes(ship.id)) ship.taskId = task.id;
    task.pending = plan;
    advance(state, now);
    return { ok: true, msg: task.stopReason ? autoStopMessage(state, task) : task.pending ? '调整已排队，相关飞船返港后生效。' : '经营安排已更新。' };
  }
  if (action === 'stop') {
    const task = taskById(merchant, input?.taskId);
    if (!task) return { ok: false, msg: '经营任务已结束。' };
    stopTask(state, task);
    advance(state, now);
    return { ok: true, msg: taskById(merchant, task.id) ? '已停止新航次；在途飞船返港后释放预算和船只。' : '任务已结束，预算与飞船已释放。' };
  }
  if (action === 'unlockPort') {
    return { ok: false, msg: '请前往星图接受探索信号，派船探索返港后开放新星球与商路。' };
  }
  return { ok: false, msg: '未知经营操作。' };
}

export function getTaskStatus(merchant, task) {
  const ships = merchant.ships.filter(ship => ship.taskId === task.id);
  if (task.stopping) return task.stopReason ? '自动解除 · 等待返港' : '停止中 · 等待返港';
  if (task.pending) return '调整待生效';
  const outbound = ships.filter(ship => ship.phase === 'outbound').length;
  const returning = ships.filter(ship => ship.phase === 'return').length;
  if (outbound || returning) return `运行中 · 去程 ${outbound} / 返程 ${returning}`;
  return ships.find(ship => ship.waitReason)?.waitReason || '准备下一轮';
}

export function getMerchantSummary(state) {
  const merchant = init(state);
  const budget = merchant.tasks.reduce((sum, task) => sum + task.budget, 0);
  const available = merchant.tasks.reduce((sum, task) => sum + task.available, 0);
  const trips = merchant.ships.filter(active).map(ship => ship.trip);
  return {
    cash: state.credits,
    budget,
    available,
    committed: budget - available,
    cargoCost: merchant.ships.filter(ship => ship.phase === 'outbound').reduce((sum, ship) => sum + ship.trip.cost, 0),
    pendingRevenue: merchant.ships.filter(ship => ship.phase === 'return').reduce((sum, ship) => sum + ship.trip.revenue, 0),
    activeShips: trips.length,
    totalProfit: merchant.tasks.reduce((sum, task) => sum + task.profit, 0) + merchant.history.reduce((sum, task) => sum + task.profit, 0),
    totalTrips: merchant.tasks.reduce((sum, task) => sum + task.rounds, 0) + merchant.history.reduce((sum, task) => sum + task.rounds, 0),
  };
}

export const merchantDistances = MERCHANT_DISTANCES;
