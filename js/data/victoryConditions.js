// js/data/victoryConditions.js — 五条核心胜利路线
// 旧版 10 条路线已按玩法支柱合并，别名表用于兼容已有存档。

export const VICTORY_PATH_ALIASES = {
  galactic_monopolist: 'trade_baron',
  transcendence: 'tech_supremacy',
  shadow_broker: 'diplomatic_unity',
  eternal_voyager: 'galactic_explorer',
  legacy_master: 'fleet_commander',
};

export function normalizeVictoryPathId(pathId) {
  return VICTORY_PATH_ALIASES[pathId] || pathId || '';
}

export const VICTORY_PATHS = [
  {
    id: 'trade_baron',
    name: '贸易霸权',
    icon: '💰',
    color: '#FFD700',
    description: '以财富、成交规模和商网掌控银河经济。',
    victoryTitle: '💰 银河商业帝王！',
    victoryMessage: '您的资本与商路已成为银河流通的基础设施。',
    tier: 1,
    policy: {
      name: '开放商路',
      summary: '以价格优势和商网扩张换取更频繁的市场风波。',
      benefit: '买入 -4%，贸易站总收入 +5%',
      tradeoff: '航行事件压力 +10%',
      effects: { buyDiscount: 0.04, stationIncomeMultiplier: 1.05, eventChanceMultiplier: 1.1 },
    },
    requirements: [
      { type: 'netWorth', target: 80000, label: '净资产达到 80,000' },
      { type: 'tradeCount', target: 120, label: '完成 120 次贸易' },
      { type: 'totalProfit', target: 50000, label: '累计利润达到 50,000' },
    ],
  },
  {
    id: 'tech_supremacy',
    name: '科技制霸',
    icon: '🔬',
    color: '#2196F3',
    description: '完成科技树并将研究能力转化为公司优势。',
    victoryTitle: '🔬 银河科技至尊！',
    victoryMessage: '您掌握了已知银河最完整的技术体系。',
    tier: 1,
    policy: {
      name: '科研优先',
      summary: '将资本与航运能力让位给研究与测绘。',
      benefit: '研究周期 -2 天',
      tradeoff: '买入价格 +3%',
      effects: { researchDayReduction: 2, buyPricePenalty: 0.03 },
    },
    requirements: [
      { type: 'researchCount', target: 16, label: '研究全部 16 项科技' },
      { type: 'playerLevel', target: 8, label: '玩家等级达到 8' },
    ],
  },
  {
    id: 'diplomatic_unity',
    name: '外交统一',
    icon: '🏛️',
    color: '#9C27B0',
    description: '整合正规外交与灰色渠道，让三大派系承认您的影响力。',
    victoryTitle: '🏛️ 银河联盟缔造者！',
    victoryMessage: '三大派系在您的斡旋下形成了稳定秩序。',
    tier: 2,
    policy: {
      name: '联盟市场',
      summary: '用外交渠道换取销售优势，同时承担联盟行政成本。',
      benefit: '卖出价格 +3%',
      tradeoff: '贸易站维护费 +10%',
      effects: { sellBonus: 0.03, stationUpkeepMultiplier: 1.1 },
    },
    requirements: [
      { type: 'allFactionsAllied', target: 3, label: '与全部 3 个派系结盟' },
      { type: 'reputation', target: 650, label: '声望达到 650' },
      { type: 'completedQuests', target: 12, label: '完成 12 个任务' },
    ],
  },
  {
    id: 'galactic_explorer',
    name: '银河探索者',
    icon: '🌌',
    color: '#00BCD4',
    description: '调查 POI、归档情报并建立跨星系远征网络。',
    victoryTitle: '🌌 银河传奇探索者！',
    victoryMessage: '未知星域已因您的远征不再神秘。',
    tier: 2,
    policy: {
      name: '远征优先',
      summary: '为远征重配舰船，放弃部分货舱来换取航程与勘探收益。',
      benefit: '燃料消耗 -10%，POI 奖励 +15%',
      tradeoff: '所有船有效货舱 -5',
      effects: { fuelEffMultiplier: 0.9, poiRewardMultiplier: 1.15, cargoPenalty: 5 },
    },
    requirements: [
      { type: 'visitedGalaxies', target: 6, label: '探索 6 个星系' },
      { type: 'visitedSystems', target: 55, label: '访问 55 颗星球' },
      { type: 'day', target: 180, label: '经历 180 天' },
    ],
  },
  {
    id: 'fleet_commander',
    name: '舰队司令',
    icon: '🚢',
    color: '#546E7A',
    description: '集齐船型、席位和成就，建立能长期运转的银河舰队。',
    victoryTitle: '🚢 银河舰队司令！',
    victoryMessage: '您的舰队已经覆盖主要航道，并成为公司最牢固的资产。',
    tier: 3,
    policy: {
      name: '舰队动员',
      summary: '以重资产舰队为中心组织公司，拥有更强运力也承担更高地面成本。',
      benefit: '所有船有效货舱 +10，燃料消耗 -5%',
      tradeoff: '贸易站维护费 +18%',
      effects: { cargoBonus: 10, fuelEffMultiplier: 0.95, stationUpkeepMultiplier: 1.18 },
    },
    requirements: [
      { type: 'fleetSlots', target: 5, label: '解锁 5 个舰队席位' },
      { type: 'shipTypes', target: 4, label: '拥有全部 4 种船型' },
      { type: 'achievements', target: 16, label: '解锁 16 个核心成就' },
    ],
  },
];
