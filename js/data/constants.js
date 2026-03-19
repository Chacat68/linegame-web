// js/data/constants.js — 游戏全局常量与初始状态
// 依赖：无
// 导出：INITIAL_STATE, DIFFICULTY_LEVELS, SAVE_STATE_SCHEMA,
//       SAVE_SCHEMA_VERSION, GAME_VERSION, SAVE_META_SCHEMA,
//       PERSISTED_STATE_DEFAULTS, RUNTIME_ONLY_FIELDS,
//       createInitialState, createPersistedState, createSaveMeta
//
// 状态定义的唯一真理来源是 SAVE_STATE_SCHEMA。
// INITIAL_STATE 由 SAVE_STATE_SCHEMA 自动生成 + 运行时专用字段。

/**
 * 难度分级系统
 * 影响：初始资金、价格波动幅度、事件概率、经济周期速度
 */
export const DIFFICULTY_LEVELS = {
  easy: {
    id: 'easy', name: '休闲模式', icon: '🌱',
    description: '更多初始资金，温和的经济波动，适合新手体验。',
    startCredits: 3000,
    priceVolatility: 0.8,      // 价格波动幅度缩减 20%
    eventChanceMod: 0.8,       // 事件概率降低
    eventRiskWeights: { safe: 1.2, risky: 1.0, dangerous: 0.7 },
    damageMod: 0.6,            // 受损减少 40%
    rewardMod: 1.2,            // 奖励增加 20%
  },
  normal: {
    id: 'normal', name: '标准模式', icon: '⚖️',
    description: '平衡的游戏体验，推荐首次游玩。',
    startCredits: 1000,
    priceVolatility: 1.0,
    eventChanceMod: 1.0,
    eventRiskWeights: { safe: 1.0, risky: 1.0, dangerous: 1.0 },
    damageMod: 1.0,
    rewardMod: 1.0,
  },
  hard: {
    id: 'hard', name: '挑战模式', icon: '🔥',
    description: '更少的初始资金，剧烈的经济波动，更频繁的危险事件。',
    startCredits: 500,
    priceVolatility: 1.3,      // 价格波动幅度增加 30%
    eventChanceMod: 1.3,       // 事件概率增加
    eventRiskWeights: { safe: 0.9, risky: 1.05, dangerous: 1.4 },
    damageMod: 1.5,            // 受损增加 50%
    rewardMod: 0.8,            // 奖励减少 20%
  },
};

