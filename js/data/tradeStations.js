// js/data/tradeStations.js — 贸易站数值配置
// 依赖：无
// 导出：TRADE_STATION_LEVELS, TRADE_STATION_MANAGERS（旧存档兼容）,
//       TRADE_STATION_STRATEGIES, TRADE_STATION_ALLOWED_TYPES,
//       TRADE_STATION_TYPE_FOCUS, TRADE_STATION_ROLES,
//       TRADE_STATION_REGION_SYNERGIES

export const TRADE_STATION_LEVELS = [
  { level: 1, name: '贸易前哨', investment: 30000, baseIncome: 320 },
  { level: 2, name: '小型贸易站', investment: 100000, baseIncome: 700 },
  { level: 3, name: '标准贸易站', investment: 300000, baseIncome: 2400 },
  { level: 4, name: '大型贸易站', investment: 1000000, baseIncome: 9000 },
  { level: 5, name: '贸易中心', investment: 3000000, baseIncome: 26000 },
];

// 管理员已并入“站点定位”。保留空导出，避免旧模块或存档读取时失败。
export const TRADE_STATION_MANAGERS = [];

export const TRADE_STATION_STRATEGIES = [
  {
    id: 'balanced',
    name: '稳健经营',
    desc: '经营本地优势商品，收入更稳定。',
    incomeMultiplier: 1.0,
    upkeepRate: 0.10,
    economicExposure: 1.0,
    riskLabel: '稳健',
  },
  {
    id: 'expansion',
    name: '薄利多销',
    desc: '靠交易量赚钱；好行情赚得多，低迷期也更容易亏。',
    incomeMultiplier: 1.15,
    upkeepRate: 0.17,
    economicExposure: 1.6,
    riskLabel: '高波动',
    focusGoods: ['food', 'water', 'minerals', 'fuel'],
  },
  {
    id: 'premium',
    name: '高价商品',
    desc: '经营利润较高的商品，需要科研和高端市场支持。',
    incomeMultiplier: 1.08,
    upkeepRate: 0.14,
    economicExposure: 1.3,
    riskLabel: '中波动',
    focusGoods: ['technology', 'luxury', 'medicine'],
  },
];

export const TRADE_STATION_ALLOWED_TYPES = [
  'agricultural',
  'technology',
  'mining',
  'commercial',
  'medical',
  'industrial',
  'energy',
  'research',
  'special',
];

export const TRADE_STATION_TYPE_FOCUS = {
  agricultural: ['food', 'water', 'medicine'],
  technology: ['technology', 'minerals', 'luxury'],
  mining: ['minerals', 'fuel', 'technology'],
  commercial: ['luxury', 'technology', 'food'],
  military: ['weapons', 'fuel', 'medicine'],
  medical: ['medicine', 'food', 'water'],
  industrial: ['minerals', 'technology', 'fuel'],
  energy: ['fuel', 'technology', 'water'],
  research: ['technology', 'medicine', 'luxury'],
  special: ['luxury', 'technology', 'fuel'],
};

export const TRADE_STATION_ROLES = [
  {
    id: 'supply_node',
    name: '补给站',
    desc: '承接粮食、燃料、矿物和工业产能，是区域物流的底座。',
    systemTypes: ['agricultural', 'mining', 'industrial', 'energy'],
  },
  {
    id: 'market_hub',
    name: '枢纽站',
    desc: '负责撮合订单、金融结算和跨区转运，是商网的收益放大器。',
    systemTypes: ['commercial', 'technology', 'special'],
  },
  {
    id: 'research_link',
    name: '科研联络站',
    desc: '把医疗、科研和高端样本带入贸易网络，更容易获得高价订单。',
    systemTypes: ['medical', 'research'],
  },
];

export const TRADE_STATION_REGION_SYNERGIES = [
  {
    id: 'supply_market_loop',
    name: '补给商网',
    desc: '补给站为枢纽站提供稳定货源，提升区域周转效率。',
    roleIds: ['supply_node', 'market_hub'],
    incomeBonus: 0.06,
  },
  {
    id: 'research_market_loop',
    name: '科研商品网',
    desc: '科研联络站把高端需求带到枢纽站，提高高价订单成交率。',
    roleIds: ['research_link', 'market_hub'],
    incomeBonus: 0.05,
  },
  {
    id: 'regional_mesh',
    name: '三角商网',
    desc: '补给、枢纽与科研三类贸易站齐全后，整个区域都能获得额外收入。',
    roleIds: ['supply_node', 'market_hub', 'research_link'],
    incomeBonus: 0.08,
  },
];
