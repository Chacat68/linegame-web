// js/data/quests.js — 任务定义（按游戏进度分阶段解锁）
// 依赖：无
// 导出：QUESTS, QUEST_TYPES, QUEST_PHASES

export const QUEST_TYPES = {
  delivery:   { name: '运输任务', icon: '📦', color: '#4fc3f7' },
  trade:      { name: '贸易任务', icon: '💰', color: '#FFD700' },
  explore:    { name: '探索任务', icon: '🔭', color: '#66BB6A' },
  faction:    { name: '派系任务', icon: '🏛️', color: '#CE93D8' },
  special:    { name: '特殊任务', icon: '⚡', color: '#FF9800' },
};

/**
 * 游戏进度阶段定义
 * 每个阶段对应主要的游戏进程，任务按阶段逐步开放
 */
export const QUEST_PHASES = [
  {
    id: 'phase_1',
    name: '第一章：启航',
    description: '初入星际，学习基本的贸易和航行。',
    icon: '🌱',
    levelRange: [1, 2],
  },
  {
    id: 'phase_2',
    name: '第二章：立足',
    description: '拓展贸易网络，积累资本与经验。',
    icon: '🚢',
    levelRange: [2, 3],
  },
  {
    id: 'phase_3',
    name: '第三章：崛起',
    description: '接触各大派系，建立声望与影响力。',
    icon: '⭐',
    levelRange: [3, 5],
  },
  {
    id: 'phase_4',
    name: '第四章：称霸',
    description: '挑战高难度跨星系任务，成为银河巨贾。',
    icon: '💫',
    levelRange: [5, 7],
  },
  {
    id: 'phase_5',
    name: '第五章：传奇',
    description: '完成传奇级壮举，缔造商业帝国的终极荣耀。',
    icon: '👑',
    levelRange: [7, 10],
  },
];

/**
 * 任务池（按进度阶段解锁）
 * 每个任务定义：
 *   id, name, type, description,
 *   objectives: [{ type, target, amount, current }]
 *   rewards: { credits, exp, reputation, items? }
 *   timeLimit: 天数限制（0=无限）
 *   minLevel: 最低玩家等级
 *   phase: 所属进度阶段 (1-5)
 *   prerequisites: 前置任务ID列表（需全部完成才能解锁）
 *   unlockConditions: { 额外解锁条件 }
 *     - minTradeCount: 最低交易次数
 *     - minVisitedSystems: 最低访问星球数
 *     - minReputation: 最低声望值
 *     - minTotalProfit: 最低累计利润
 *     - requiredFactionRelation: { factionId, minRelation }
 *   factionId: 关联派系（可选）
 */
