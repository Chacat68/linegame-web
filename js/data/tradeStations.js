// js/data/tradeStations.js — 贸易站数值配置
// 依赖：无
// 导出：TRADE_STATION_LEVELS, TRADE_STATION_MANAGERS,
//       TRADE_STATION_STRATEGIES, TRADE_STATION_ALLOWED_TYPES,
//       TRADE_STATION_TYPE_FOCUS, TRADE_STATION_ROLES,
//       TRADE_STATION_REGION_SYNERGIES

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
    desc: '把医疗、科研和高端样本接入商网，适合形成高附加值链路。',
    systemTypes: ['medical', 'research'],
  },
];

export const TRADE_STATION_REGION_SYNERGIES = [
  {
    id: 'supply_market_loop',
    name: '补给商贸环',
    desc: '补给站为枢纽站提供稳定货源，提升区域周转效率。',
    roleIds: ['supply_node', 'market_hub'],
    incomeBonus: 0.06,
  },
  {
    id: 'research_market_loop',
    name: '研发变现链',
    desc: '科研联络站把高端需求导入枢纽站，提升精品订单成交率。',
    roleIds: ['research_link', 'market_hub'],
    incomeBonus: 0.05,
  },
  {
    id: 'regional_mesh',
    name: '三角商网',
    desc: '补给、枢纽与科研三类站点齐备后，区域调度形成完整闭环。',
    roleIds: ['supply_node', 'market_hub', 'research_link'],
    incomeBonus: 0.08,
  },
];
