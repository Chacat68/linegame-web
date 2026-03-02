// js/data/constants.js — 游戏全局常量与初始状态
// 依赖：无
// 导出：INITIAL_STATE, VICTORY_NET_WORTH

export const VICTORY_NET_WORTH = 50000;

export const INITIAL_STATE = {
  companyName:       '星际信使贸易公司',
  credits:           1000,
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
};
