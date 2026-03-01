// js/data/victoryConditions.js — 多路径胜利条件定义
// 依赖：无
// 导出：VICTORY_PATHS

/**
 * 多路径胜利系统：
 * 玩家可通过5条不同的路径赢得游戏，每条路径代表不同的游戏风格。
 * 达成任意一条路径即可触发对应的胜利结局。
 */

export const VICTORY_PATHS = [
  // ========== 初期路径（约 3~5 小时）==========
  {
    id: 'trade_baron',
    name: '贸易霸权',
    icon: '💰',
    color: '#FFD700',
    description: '积累庞大财富，成为银河系首屈一指的商业帝王。',
    victoryTitle: '💰 银河商业帝王！',
    victoryMessage: '您的财富遍布银河，所有星系的贸易路线都在您的掌控之中。',
    tier: 1,
    requirements: [
      { type: 'netWorth', target: 50000, label: '净资产达到 50,000' },
      { type: 'tradeCount', target: 80, label: '完成 80 次贸易' },
    ],
  },
  {
    id: 'tech_supremacy',
    name: '科技制霸',
    icon: '🔬',
    color: '#2196F3',
    description: '研究全部科技，以知识与技术引领银河文明的未来。',
    victoryTitle: '🔬 银河科技至尊！',
    victoryMessage: '您掌握了银河系最尖端的科技，所有文明都仰望您的智慧。',
    tier: 1,
    requirements: [
      { type: 'researchCount', target: 16, label: '研究全部 16 项科技' },
      { type: 'playerLevel', target: 5, label: '达到 5 级' },
    ],
  },
  {
    id: 'diplomatic_unity',
    name: '外交统一',
    icon: '🏛️',
    color: '#9C27B0',
    description: '通过外交手段赢得所有派系的信任，建立银河联盟。',
    victoryTitle: '🏛️ 银河联盟缔造者！',
    victoryMessage: '三大派系在您的斡旋下达成前所未有的统一，银河迎来和平纪元。',
    tier: 1,
    requirements: [
      { type: 'allFactionsAllied', target: 3, label: '与全部 3 个派系结盟' },
      { type: 'reputation', target: 500, label: '声望达到 500' },
    ],
  },
  {
    id: 'galactic_explorer',
    name: '银河探索者',
    icon: '🌌',
    color: '#00BCD4',
    description: '探索未知星域，成为足迹遍布银河的传奇冒险家。',
    victoryTitle: '🌌 银河传奇探索者！',
    victoryMessage: '您的足迹遍布银河每个角落，未知的星域因您而不再神秘。',
    tier: 1,
    requirements: [
      { type: 'visitedGalaxies', target: 4, label: '探索 4 个星系' },
      { type: 'visitedSystems', target: 40, label: '访问 40 颗星球' },
    ],
  },
  {
    id: 'legacy_master',
    name: '传奇大师',
    icon: '🏆',
    color: '#FF9800',
    description: '在各领域均有建树，成为银河历史上最伟大的全能传奇。',
    victoryTitle: '🏆 银河传奇大师！',
    victoryMessage: '贸易、科技、外交、探索——没有您未涉足的领域，银河以您命名了一个时代。',
    tier: 1,
    requirements: [
      { type: 'achievements', target: 15, label: '解锁 15 个成就' },
      { type: 'playerLevel', target: 10, label: '达到最高等级' },
      { type: 'completedQuests', target: 8, label: '完成 8 个任务' },
    ],
  },

  // ========== 中期路径（约 6~10 小时）==========
  {
    id: 'fleet_commander',
    name: '舰队司令',
    icon: '🚢',
    color: '#546E7A',
    description: '建立一支无与伦比的庞大舰队，用钢铁洪流主宰星际航线。',
    victoryTitle: '🚢 银河舰队司令！',
    victoryMessage: '您的舰队横跨数个星系，每一条航道上都飘扬着您的旗帜。',
    tier: 2,
    requirements: [
      { type: 'fleetSlots', target: 5, label: '解锁 5 个舰队席位' },
      { type: 'shipTypes', target: 4, label: '拥有全部 4 种船型' },
      { type: 'netWorth', target: 80000, label: '净资产达到 80,000' },
    ],
  },
  {
    id: 'galactic_monopolist',
    name: '银河垄断者',
    icon: '🏭',
    color: '#E65100',
    description: '垄断银河贸易市场，让每一笔交易都绕不开你的名字。',
    victoryTitle: '🏭 银河垄断者！',
    victoryMessage: '从食物到武器，银河中的一切商品流通都在您的掌控之下。从此"价格"由您定义。',
    tier: 2,
    requirements: [
      { type: 'netWorth', target: 200000, label: '净资产达到 200,000' },
      { type: 'tradeCount', target: 500, label: '完成 500 次贸易' },
      { type: 'totalProfit', target: 150000, label: '累计利润达到 150,000' },
    ],
  },
  {
    id: 'shadow_broker',
    name: '暗影掮客',
    icon: '🕵️',
    color: '#37474F',
    description: '在黑暗中编织关系网，让所有派系成为你手中的棋子。',
    victoryTitle: '🕵️ 银河暗影掮客！',
    victoryMessage: '没有人知道您的真面目，但银河中的每一个决策背后都有您的影子。',
    tier: 2,
    requirements: [
      { type: 'allFactionsAllied', target: 3, label: '与全部 3 个派系结盟' },
      { type: 'completedQuests', target: 15, label: '完成 15 个任务' },
      { type: 'netWorth', target: 100000, label: '净资产达到 100,000' },
      { type: 'reputation', target: 800, label: '声望达到 800' },
    ],
  },

  // ========== 后期路径（约 12~16 小时）==========
  {
    id: 'eternal_voyager',
    name: '永恒旅者',
    icon: '🧭',
    color: '#1A237E',
    description: '穿越时空与星海，足迹遍布已知宇宙的每一个角落。',
    victoryTitle: '🧭 永恒旅者！',
    victoryMessage: '当人们抬头仰望星空，他们看到的每一颗星球上都留有您的痕迹。您就是星空本身。',
    tier: 3,
    requirements: [
      { type: 'visitedGalaxies', target: 8, label: '探索全部 8 个星系' },
      { type: 'visitedSystems', target: 200, label: '访问 200 颗星球' },
      { type: 'day', target: 500, label: '存活 500 天' },
      { type: 'tradeCount', target: 300, label: '完成 300 次贸易' },
    ],
  },
  {
    id: 'transcendence',
    name: '超越者',
    icon: '✨',
    color: '#AA00FF',
    description: '集财富、科技、声望、探索之大成，超越凡人极限，升华为银河意志。',
    victoryTitle: '✨ 超越者！',
    victoryMessage: '您已不再是一个商人、探险家或外交官。您已超越了所有的定义，成为银河传说中永恒的存在。',
    tier: 3,
    requirements: [
      { type: 'achievements', target: 40, label: '解锁 40 个成就' },
      { type: 'researchCount', target: 16, label: '研究全部 16 项科技' },
      { type: 'playerLevel', target: 10, label: '达到最高等级' },
      { type: 'allFactionsAllied', target: 3, label: '与全部 3 个派系结盟' },
      { type: 'netWorth', target: 150000, label: '净资产达到 150,000' },
      { type: 'completedQuests', target: 20, label: '完成 20 个任务' },
      { type: 'visitedGalaxies', target: 6, label: '探索 6 个星系' },
    ],
  },
];