export const QUESTS = [

  // ============================================================
  //  第一章：启航 (phase 1, Lv 1-2)
  //  新手入门任务，教会玩家基本操作
  // ============================================================

  // --- 1.1 新手引导线 ---
  {
    id: 'starter_first_trade', name: '初次交易',
    type: 'trade', phase: 1,
    description: '在任意星球完成你的第一笔交易——买或卖皆可。万事开头难！',
    objectives: [{ type: 'trade_count', amount: 1, current: 0 }],
    rewards: { credits: 200, exp: 15, reputation: 3 },
    timeLimit: 0,
    minLevel: 1,
    prerequisites: [],
    unlockConditions: {},
  },
  {
    id: 'starter_earn_500', name: '商业起步',
    type: 'trade', phase: 1,
    description: '通过贸易累计赚取 500 积分利润。学会买低卖高！',
    objectives: [{ type: 'earn_profit', amount: 500, current: 0 }],
    rewards: { credits: 300, exp: 20, reputation: 5 },
    timeLimit: 0,
    minLevel: 1,
    prerequisites: ['starter_first_trade'],
    unlockConditions: {},
  },
  {
    id: 'starter_visit_2', name: '初探宇宙',
    type: 'explore', phase: 1,
    description: '造访 2 个不同的星球，了解银河的广阔。',
    objectives: [{ type: 'visit_systems', amount: 2, current: 0, visited: [] }],
    rewards: { credits: 250, exp: 15, reputation: 3 },
    timeLimit: 0,
    minLevel: 1,
    prerequisites: [],
    unlockConditions: {},
  },
  {
    id: 'starter_deliver_food', name: '前线补给',
    type: 'delivery', phase: 1,
    description: '战争前线急需粮食！将 5 单位食物运送到战争前线。',
    objectives: [{ type: 'deliver', goodId: 'food', targetSystem: 'war_front', amount: 5, current: 0 }],
    rewards: { credits: 800, exp: 30, reputation: 10 },
    timeLimit: 10,
    minLevel: 1,
    prerequisites: ['starter_visit_2'],
    unlockConditions: {},
  },
  {
    id: 'starter_deliver_medicine', name: '疫情救援',
    type: 'delivery', phase: 1,
    description: '医疗中枢的药物库存告急，紧急运送 3 单位药品。',
    objectives: [{ type: 'deliver', goodId: 'medicine', targetSystem: 'medical_hub', amount: 3, current: 0 }],
    rewards: { credits: 600, exp: 25, reputation: 8 },
    timeLimit: 8,
    minLevel: 1,
    prerequisites: ['starter_first_trade'],
    unlockConditions: {},
  },
  {
    id: 'starter_5_trades', name: '五连交易',
    type: 'trade', phase: 1,
    description: '完成 5 次贸易交易，积累实战经验。',
    objectives: [{ type: 'trade_count', amount: 5, current: 0 }],
    rewards: { credits: 300, exp: 20, reputation: 5 },
    timeLimit: 0,
    minLevel: 1,
    prerequisites: ['starter_first_trade'],
    unlockConditions: {},
  },

  // --- 1.2 初级探索线 ---
  {
    id: 'starter_explore_shadow', name: '暗影之旅',
    type: 'explore', phase: 1,
    description: '前往法外之地暗影港湾，看看那里有什么……',
    objectives: [{ type: 'visit_system', targetSystem: 'shadow_haven', current: 0 }],
    rewards: { credits: 500, exp: 20, reputation: 5 },
    timeLimit: 0,
    minLevel: 1,
    prerequisites: ['starter_visit_2'],
    unlockConditions: {},
  },

  // ============================================================
  //  第二章：立足 (phase 2, Lv 2-3)
  //  扩大贸易规模，接触更远的星球
  // ============================================================

  // --- 2.1 贸易扩展线 ---
  {
    id: 'expand_profit_1000', name: '千金利润',
    type: 'trade', phase: 2,
    description: '通过贸易累计赚取 1,000 积分利润。你的名声开始传播。',
    objectives: [{ type: 'earn_profit', amount: 1000, current: 0 }],
    rewards: { credits: 500, exp: 25, reputation: 8 },
    timeLimit: 0,
    minLevel: 2,
    prerequisites: ['starter_earn_500'],
    unlockConditions: {},
  },
  {
    id: 'expand_10_trades', name: '十次交易',
    type: 'trade', phase: 2,
    description: '完成 10 次贸易交易，你已是一名经验丰富的商人。',
    objectives: [{ type: 'trade_count', amount: 10, current: 0 }],
    rewards: { credits: 500, exp: 25, reputation: 8 },
    timeLimit: 0,
    minLevel: 2,
    prerequisites: ['starter_5_trades'],
    unlockConditions: {},
  },
  {
    id: 'expand_minerals_bulk', name: '矿石大亨',
    type: 'trade', phase: 2,
    description: '累计交易 20 单位矿石，成为矿产领域的行家。',
    objectives: [{ type: 'trade_good', goodId: 'minerals', amount: 20, current: 0 }],
    rewards: { credits: 1000, exp: 35, reputation: 10 },
    timeLimit: 0,
    minLevel: 2,
    prerequisites: ['expand_profit_1000'],
    unlockConditions: {},
  },

  // --- 2.2 运输升级线 ---
  {
    id: 'expand_deliver_tech', name: '科研设备交付',
    type: 'delivery', phase: 2,
    description: '新北京站需要 4 单位高科技物资来完成研究项目。',
    objectives: [{ type: 'deliver', goodId: 'technology', targetSystem: 'nova_station', amount: 4, current: 0 }],
    rewards: { credits: 1200, exp: 40, reputation: 12 },
    timeLimit: 12,
    minLevel: 2,
    prerequisites: ['starter_deliver_food'],
    unlockConditions: {},
  },
  {
    id: 'expand_deliver_fuel', name: '燃料紧急补给',
    type: 'delivery', phase: 2,
    description: '燃料站储备耗尽，紧急运送 15 单位燃料。',
    objectives: [{ type: 'deliver', goodId: 'fuel', targetSystem: 'fuel_depot', amount: 15, current: 0 }],
    rewards: { credits: 1500, exp: 35, reputation: 12 },
    timeLimit: 10,
    minLevel: 2,
    prerequisites: ['starter_deliver_food'],
    unlockConditions: {},
  },
  {
    id: 'expand_water_crisis', name: '水资源危机',
    type: 'special', phase: 2,
    description: '战争前线缺水严重，运送 10 单位水资源并在 8 天内完成。',
    objectives: [{ type: 'deliver', goodId: 'water', targetSystem: 'war_front', amount: 10, current: 0 }],
    rewards: { credits: 2500, exp: 60, reputation: 20 },
    timeLimit: 8,
    minLevel: 2,
    prerequisites: ['starter_deliver_food'],
    unlockConditions: { minTradeCount: 5 },
  },

  // --- 2.3 探索进阶线 ---
  {
    id: 'expand_explore_3', name: '星际旅行者',
    type: 'explore', phase: 2,
    description: '造访 3 个不同的星系，拓宽你的航线网络。',
    objectives: [{ type: 'visit_systems', amount: 3, current: 0, visited: [] }],
    rewards: { credits: 400, exp: 25, reputation: 8 },
    timeLimit: 0,
    minLevel: 1,
    prerequisites: ['starter_visit_2'],
    unlockConditions: {},
  },
  {
    id: 'expand_explore_5', name: '航线开拓者',
    type: 'explore', phase: 2,
    description: '造访 5 个不同的星球，为贸易打开更广阔的市场。',
    objectives: [{ type: 'visit_systems', amount: 5, current: 0, visited: [] }],
    rewards: { credits: 800, exp: 35, reputation: 10 },
    timeLimit: 0,
    minLevel: 2,
    prerequisites: ['expand_explore_3'],
    unlockConditions: {},
  },

  // ============================================================
  //  第三章：崛起 (phase 3, Lv 3-5)
  //  接触派系，大额贸易，多步骤复杂任务
  // ============================================================

  // --- 3.1 派系入门线 ---
  {
    id: 'rise_fed_trade', name: '联邦贸易合约',
    type: 'faction', phase: 3,
    description: '在银河联邦控制的星系完成 5 次贸易，建立初步信任。',
    objectives: [{ type: 'faction_trade', factionId: 'galactic_federation', amount: 5, current: 0 }],
    rewards: { credits: 1500, exp: 40, reputation: 15 },
    timeLimit: 20,
    minLevel: 2,
    prerequisites: ['expand_10_trades'],
    unlockConditions: {},
    factionId: 'galactic_federation',
  },
  {
    id: 'rise_tech_research', name: '科技共同体研究',
    type: 'faction', phase: 3,
    description: '在科技共同体区域内卖出 6 单位科技产品，展示你的实力。',
    objectives: [{ type: 'sell_in_faction', factionId: 'tech_commonwealth', goodId: 'technology', amount: 6, current: 0 }],
    rewards: { credits: 1800, exp: 45, reputation: 18 },
    timeLimit: 20,
    minLevel: 2,
    prerequisites: ['expand_deliver_tech'],
    unlockConditions: {},
    factionId: 'tech_commonwealth',
  },
  {
    id: 'rise_syndicate_sell', name: '辛迪加走私',
    type: 'faction', phase: 3,
    description: '在星际辛迪加的星系卖出 8 单位武器。危险但利润丰厚。',
    objectives: [{ type: 'sell_in_faction', factionId: 'stellar_syndicate', goodId: 'weapons', amount: 8, current: 0 }],
    rewards: { credits: 2000, exp: 50, reputation: 20 },
    timeLimit: 25,
    minLevel: 3,
    prerequisites: ['starter_explore_shadow'],
    unlockConditions: { minTradeCount: 10 },
    factionId: 'stellar_syndicate',
  },

  // --- 3.2 中级贸易线 ---
  {
    id: 'rise_profit_5000', name: '利润猎手',
    type: 'trade', phase: 3,
    description: '通过贸易累计赚取 5,000 积分利润。你的财富帝国正在成形！',
    objectives: [{ type: 'earn_profit', amount: 5000, current: 0 }],
    rewards: { credits: 2000, exp: 50, reputation: 15 },
    timeLimit: 0,
    minLevel: 3,
    prerequisites: ['expand_profit_1000'],
    unlockConditions: {},
  },
  {
    id: 'rise_50_trades', name: '五十连击',
    type: 'trade', phase: 3,
    description: '完成 50 次贸易交易。交易之路永无止境。',
    objectives: [{ type: 'trade_count', amount: 50, current: 0 }],
    rewards: { credits: 2500, exp: 60, reputation: 15 },
    timeLimit: 0,
    minLevel: 3,
    prerequisites: ['expand_10_trades'],
    unlockConditions: { minTotalProfit: 2000 },
  },

  // --- 3.3 高级运输线 ---
  {
    id: 'rise_deliver_luxury', name: '奢侈品订单',
    type: 'delivery', phase: 3,
    description: '奢华港的贵族订购了 6 单位奢侈品，利润丰厚。',
    objectives: [{ type: 'deliver', goodId: 'luxury', targetSystem: 'luxury_port', amount: 6, current: 0 }],
    rewards: { credits: 2000, exp: 50, reputation: 15 },
    timeLimit: 15,
    minLevel: 3,
    prerequisites: ['expand_deliver_tech'],
    unlockConditions: { minVisitedSystems: 4 },
  },
  {
    id: 'rise_deliver_weapons', name: '军火运输',
    type: 'delivery', phase: 3,
    description: '前线急需武器装备，运送 8 单位武器到战争前线。',
    objectives: [{ type: 'deliver', goodId: 'weapons', targetSystem: 'war_front', amount: 8, current: 0 }],
    rewards: { credits: 3000, exp: 60, reputation: 20 },
    timeLimit: 12,
    minLevel: 3,
    prerequisites: ['expand_deliver_fuel'],
    unlockConditions: { minTradeCount: 15 },
  },

  // --- 3.4 探索深入线 ---
  {
    id: 'rise_explore_10', name: '银河探索者',
    type: 'explore', phase: 3,
    description: '造访所有 10 个核心星球，你已熟知银河系每个角落。',
    objectives: [{ type: 'visit_systems', amount: 10, current: 0, visited: [] }],
    rewards: { credits: 3000, exp: 100, reputation: 30 },
    timeLimit: 0,
    minLevel: 2,
    prerequisites: ['expand_explore_5'],
    unlockConditions: {},
  },
  {
    id: 'rise_explore_20', name: '星图收集者',
    type: 'explore', phase: 3,
    description: '造访 20 个不同的星球，绘制越来越详尽的星际航图。',
    objectives: [{ type: 'visit_systems', amount: 20, current: 0, visited: [] }],
    rewards: { credits: 2000, exp: 60, reputation: 15 },
    timeLimit: 0,
    minLevel: 3,
    prerequisites: ['rise_explore_10'],
    unlockConditions: {},
  },

  // --- 3.5 特殊任务 ---
  {
    id: 'rise_crystal_minerals', name: '冰晶矿脉',
    type: 'special', phase: 3,
    description: '收集来自冰晶行星的矿石并运至银河帝都，高额回报。',
    objectives: [
      { type: 'buy_at', goodId: 'minerals', targetSystem: 'crystal_planet', amount: 8, current: 0 },
      { type: 'deliver', goodId: 'minerals', targetSystem: 'imperial_capital', amount: 8, current: 0 },
    ],
    rewards: { credits: 3500, exp: 80, reputation: 25 },
    timeLimit: 20,
    minLevel: 3,
    prerequisites: ['expand_minerals_bulk'],
    unlockConditions: {},
  },
  {
    id: 'rise_survival', name: '极限生存',
    type: 'special', phase: 3,
    description: '在不返回太阳主星的情况下完成 30 天的星际航行并交易 20 次。',
    objectives: [
      { type: 'survive_days', amount: 30, current: 0 },
      { type: 'trade_count', amount: 20, current: 0 },
    ],
    rewards: { credits: 6000, exp: 120, reputation: 25 },
    timeLimit: 0,
    minLevel: 3,
    prerequisites: ['rise_explore_10'],
    unlockConditions: { minTradeCount: 20 },
  },

  // ============================================================
  //  第四章：称霸 (phase 4, Lv 5-7)
  //  高难度、多步骤任务，跨星系挑战
  // ============================================================

  // --- 4.1 派系深入线 ---
  {
    id: 'reign_fed_friendship', name: '联邦之友',
    type: 'faction', phase: 4,
    description: '将与银河联邦的关系提升至友好或以上。联邦会回报忠诚之人。',
    objectives: [{ type: 'faction_relation', factionId: 'galactic_federation', amount: 30, current: 0 }],
    rewards: { credits: 2500, exp: 60, reputation: 20 },
    timeLimit: 0,
    minLevel: 3,
    prerequisites: ['rise_fed_trade'],
    unlockConditions: {},
    factionId: 'galactic_federation',
  },
  {
    id: 'reign_syndicate_ally', name: '辛迪加盟约',
    type: 'faction', phase: 4,
    description: '与星际辛迪加建立盟友关系。暗影网络将为你打开。',
    objectives: [{ type: 'faction_relation', factionId: 'stellar_syndicate', amount: 70, current: 0 }],
    rewards: { credits: 5000, exp: 100, reputation: 30 },
    timeLimit: 0,
    minLevel: 5,
    prerequisites: ['rise_syndicate_sell'],
    unlockConditions: {},
    factionId: 'stellar_syndicate',
  },
  {
    id: 'reign_tech_ally', name: '科技共同体盟约',
    type: 'faction', phase: 4,
    description: '与科技共同体建立盟友关系。最前沿的科技将为你敞开。',
    objectives: [{ type: 'faction_relation', factionId: 'tech_commonwealth', amount: 70, current: 0 }],
    rewards: { credits: 5000, exp: 100, reputation: 30 },
    timeLimit: 0,
    minLevel: 5,
    prerequisites: ['rise_tech_research'],
    unlockConditions: {},
    factionId: 'tech_commonwealth',
  },

  // --- 4.2 大额贸易线 ---
  {
    id: 'reign_profit_20000', name: '财富风暴',
    type: 'trade', phase: 4,
    description: '通过贸易累计赚取 20,000 积分利润。利润就是一切。',
    objectives: [{ type: 'earn_profit', amount: 20000, current: 0 }],
    rewards: { credits: 5000, exp: 100, reputation: 25 },
    timeLimit: 0,
    minLevel: 5,
    prerequisites: ['rise_profit_5000'],
    unlockConditions: {},
  },

  // --- 4.3 复杂特殊任务 ---
  {
    id: 'reign_luxury_circuit', name: '奢华巡回',
    type: 'special', phase: 4,
    description: '在 3 个不同的商业星球各卖出 5 单位奢侈品。奢华生意遍布银河！',
    objectives: [
      { type: 'sell_at', goodId: 'luxury', targetSystem: 'luxury_port', amount: 5, current: 0 },
      { type: 'sell_at', goodId: 'luxury', targetSystem: 'free_port', amount: 5, current: 0 },
      { type: 'sell_at', goodId: 'luxury', targetSystem: 'imperial_capital', amount: 5, current: 0 },
    ],
    rewards: { credits: 6000, exp: 120, reputation: 30 },
    timeLimit: 30,
    minLevel: 4,
    prerequisites: ['rise_deliver_luxury'],
    unlockConditions: { minVisitedSystems: 8 },
  },
  {
    id: 'reign_arms_race', name: '军备竞赛',
    type: 'special', phase: 4,
    description: '在限定时间内向战争前线运送大量武器和矿石。战争的车轮需要润滑。',
    objectives: [
      { type: 'deliver', goodId: 'weapons', targetSystem: 'war_front', amount: 15, current: 0 },
      { type: 'deliver', goodId: 'minerals', targetSystem: 'war_front', amount: 20, current: 0 },
    ],
    rewards: { credits: 8000, exp: 150, reputation: 40 },
    timeLimit: 25,
    minLevel: 5,
    prerequisites: ['rise_deliver_weapons'],
    unlockConditions: { minTradeCount: 30 },
  },
  {
    id: 'reign_medicine_tour', name: '银河义诊',
    type: 'special', phase: 4,
    description: '向 3 个不同的星球各运送 5 单位医药。救世之心。',
    objectives: [
      { type: 'deliver', goodId: 'medicine', targetSystem: 'medical_hub', amount: 5, current: 0 },
      { type: 'deliver', goodId: 'medicine', targetSystem: 'war_front', amount: 5, current: 0 },
      { type: 'deliver', goodId: 'medicine', targetSystem: 'frontier_outpost', amount: 5, current: 0 },
    ],
    rewards: { credits: 5000, exp: 100, reputation: 35 },
    timeLimit: 20,
    minLevel: 4,
    prerequisites: ['starter_deliver_medicine'],
    unlockConditions: { minVisitedSystems: 6, minReputation: 30 },
  },
  {
    id: 'reign_tech_monopoly', name: '科技垄断',
    type: 'special', phase: 4,
    description: '在科研星球低价买入科技，再高价卖到军事星球，累计利润 5,000。',
    objectives: [
      { type: 'buy_at', goodId: 'technology', targetSystem: 'nova_station', amount: 10, current: 0 },
      { type: 'earn_profit', amount: 5000, current: 0 },
    ],
    rewards: { credits: 4000, exp: 100, reputation: 20 },
    timeLimit: 0,
    minLevel: 4,
    prerequisites: ['rise_tech_research'],
    unlockConditions: { minTotalProfit: 5000 },
  },

  // --- 4.4 深度探索 ---
  {
    id: 'reign_explore_50', name: '宇宙测绘师',
    type: 'explore', phase: 4,
    description: '造访 50 个不同的星球，绘制完整的星际航图。',
    objectives: [{ type: 'visit_systems', amount: 50, current: 0, visited: [] }],
    rewards: { credits: 5000, exp: 150, reputation: 30 },
    timeLimit: 0,
    minLevel: 4,
    prerequisites: ['rise_explore_20'],
    unlockConditions: {},
  },
  {
    id: 'reign_galaxy_jump', name: '星系跃迁',
    type: 'explore', phase: 4,
    description: '成功进行一次跨星系跃迁旅行。从此银河已无边界。',
    objectives: [{ type: 'galaxy_jump', amount: 1, current: 0 }],
    rewards: { credits: 3000, exp: 80, reputation: 20 },
    timeLimit: 0,
    minLevel: 5,
    prerequisites: ['rise_explore_10'],
    unlockConditions: {},
  },

  // ============================================================
  //  第五章：传奇 (phase 5, Lv 7-10)
  //  终极挑战、传奇级壮举
  // ============================================================

  // --- 5.1 终极贸易线 ---
  {
    id: 'legend_profit_50000', name: '银河首富',
    type: 'trade', phase: 5,
    description: '通过贸易累计赚取 50,000 积分利润。银河系最伟大的商人！',
    objectives: [{ type: 'earn_profit', amount: 50000, current: 0 }],
    rewards: { credits: 10000, exp: 200, reputation: 50 },
    timeLimit: 0,
    minLevel: 7,
    prerequisites: ['reign_profit_20000'],
    unlockConditions: {},
  },
  {
    id: 'legend_100_trades', name: '百次交易大师',
    type: 'trade', phase: 5,
    description: '完成 100 次贸易交易。你已经是银河商业的活字典。',
    objectives: [{ type: 'trade_count', amount: 100, current: 0 }],
    rewards: { credits: 5000, exp: 150, reputation: 30 },
    timeLimit: 0,
    minLevel: 7,
    prerequisites: ['rise_50_trades'],
    unlockConditions: {},
  },

  // --- 5.2 终极特殊任务 ---
  {
    id: 'legend_grand_tour', name: '银河壮游',
    type: 'special', phase: 5,
    description: '完成一次伟大的银河壮游：访问 30 个不同星球并完成 50 笔交易。传世壮举！',
    objectives: [
      { type: 'visit_systems', amount: 30, current: 0, visited: [] },
      { type: 'trade_count', amount: 50, current: 0 },
    ],
    rewards: { credits: 10000, exp: 200, reputation: 50 },
    timeLimit: 0,
    minLevel: 7,
    prerequisites: ['reign_explore_50'],
    unlockConditions: { minTotalProfit: 20000 },
  },
  {
    id: 'legend_all_factions', name: '银河外交官',
    type: 'faction', phase: 5,
    description: '与所有三大派系同时保持友好或以上关系。银河和平的缔造者！',
    objectives: [
      { type: 'faction_relation', factionId: 'galactic_federation', amount: 30, current: 0 },
      { type: 'faction_relation', factionId: 'stellar_syndicate', amount: 30, current: 0 },
      { type: 'faction_relation', factionId: 'tech_commonwealth', amount: 30, current: 0 },
    ],
    rewards: { credits: 8000, exp: 180, reputation: 50 },
    timeLimit: 0,
    minLevel: 7,
    prerequisites: ['reign_fed_friendship'],
    unlockConditions: { minReputation: 80 },
  },
  {
    id: 'legend_ultimate_delivery', name: '终极快递',
    type: 'special', phase: 5,
    description: '在 15 天内向 5 个不同星球各运送指定物资。时间就是金钱！',
    objectives: [
      { type: 'deliver', goodId: 'food', targetSystem: 'war_front', amount: 10, current: 0 },
      { type: 'deliver', goodId: 'medicine', targetSystem: 'medical_hub', amount: 8, current: 0 },
      { type: 'deliver', goodId: 'technology', targetSystem: 'nova_station', amount: 6, current: 0 },
      { type: 'deliver', goodId: 'weapons', targetSystem: 'war_front', amount: 10, current: 0 },
      { type: 'deliver', goodId: 'luxury', targetSystem: 'luxury_port', amount: 8, current: 0 },
    ],
    rewards: { credits: 15000, exp: 300, reputation: 60 },
    timeLimit: 15,
    minLevel: 8,
    prerequisites: ['reign_arms_race', 'reign_medicine_tour'],
    unlockConditions: {},
  },
  {
    id: 'legend_galaxy_master', name: '银河之主',
    type: 'special', phase: 5,
    description: '在每个已解锁的星系中完成至少 10 笔交易，并累计利润达到 100,000。至高无上的商业帝王！',
    objectives: [
      { type: 'trade_count', amount: 100, current: 0 },
      { type: 'earn_profit', amount: 100000, current: 0 },
      { type: 'visit_systems', amount: 50, current: 0, visited: [] },
    ],
    rewards: { credits: 25000, exp: 500, reputation: 100 },
    timeLimit: 0,
    minLevel: 9,
    prerequisites: ['legend_grand_tour', 'legend_profit_50000'],
    unlockConditions: {},
  },
];
