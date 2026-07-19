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
    // 公开市场保留明确的买卖价差。中后期议价加成会吃掉部分价差，
    // 但不能把同一节点变成无风险的原地倒卖机。
    buyMultiplier: 1.12,
    sellMultiplier: 0.92,
    minimumPrice: 1,
    sellTaxBase: 2.0,
    // 压缩星球产业倍率与短期供需噪声，避免公开市场出现常态化的翻倍套利。
    // 星球差异仍决定路线方向，但需要叠加情报、风险或事件才能进入 40%+ 回报区。
    systemPriceExponent: 0.18,
    dynamicPriceExponent: 0.28,
    starterMarketGuard: {
      // 保护只跟已完成的交易动作有关，不再因为一笔大单中途升级而突然退出。
      maxTradeCount: 11,
      startExponent: 0.45,
      endExponent: 0.98,
    },
    buyAdjustmentOrder: ['factionTax', 'techBuyDiscount', 'fleetTradeBonus'],
    sellAdjustmentOrder: ['factionTax', 'techSellBonus', 'fleetTradeBonus'],
    negotiation: {
      // 科技、舰船、船员、派系和长期路线共享同一份价格优惠空间。
      // 前 10% 保持线性，之后收益递减并渐近 17%，避免加成叠满后全市场稳赚。
      linearCombinedAdvantage: 0.10,
      maxCombinedAdvantage: 0.17,
      factionTaxSensitivity: 0.25,
    },
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
    // 同一星球、同一天共享一份报价。买卖价差保证本地倒手必亏，
    // 真正的利润来自跨星球运输，并与入港检查风险对应。
    buySpread: 1.12,
    sellSpread: 0.88,
    dailyVolatility: 0.22,
    restrictedValuePremium: 1.25,
    illegalValuePremium: 1.50,
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
    basePerSqrtUnit: 0.6,
    likedMultiplier: 1.5,
    sellMultiplier: 1.2,
    blackMarketMultiplier: 0.5,
    maxGainPerTrade: 8,
    friendlyDiminishing: 0.75,
    alliedDiminishing: 0.5,
  },
};

export const PROGRESSION_CONFIG = {
  routeAnnouncementPreviewLimit: 5,
  levelPerks: {
    3:  { type: 'sellBonus', value: 0.03, message: '✨ 等级奖励：卖价加成 +3%' },
    4:  { type: 'cargo', value: 5, message: '✨ 等级奖励：所有船只有效货舱容量 +5' },
    5:  { type: 'buyDiscount', value: 0.03, message: '✨ 等级奖励：买价优惠 +3%' },
    6:  { type: 'fuelEfficiencyMultiplier', value: 0.9, message: '✨ 等级奖励：所有船只燃料效率 +10%' },
    7:  { type: 'factionBonus', value: 10, message: '✨ 等级奖励：所有派系好感 +10' },
    8:  { type: 'cargo', value: 10, message: '✨ 等级奖励：所有船只有效货舱容量 +10' },
    9:  { type: 'sellBonus', value: 0.05, message: '✨ 等级奖励：卖价加成 +5%' },
    10: {
      type: 'composite',
      cargo: 10,
      maxFuel: 20,
      buyDiscount: 0.05,
      sellBonus: 0.05,
      message: '✨ 银河商业帝皇加冕！所有船只获得永久货舱与燃料上限提升！',
    },
  },
};

export const EVENT_CONFIG = {
  baseChance: 0.12,
  cooldownDays: 10,
  modifiers: {
    deepScannerChanceMultiplier: 1.25,
  },
  history: {
    maxEntries: 30,
  },
  chain: {
    defaultDelay: 3,
  },
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
  pacing: {
    // 新手期适度降频，避免连续被打断学习主循环。
    newPlayerGraceDays: 4,
    newPlayerChanceMod: 0.25,
    // 防止旅行后连续数天都弹事件。
    minDaysBetweenEvents: 3,
    // 近期刚触发过事件时继续降权，形成更平滑节奏。
    recentEventWindowDays: 5,
    recentEventChanceMod: 0.4,
    // 短周期硬上限，避免事件过密。
    rollingWindowDays: 10,
    maxEventsInRollingWindow: 2,
    // 事件触发后保证 N 次旅行绝对安静（不靠概率，硬性屏蔽）。
    quietTripsAfterEvent: 3,
  },
};