export const ECONOMY_CONFIG = {
  modifier: {
    initialMin: 0.75,
    initialRange: 0.5,
    min: 0.55,
    max: 1.45,
    dailyDrift: 0.15,
  },
  supplyDemand: {
    baseline: 50,
    priceInfluence: 30,
    randomSpread: 20,
    min: 5,
    max: 100,
    dailyRecoveryRate: 0.15,
    dailyRecoveryNoise: 5,
    buySupplyImpact: 2,
    buyDemandImpact: 1,
    sellSupplyImpact: 2,
    sellDemandImpact: 1,
    priceRatioMinBase: 0.7,
    priceRatioScale: 0.6,
    priceRatioClamp: 2,
  },
  pricing: {
    buyMultiplier: 1.10,
    sellMultiplier: 0.95,
    minimumPrice: 1,
    sellTaxBase: 2.0,
    buyAdjustmentOrder: ['factionTax', 'techBuyDiscount', 'fleetTradeBonus'],
    sellAdjustmentOrder: ['factionTax', 'techSellBonus', 'fleetTradeBonus'],
  },
  peaks: {
    modifierBase: 1.8,
    modifierRange: 0.6,
    demandBoost: 25,
    supplyDrop: 15,
  },
  history: {
    maxDays: 30,
  },
  supplyChain: {
    propagationFactor: 0.3,   // 上游商品价格变动向下游传导的系数
  },
  marketDepth: {
    defaultDepth: 200,
    depthScaleFactor: 1.0,    // 交易量/市场深度 的影响缩放
  },
  blackMarket: {
    pricePremium: 1.35,          // 黑市买入溢价倍率
    sellPremium: 1.50,           // 黑市卖出溢价（高利润驱动走私）
    volatility: 1.8,             // 黑市价格波动倍率（相对公开市场）
    restrictedSellBonus: 1.25,   // 受监管商品在黑市的额外卖出加成
    illegalSellBonus: 1.60,      // 违禁品在黑市的卖出加成
  },
  smuggling: {
    baseCheckChance: 0.10,       // 基础检查概率 10%/入港
    enforcementLevels: {
      low: 0.7, medium: 1.0, high: 1.5,
    },
    reputationDivisor: 200,      // 声望调整 = 1 - reputation / 200
    fineMultiplier: 3.0,         // 罚款 = 走私品价值 × 3
    baseFine: 500,               // 基础罚款
    confiscate: true,            // 被抓时没收违禁品
    hullDamage: 10,              // 被抓时船体受损
  },
  travel: {
    invalidSystemFuelCost: 999,
    intraGalaxyDistanceScale: 100,
    crossGalaxyOriginX: 0.5,
    crossGalaxyOriginY: 0.5,
    crossGalaxyDistanceScale: 50,
  },
  cycle: {
    initialPhaseIndex: 1,
    fallbackDuration: 40,
    phases: [
      { id: 'prosperity', name: '繁荣期', icon: '📈', priceMod: 1.15, demandBoost: 15, supplyBoost: -5, peakChance: 0.40, duration: [25, 45] },
      { id: 'stability',  name: '稳定期', icon: '⚖️', priceMod: 1.00, demandBoost: 0,  supplyBoost: 0,  peakChance: 0.25, duration: [30, 50] },
      { id: 'decline',    name: '衰退期', icon: '📉', priceMod: 0.90, demandBoost: -10, supplyBoost: 10, peakChance: 0.20, duration: [20, 35] },
      { id: 'recession',  name: '萧条期', icon: '🔻', priceMod: 0.80, demandBoost: -20, supplyBoost: 20, peakChance: 0.15, duration: [15, 30] },
    ],
  },
};

export const FACTION_CONFIG = {
  relations: {
    min: -100,
    max: 100,
  },
  tradeImpact: {
    basePerUnit: 0.5,
    likedMultiplier: 1.5,
    sellMultiplier: 1.2,
  },
};

export const PROGRESSION_CONFIG = {
  levelPerks: {
    3:  { type: 'sellBonus', value: 0.03, message: '✨ 等级奖励：卖出价格 +3%' },
    4:  { type: 'cargo', value: 5, message: '✨ 等级奖励：当前船只货舱容量 +5' },
    5:  { type: 'buyDiscount', value: 0.03, message: '✨ 等级奖励：买入价格 -3%' },
    6:  { type: 'fuelEfficiencyMultiplier', value: 0.9, message: '✨ 等级奖励：当前船只燃料效率 +10%' },
    7:  { type: 'factionBonus', value: 10, message: '✨ 等级奖励：所有派系好感 +10' },
    8:  { type: 'cargo', value: 10, message: '✨ 等级奖励：当前船只货舱容量 +10' },
    9:  { type: 'sellBonus', value: 0.05, message: '✨ 等级奖励：卖出价格 +5%' },
    10: {
      type: 'composite',
      cargo: 10,
      maxFuel: 20,
      buyDiscount: 0.05,
      sellBonus: 0.05,
      message: '✨ 银河商业帝皇加冕！当前船只全属性大幅提升！',
    },
  },
};

export const EVENT_CONFIG = {
  cooldownDays: 10,
  stages: {
    early: { maxDay: 12, maxPlayerLevel: 3 },
    mid: { maxDay: 35, maxPlayerLevel: 6 },
    late: { maxDay: Infinity, maxPlayerLevel: Infinity },
  },
  protection: {
    lowHullThreshold: 35,
    lowFuelThreshold: 20,
    lowCreditsThreshold: 150,
    earlyDangerousMaxDay: 10,
    earlyDangerousMaxLevel: 3,
  },
};

