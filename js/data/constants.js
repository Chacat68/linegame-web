// js/data/constants.js — 游戏全局常量与初始状态
// 依赖：无
// 导出：INITIAL_STATE, DIFFICULTY_LEVELS
// 注意：VICTORY_NET_WORTH 为孤立常量（从未被使用），胜利条件由 js/data/victoryConditions.js 实现。

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

export const INITIAL_STATE = {
  companyName:       '星际信使贸易公司',
  credits:           1000,
  difficulty:        'normal',  // 难度：easy / normal / hard
  day:               1,
  currentSystem:     'sol_prime',
  currentGalaxy:     'milky_way',
  viewingGalaxy:     'milky_way',
  mapView:           'planets',   // 'planets' | 'galaxies'
  cargo:             {},   // { goodId: quantity }
  cargoCost:         {},   // { goodId: totalCostPaid } 成本追踪
  maxCargo:          20,
  fuel:              100,
  maxFuel:           100,
  fuelEfficiency:    1.0,
  purchasedUpgrades: [],
  hoveredSystem:     null,

  // 船体系统
  shipHull:          100,
  maxHull:           100,
  autoRepair:        0,

  // 派系关系
  factionRelations:  null,  // 由 FactionSystem.init 填充

  // 声望
  reputation:        0,

  // 科技研究
  researchedTechs:   [],
  currentResearch:   null,
  researchQueue:     [],
  researchOptions:   [],
  techBuyDiscount:   0,
  techSellBonus:     0,

  // 统计
  tradeCount:        0,
  totalProfit:       0,
  maxSingleProfit:   0,
  goodsTraded:       {},     // { goodId: totalQuantity }
  totalEvents:       0,      // 随机事件总次数
  daysWithoutDamage: 0,      // 连续未受伤天数

  // 玩家等级
  playerLevel:       1,
  experience:        0,

  // 公司等级
  companyLevel:      1,
  companyExperience: 0,

  // 任务
  questPhase:        1,      // 当前任务章节
  quests:            [],     // 当前活跃任务
  completedQuests:   [],     // 已完成任务 ID 列表

  // 成就
  achievements:      [],     // 已解锁成就 ID 列表

  // 船队
  fleet:             [],     // 船只实例数组，由 FleetSystem.init 填充
  activeShipIndex:   0,      // 当前操控的船只索引
  fleetSlots:        1,      // 已购买的席位数量（初始 1 个）

  // 探索追踪
  visitedSystems:    ['sol_prime'],   // 已访问星球 ID
  visitedGalaxies:   ['milky_way'],   // 已访问星系 ID

  // 事件链追踪
  _pendingChainEvents: [],   // 待触发的事件链后续

  // 经济周期状态（由 Economy 系统管理）
  economyCycle:      null,
};