export const TUTORIAL_CONFIG = {
  completionStorageKey: 'tutorial_completed',
};

export const TIME_CONFIG = {
  realtimeDayDurationMs: 60 * 1000,
  availableRealtimeDayDurationsMs: [30 * 1000, 60 * 1000, 180 * 1000],
};

export const SAVE_SCHEMA_VERSION = 16;
export const GAME_VERSION = '0.6.4';

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
  factionRelations:   { type: 'object',  default: {},                 since: 1, desc: '派系关系' },
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
  smugglingStats:     { type: 'object',  default: {
    caught: 0,
    evaded: 0,
    finesPaid: 0,
    blackMarketTrades: 0,
    riskedArrivals: 0,
    protectedArrivals: 0,
    confiscatedCostBasis: 0,
    hullDamage: 0,
    blackMarketBuyCost: 0,
    blackMarketSellRevenue: 0,
    blackMarketRealizedProfit: 0,
  }, since: 3, desc: '走私风险与黑市实际盈亏统计' },
  // ---- v4 新增 ----
  crewRoster:         { type: 'array',   default: [],                 since: 4, desc: '已雇佣船员列表' },
  crewCounter:        { type: 'number',  default: 1,                  since: 4, desc: '船员实例自增编号' },
  // ---- v5 新增 ----
  crewMarket:         { type: 'object',  default: {},                 since: 5, desc: '各星球人才市场缓存' },
  // ---- v6 新增 ----
  _eventCooldowns:    { type: 'object',  default: {},                 since: 6, desc: '随机事件冷却状态' },
  _eventHistory:      { type: 'array',   default: [],                 since: 6, desc: '随机事件历史记录' },
  _activeEventId:     { type: 'string',  default: '',                 since: 16, desc: '尚未处置的随机事件 ID' },
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
  // ---- v9 新增 ----
  futuresContracts:        { type: 'array',   default: [],                 since: 9, desc: '期货合约列表' },
  futuresLastProcessedDay: { type: 'number',  default: 1,                  since: 9, desc: '期货系统最后结算天数' },
  // ---- v10 新增 ----
  galaxyStates:            { type: 'object',  default: {},                 since: 10, desc: '星系数据层状态 {planetId: planetState}' },
  _tripsSinceLastEvent:    { type: 'number',  default: 999,                since: 10, desc: '上次事件后旅行次数（静默期）' },
  // ---- v11 新增 ----
  storyFlags:              { type: 'object',  default: {},                 since: 11, desc: '轻量剧情/对话触发记录 {sceneId: seenDay}' },
  // ---- v12 新增 ----
  storyDecisions:          { type: 'object',  default: {},                 since: 12, desc: '轻量剧情对话选择记录 {sceneId: choiceId}' },
  // ---- v13 新增 ----
  companyDirectiveClaims:  { type: 'object',  default: {},                 since: 13, desc: '公司指令奖励领取记录 {claimId: claimMeta}' },
  // ---- v14 新增 ----
  economyMarketState:      { type: 'object',  default: null,               since: 14, desc: '完整市场快照（周期、供需、波动与价格历史）' },
  // ---- v15 新增 ----
  balanceMetrics:          { type: 'object',  default: {
    firstTrade: null,
    continuedAfterTenMinutes: false,
    continuationDay: null,
    lastActivity: null,
    trade: {
      actions: 0,
      buyActions: 0,
      sellActions: 0,
      realizedProfit: 0,
      realizedProfitByGood: {},
    },
    routes: {},
  }, since: 15, desc: '仅保存在本地的设计验收统计（首单、商品利润与长期路线时长）' },
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