export const SAVE_SCHEMA_VERSION = 8;
export const GAME_VERSION = '0.5.3';

/**
 * SaveEnvelope.meta 契约
 * 说明：摘要字段仅用于槽位展示、版本迁移与调试排障，不承载完整游戏状态。
 */
export const SAVE_META_SCHEMA = {
  schemaVersion: { type: 'number', default: SAVE_SCHEMA_VERSION, desc: '存档结构版本' },
  gameVersion:   { type: 'string', default: GAME_VERSION,        desc: '游戏版本号' },
  slotId:        { type: 'string', default: '0',                 desc: '存档槽位 ID（兼容数字槽位与字符串测试槽位）' },
  saveName:      { type: 'string', default: '自动存档',           desc: '存档名称' },
  timestampMs:   { type: 'number', default: 0,                   desc: '保存时间戳（毫秒）' },
  day:           { type: 'number', default: 1,                   desc: '保存时的游戏天数' },
  credits:       { type: 'number', default: 1000,                desc: '保存时积分' },
  currentSystem: { type: 'string', default: 'sol_prime',         desc: '保存时所在星球' },
  difficulty:    { type: 'string', default: 'normal',            desc: '保存时难度' },
  companyName:   { type: 'string', default: '星际信使贸易公司',   desc: '保存时公司名称' },
  isAutosave:    { type: 'boolean', default: false,              desc: '是否自动存档' },
};

/**
 * 存档状态字段契约 — 唯一真理来源
 * 每增减字段必须同步更新此清单和 SAVE_SCHEMA_VERSION。
 * @type {Object<string, { type: string, default: *, since: number, desc: string }>}
 */
