// js/data/quests.js — 任务定义（群星参考）
// 依赖：无
// 导出：QUESTS, QUEST_TYPES

export const QUEST_TYPES = {
  delivery:   { name: '运输任务', icon: '📦', color: '#4fc3f7' },
  trade:      { name: '贸易任务', icon: '💰', color: '#FFD700' },
  explore:    { name: '探索任务', icon: '🔭', color: '#66BB6A' },
  faction:    { name: '派系任务', icon: '🏛️', color: '#CE93D8' },
  special:    { name: '特殊任务', icon: '⚡', color: '#FF9800' },
};

/**
 * 任务池（随机抽取）
 * 每个任务定义：
 *   id, name, type, description,
 *   objectives: [{ type, target, amount, current }]
 *   rewards: { credits, exp, reputation, items? }
 *   timeLimit: 天数限制（0=无限）
 *   minLevel: 最低玩家等级
 *   factionId: 关联派系（可选）
 */
export const QUESTS = [
  // ========== 运输任务 ==========
  {
    id: 'deliver_food_war', name: '前线补给',
    type: 'delivery',
    description: '战争前线急需粮食！将 5 单位食物运送到战争前线。',
    objectives: [{ type: 'deliver', goodId: 'food', targetSystem: 'war_front', amount: 5, current: 0 }],
    rewards: { credits: 800, exp: 30, reputation: 10 },
    timeLimit: 10,
    minLevel: 1,
  },
  {
    id: 'deliver_medicine_medical', name: '疫情救援',
    type: 'delivery',
    description: '医疗中枢的药物库存告急，紧急运送 3 单位药品。',
    objectives: [{ type: 'deliver', goodId: 'medicine', targetSystem: 'medical_hub', amount: 3, current: 0 }],
    rewards: { credits: 600, exp: 25, reputation: 8 },
    timeLimit: 8,
    minLevel: 1,
  },
  {
    id: 'deliver_tech_nova', name: '科研设备交付',
    type: 'delivery',
    description: '新北京站需要 4 单位高科技物资来完成研究项目。',
    objectives: [{ type: 'deliver', goodId: 'technology', targetSystem: 'nova_station', amount: 4, current: 0 }],
    rewards: { credits: 1200, exp: 40, reputation: 12 },
    timeLimit: 12,
    minLevel: 2,
  },
  {
    id: 'deliver_luxury_port', name: '奢侈品订单',
    type: 'delivery',
    description: '奢华港的贵族订购了 6 单位奢侈品，利润丰厚。',
    objectives: [{ type: 'deliver', goodId: 'luxury', targetSystem: 'luxury_port', amount: 6, current: 0 }],
    rewards: { credits: 2000, exp: 50, reputation: 15 },
    timeLimit: 15,
    minLevel: 3,
  },

  // ========== 贸易任务 ==========
  {
    id: 'trade_profit_1000', name: '商业起步',
    type: 'trade',
    description: '通过贸易累计赚取 1000 积分利润。',
    objectives: [{ type: 'earn_profit', amount: 1000, current: 0 }],
    rewards: { credits: 500, exp: 20, reputation: 5 },
    timeLimit: 0,
    minLevel: 1,
  },
  {
    id: 'trade_10_times', name: '十次交易',
    type: 'trade',
    description: '完成 10 次贸易交易（买入或卖出）。',
    objectives: [{ type: 'trade_count', amount: 10, current: 0 }],
    rewards: { credits: 300, exp: 15, reputation: 5 },
    timeLimit: 0,
    minLevel: 1,
  },
  {
    id: 'trade_minerals_bulk', name: '矿石大亨',
    type: 'trade',
    description: '累计交易 20 单位矿石。',
    objectives: [{ type: 'trade_good', goodId: 'minerals', amount: 20, current: 0 }],
    rewards: { credits: 1000, exp: 35, reputation: 10 },
    timeLimit: 0,
    minLevel: 2,
  },

  // ========== 探索任务 ==========
  {
    id: 'explore_3_systems', name: '星际旅行者',
    type: 'explore',
    description: '造访 3 个不同的星系。',
    objectives: [{ type: 'visit_systems', amount: 3, current: 0, visited: [] }],
    rewards: { credits: 400, exp: 25, reputation: 8 },
    timeLimit: 0,
    minLevel: 1,
  },
  {
    id: 'explore_all_systems', name: '银河探索者',
    type: 'explore',
    description: '造访所有 10 个星系。',
    objectives: [{ type: 'visit_systems', amount: 10, current: 0, visited: [] }],
    rewards: { credits: 3000, exp: 100, reputation: 30 },
    timeLimit: 0,
    minLevel: 2,
  },
  {
    id: 'explore_shadow', name: '暗影之旅',
    type: 'explore',
    description: '前往法外之地暗影港湾，看看那里有什么……',
    objectives: [{ type: 'visit_system', targetSystem: 'shadow_haven', current: 0 }],
    rewards: { credits: 500, exp: 20, reputation: 5 },
    timeLimit: 0,
    minLevel: 1,
  },

  // ========== 派系任务 ==========
  {
    id: 'faction_fed_trade', name: '联邦贸易合约',
    type: 'faction',
    description: '在银河联邦控制的星系完成 5 次贸易。',
    objectives: [{ type: 'faction_trade', factionId: 'galactic_federation', amount: 5, current: 0 }],
    rewards: { credits: 1500, exp: 40, reputation: 15 },
    timeLimit: 20,
    minLevel: 2,
    factionId: 'galactic_federation',
  },
  {
    id: 'faction_syndicate_sell', name: '辛迪加走私',
    type: 'faction',
    description: '在星际辛迪加的星系卖出 8 单位武器。',
    objectives: [{ type: 'sell_in_faction', factionId: 'stellar_syndicate', goodId: 'weapons', amount: 8, current: 0 }],
    rewards: { credits: 2000, exp: 50, reputation: 20 },
    timeLimit: 25,
    minLevel: 3,
    factionId: 'stellar_syndicate',
  },
  {
    id: 'faction_tech_research', name: '科技共同体研究',
    type: 'faction',
    description: '在科技共同体区域内卖出 6 单位科技产品。',
    objectives: [{ type: 'sell_in_faction', factionId: 'tech_commonwealth', goodId: 'technology', amount: 6, current: 0 }],
    rewards: { credits: 1800, exp: 45, reputation: 18 },
    timeLimit: 20,
    minLevel: 2,
    factionId: 'tech_commonwealth',
  },

  // ========== 特殊任务 ==========
  {
    id: 'special_crystal_minerals', name: '冰晶矿脉',
    type: 'special',
    description: '收集来自冰晶行星的矿石并运至银河帝都，高额回报。',
    objectives: [
      { type: 'buy_at', goodId: 'minerals', targetSystem: 'crystal_planet', amount: 8, current: 0 },
      { type: 'deliver', goodId: 'minerals', targetSystem: 'imperial_capital', amount: 8, current: 0 },
    ],
    rewards: { credits: 3500, exp: 80, reputation: 25 },
    timeLimit: 20,
    minLevel: 3,
  },
  {
    id: 'special_water_crisis', name: '水资源危机',
    type: 'special',
    description: '战争前线缺水严重，运送 10 单位水资源并在 8 天内完成。',
    objectives: [{ type: 'deliver', goodId: 'water', targetSystem: 'war_front', amount: 10, current: 0 }],
    rewards: { credits: 2500, exp: 60, reputation: 20 },
    timeLimit: 8,
    minLevel: 2,
  },
];
