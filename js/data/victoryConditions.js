// js/data/victoryConditions.js — 多路径胜利条件定义
// 依赖：无
// 导出：VICTORY_PATHS

/**
 * 多路径胜利系统：
 * 玩家可通过5条不同的路径赢得游戏，每条路径代表不同的游戏风格。
 * 达成任意一条路径即可触发对应的胜利结局。
 */

export const VICTORY_PATHS = [
  {
    id: 'trade_baron',
    name: '贸易霸权',
    icon: '💰',
    color: '#FFD700',
    description: '积累庞大财富，成为银河系首屈一指的商业帝王。',
    victoryTitle: '💰 银河商业帝王！',
    victoryMessage: '您的财富遍布银河，所有星系的贸易路线都在您的掌控之中。',
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
    requirements: [
      { type: 'achievements', target: 15, label: '解锁 15 个成就' },
      { type: 'playerLevel', target: 10, label: '达到最高等级' },
      { type: 'completedQuests', target: 8, label: '完成 8 个任务' },
    ],
  },
];