export const SAVE_STATE_SCHEMA = {
  // ---- 核心字段 (v1) ----
  companyName:        { type: 'string',  default: '星际信使贸易公司', since: 1, desc: '公司名称' },
  credits:            { type: 'number',  default: 1000,               since: 1, desc: '当前积分' },
  difficulty:         { type: 'string',  default: 'normal',           since: 1, desc: '难度 easy/normal/hard' },
  day:                { type: 'number',  default: 1,                  since: 1, desc: '游戏天数' },
  currentSystem:      { type: 'string',  default: 'sol_prime',        since: 1, desc: '当前星球 ID' },
  currentGalaxy:      { type: 'string',  default: 'milky_way',        since: 1, desc: '当前星系 ID' },
  viewingGalaxy:      { type: 'string',  default: 'milky_way',        since: 1, desc: '查看中星系 ID' },
  mapView:            { type: 'string',  default: 'planets',          since: 1, desc: '地图视图模式' },
  cargo:              { type: 'object',  default: {},                 since: 1, desc: '货舱 {goodId:qty}' },
  cargoCost:          { type: 'object',  default: {},                 since: 1, desc: '货舱成本追踪' },
  maxCargo:           { type: 'number',  default: 20,                 since: 1, desc: '最大货舱' },
  fuel:               { type: 'number',  default: 100,                since: 1, desc: '当前燃料' },
  maxFuel:            { type: 'number',  default: 100,                since: 1, desc: '最大燃料' },
  fuelEfficiency:     { type: 'number',  default: 1.0,                since: 1, desc: '燃料效率' },
  purchasedUpgrades:  { type: 'array',   default: [],                 since: 1, desc: '已购升级 ID 列表' },
  shipHull:           { type: 'number',  default: 100,                since: 1, desc: '船体生命值' },
  maxHull:            { type: 'number',  default: 100,                since: 1, desc: '最大船体' },
  autoRepair:         { type: 'number',  default: 0,                  since: 1, desc: '自动修复值' },
  factionRelations:   { type: 'object',  default: null,               since: 1, desc: '派系关系' },
  reputation:         { type: 'number',  default: 0,                  since: 1, desc: '声望' },
  researchedTechs:    { type: 'array',   default: [],                 since: 1, desc: '已研究科技' },
  currentResearch:    { type: 'object',  default: null,               since: 1, desc: '当前研究' },
  researchQueue:      { type: 'array',   default: [],                 since: 1, desc: '研究队列' },
  researchOptions:    { type: 'array',   default: [],                 since: 1, desc: '可选研究' },
  techBuyDiscount:    { type: 'number',  default: 0,                  since: 1, desc: '科技买入折扣' },
  techSellBonus:      { type: 'number',  default: 0,                  since: 1, desc: '科技卖出加价' },
  tradeCount:         { type: 'number',  default: 0,                  since: 1, desc: '交易次数' },
  totalProfit:        { type: 'number',  default: 0,                  since: 1, desc: '累计利润' },
  maxSingleProfit:    { type: 'number',  default: 0,                  since: 1, desc: '单笔最大利润' },
  goodsTraded:        { type: 'object',  default: {},                 since: 1, desc: '商品交易统计' },
  totalEvents:        { type: 'number',  default: 0,                  since: 1, desc: '事件总次数' },
  daysWithoutDamage:  { type: 'number',  default: 0,                  since: 1, desc: '连续无伤天数' },
  playerLevel:        { type: 'number',  default: 1,                  since: 1, desc: '玩家等级' },
  experience:         { type: 'number',  default: 0,                  since: 1, desc: '经验值' },
  companyLevel:       { type: 'number',  default: 1,                  since: 1, desc: '公司等级' },
  companyExperience:  { type: 'number',  default: 0,                  since: 1, desc: '公司经验' },
  questPhase:         { type: 'number',  default: 1,                  since: 1, desc: '任务章节' },
  quests:             { type: 'array',   default: [],                 since: 1, desc: '活跃任务' },
  completedQuests:    { type: 'array',   default: [],                 since: 1, desc: '已完成任务 ID' },
  achievements:       { type: 'array',   default: [],                 since: 1, desc: '已解锁成就 ID' },
  fleet:              { type: 'array',   default: [],                 since: 1, desc: '船只实例数组' },
  activeShipIndex:    { type: 'number',  default: 0,                  since: 1, desc: '当前操控船只索引' },
  fleetSlots:         { type: 'number',  default: 1,                  since: 1, desc: '已购席位数' },
  visitedSystems:     { type: 'array',   default: ['sol_prime'],      since: 1, desc: '已访问星球' },
  visitedGalaxies:    { type: 'array',   default: ['milky_way'],      since: 1, desc: '已访问星系' },
  // ---- v2 新增 ----
  _pendingChainEvents:{ type: 'array',   default: [],                 since: 2, desc: '待触发事件链' },
  economyCycle:       { type: 'object',  default: null,               since: 2, desc: '经济周期状态' },
  // ---- v3 新增 ----
  smugglingStats:     { type: 'object',  default: { caught: 0, evaded: 0, finesPaid: 0, blackMarketTrades: 0 }, since: 3, desc: '走私统计' },
  // ---- v4 新增 ----
  crewRoster:         { type: 'array',   default: [],                 since: 4, desc: '已雇佣船员列表' },
  crewCounter:        { type: 'number',  default: 1,                  since: 4, desc: '船员实例自增编号' },
  // ---- v5 新增 ----
  crewMarket:         { type: 'object',  default: {},                 since: 5, desc: '各星球人才市场缓存' },
  // ---- v6 新增 ----
  _eventCooldowns:    { type: 'object',  default: {},                 since: 6, desc: '随机事件冷却状态' },
  _eventHistory:      { type: 'array',   default: [],                 since: 6, desc: '随机事件历史记录' },
  // ---- v7 新增 ----
  tradeStations:      { type: 'object',  default: {},                 since: 7, desc: '已建设贸易站 {systemId: stationState}' },
  // ---- v8 新增 ----
  creditRating:       { type: 'number',  default: 620,                since: 8, desc: '信用评级 300-850' },
  loans:              { type: 'array',   default: [],                 since: 8, desc: '银行贷款列表' },
  stockPortfolio:     { type: 'object',  default: {},                 since: 8, desc: '股票持仓 {stockId: holding}' },
  stockMarket:        { type: 'object',  default: {},                 since: 8, desc: '股票市场快照 {stockId: quote}' },
  tradeInvestments:   { type: 'object',  default: {},                 since: 8, desc: '贸易站金融投资 {systemId: position}' },
  insurancePolicies:  { type: 'object',  default: {},                 since: 8, desc: '生效中的保险保单 {policyType: policy}' },
  insuranceClaims:    { type: 'array',   default: [],                 since: 8, desc: '保险理赔申请列表' },
  financeLastProcessedDay: { type: 'number', default: 1,              since: 8, desc: '金融系统最后结算天数' },
};

