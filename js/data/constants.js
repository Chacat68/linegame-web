// js/data/constants.js — 游戏全局常量与初始状态
// 依赖：无
// 导出：INITIAL_STATE, DIFFICULTY_LEVELS, SAVE_STATE_SCHEMA
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
    damageMod: 0.6,            // 受损减少 40%
    rewardMod: 1.2,            // 奖励增加 20%
  },
  normal: {
    id: 'normal', name: '标准模式', icon: '⚖️',
    description: '平衡的游戏体验，推荐首次游玩。',
    startCredits: 1000,
    priceVolatility: 1.0,
    eventChanceMod: 1.0,
    damageMod: 1.0,
    rewardMod: 1.0,
  },
  hard: {
    id: 'hard', name: '挑战模式', icon: '🔥',
    description: '更少的初始资金，剧烈的经济波动，更频繁的危险事件。',
    startCredits: 500,
    priceVolatility: 1.3,      // 价格波动幅度增加 30%
    eventChanceMod: 1.3,       // 事件概率增加
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
    depthScaleFactor: 1.0,    // 交易量/市场深度 的影响缩放
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

/**
 * 存档状态字段契约 — 唯一真理来源
 * 每增减字段必须同步更新此清单和 SCHEMA_VERSION（在 SaveSystem.js）
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
};

/**
 * 仅在运行时存在、不入存档的字段
 */
export const RUNTIME_ONLY_FIELDS = ['hoveredSystem'];

/**
 * 初始游戏状态 — 由 SAVE_STATE_SCHEMA 自动生成
 * 新增字段只需修改 SAVE_STATE_SCHEMA，此处自动同步
 */
export const INITIAL_STATE = _buildInitialState();

function _buildInitialState() {
  const state = {};
  Object.keys(SAVE_STATE_SCHEMA).forEach(function (key) {
    var def = SAVE_STATE_SCHEMA[key].default;
    // 深拷贝引用类型防止共享
    state[key] = (def !== null && typeof def === 'object')
      ? JSON.parse(JSON.stringify(def))
      : def;
  });
  // 追加运行时专用字段（不入存档）
  state.hoveredSystem = null;
  return state;
}
