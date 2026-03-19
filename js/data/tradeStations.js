// js/data/tradeStations.js — 贸易站数值配置
// 依赖：无
// 导出：TRADE_STATION_LEVELS, TRADE_STATION_MANAGERS,
//       TRADE_STATION_STRATEGIES, TRADE_STATION_ALLOWED_TYPES,
//       TRADE_STATION_TYPE_FOCUS

export const TRADE_STATION_LEVELS = [
  { level: 1, name: '小型贸易站', investment: 100000, baseIncome: 500 },
  { level: 2, name: '标准贸易站', investment: 300000, baseIncome: 2000 },
  { level: 3, name: '大型贸易站', investment: 1000000, baseIncome: 8000 },
  { level: 4, name: '超大型贸易站', investment: 3000000, baseIncome: 30000 },
  { level: 5, name: '贸易中心', investment: 10000000, baseIncome: 120000 },
];

export const TRADE_STATION_MANAGERS = [
  {
    id: 'local_broker',
    name: '本地经纪人',
    desc: '熟悉当地市场脉络，适合稳健经营。',
    hireCost: 20000,
    dailySalary: 15,
    incomeMultiplier: 1.08,
    upkeepMultiplier: 0.95,
  },
  {
    id: 'logistics_director',
    name: '物流主管',
    desc: '擅长降低损耗与调度成本。',
    hireCost: 45000,
    dailySalary: 28,
    incomeMultiplier: 1.12,
    upkeepMultiplier: 0.88,
  },
  {
    id: 'market_analyst',
    name: '市场分析师',
    desc: '更积极地捕捉市场波动机会。',
    hireCost: 90000,
    dailySalary: 42,
    incomeMultiplier: 1.18,
    upkeepMultiplier: 0.92,
  },
];

export const TRADE_STATION_STRATEGIES = [
  {
    id: 'balanced',
    name: '均衡经营',
    desc: '覆盖本地优势品类，收益稳定。',
    incomeMultiplier: 1.0,
    upkeepRate: 0.08,
  },
  {
    id: 'expansion',
    name: '扩张经营',
    desc: '走量优先，收益更高但维护成本上升。',
    incomeMultiplier: 1.12,
    upkeepRate: 0.12,
    focusGoods: ['food', 'water', 'minerals', 'fuel'],
  },
  {
    id: 'premium',
    name: '精品经营',
    desc: '专注高利润货物，适合成熟市场。',
    incomeMultiplier: 1.06,
    upkeepRate: 0.10,
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