/**
 * 仅在运行时存在、不入存档的字段
 */
export const RUNTIME_ONLY_FIELDS = ['hoveredSystem'];

export const PERSISTED_STATE_DEFAULTS = createPersistedState();

/**
 * 初始游戏状态 — 由 SAVE_STATE_SCHEMA 自动生成
 * 新增字段只需修改 SAVE_STATE_SCHEMA，此处自动同步
 */
export const INITIAL_STATE = createInitialState();

export function createInitialState(overrides) {
  return _createState(true, overrides);
}

export function createPersistedState(overrides) {
  return _createState(false, overrides);
}

export function createSaveMeta(slotId, state, options) {
  options = options || {};
  var snapshot = state && typeof state === 'object' ? state : PERSISTED_STATE_DEFAULTS;
  var actualSlotId = _normalizeSlotId(slotId);
  var isAutosave = actualSlotId === 0 || actualSlotId === '0';

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: GAME_VERSION,
    slotId: actualSlotId,
    saveName: options.saveName || (isAutosave ? '自动存档' : '手动存档 ' + actualSlotId),
    timestampMs: typeof options.timestampMs === 'number' ? options.timestampMs : Date.now(),
    day: typeof snapshot.day === 'number' ? snapshot.day : SAVE_META_SCHEMA.day.default,
    credits: typeof snapshot.credits === 'number' ? snapshot.credits : SAVE_META_SCHEMA.credits.default,
    currentSystem: typeof snapshot.currentSystem === 'string' && snapshot.currentSystem
      ? snapshot.currentSystem
      : SAVE_META_SCHEMA.currentSystem.default,
    difficulty: typeof snapshot.difficulty === 'string' && snapshot.difficulty
      ? snapshot.difficulty
      : SAVE_META_SCHEMA.difficulty.default,
    companyName: typeof snapshot.companyName === 'string' && snapshot.companyName
      ? snapshot.companyName
      : SAVE_META_SCHEMA.companyName.default,
    isAutosave: isAutosave,
  };
}

function _createState(includeRuntimeFields, overrides) {
  const state = {};
  Object.keys(SAVE_STATE_SCHEMA).forEach(function (key) {
    state[key] = _cloneValue(SAVE_STATE_SCHEMA[key].default);
  });

  if (includeRuntimeFields) {
    RUNTIME_ONLY_FIELDS.forEach(function (field) {
      state[field] = null;
    });
  }

  if (overrides && typeof overrides === 'object') {
    Object.keys(overrides).forEach(function (key) {
      state[key] = _cloneValue(overrides[key]);
    });
  }

  return state;
}

function _cloneValue(value) {
  return (value !== null && typeof value === 'object')
    ? JSON.parse(JSON.stringify(value))
    : value;
}

function _normalizeSlotId(slotId) {
  if (Number.isInteger(slotId) && slotId >= 0) return slotId;
  if (typeof slotId === 'string' && slotId.length > 0) {
    if (/^\d+$/.test(slotId)) return Number(slotId);
    return slotId;
  }
  return SAVE_META_SCHEMA.slotId.default;
}
