// js/data/systems.js — 星系定义与燃料常数
// 依赖：无
// 导出：SYSTEMS, FUEL_COST_PER_UNIT

// Positions 使用相对 [0,1] 坐标，根据 canvas 尺寸缩放
// prices: 每种商品在该星系的价格系数（<1 = 便宜，>1 = 贵）
export const SYSTEMS = [
  {
    id: 'sol_prime', name: '太阳主星',
    x: 0.15, y: 0.35, color: '#4CAF50', type: 'agricultural', typeLabel: '农业',
    description: '银河系农业中心，粮食丰产之地',
    prices: { food:0.4, water:0.5, minerals:1.2, technology:1.8, luxury:2.0, weapons:1.5, medicine:1.3, fuel:0.8 },
  },
  {
    id: 'nova_station', name: '新北京站',
    x: 0.75, y: 0.20, color: '#2196F3', type: 'technology', typeLabel: '科技',
    description: '银河系最先进的科技研究中心',
    prices: { food:1.8, water:1.5, minerals:1.4, technology:0.4, luxury:1.3, weapons:1.2, medicine:0.6, fuel:0.9 },
  },
  {
    id: 'mineral_belt', name: '矿石带',
    x: 0.50, y: 0.58, color: '#FF9800', type: 'mining', typeLabel: '矿业',
    description: '富含稀有矿物的小行星带聚居地',
    prices: { food:1.6, water:1.4, minerals:0.3, technology:1.5, luxury:1.8, weapons:1.3, medicine:1.4, fuel:0.5 },
  },
  {
    id: 'luxury_port', name: '奢华港',
    x: 0.85, y: 0.62, color: '#9C27B0', type: 'commercial', typeLabel: '商业',
    description: '银河权贵聚集之地，奢靡之都',
    prices: { food:1.4, water:1.2, minerals:1.6, technology:1.2, luxury:0.5, weapons:2.0, medicine:1.2, fuel:1.0 },
  },
  {
    id: 'war_front', name: '战争前线',
    x: 0.25, y: 0.78, color: '#E91E63', type: 'military', typeLabel: '军事',
    description: '星际战争的前沿阵地，武器需求旺盛',
    prices: { food:2.0, water:1.8, minerals:1.5, technology:1.4, luxury:2.5, weapons:0.4, medicine:2.5, fuel:1.2 },
  },
  {
    id: 'medical_hub', name: '医疗中枢',
    x: 0.65, y: 0.80, color: '#00BCD4', type: 'medical', typeLabel: '医疗',
    description: '最先进的医疗研究和生产中心',
    prices: { food:1.5, water:1.3, minerals:1.6, technology:0.8, luxury:1.5, weapons:1.8, medicine:0.35, fuel:1.0 },
  },
  {
    id: 'fuel_depot', name: '深空补给站',
    x: 0.40, y: 0.20, color: '#FFC107', type: 'commercial', typeLabel: '补给',
    description: '为长途星际旅行提供补给的中转站',
    prices: { food:1.3, water:1.1, minerals:1.4, technology:1.6, luxury:2.0, weapons:1.8, medicine:1.4, fuel:0.25 },
  },
  {
    id: 'shadow_haven', name: '暗影港湾',
    x: 0.10, y: 0.85, color: '#607D8B', type: 'special', typeLabel: '特殊',
    description: '法外之地，风险与机遇并存',
    prices: { food:0.8, water:0.7, minerals:0.6, technology:0.7, luxury:0.6, weapons:0.5, medicine:0.7, fuel:0.6 },
  },
  {
    id: 'crystal_planet', name: '冰晶行星',
    x: 0.90, y: 0.42, color: '#80CBC4', type: 'mining', typeLabel: '矿业',
    description: '寒冷的资源星球，矿产极为丰富',
    prices: { food:2.0, water:0.4, minerals:0.4, technology:1.7, luxury:2.2, weapons:1.6, medicine:2.0, fuel:0.6 },
  },
  {
    id: 'imperial_capital', name: '银河帝都',
    x: 0.50, y: 0.35, color: '#FF6B35', type: 'commercial', typeLabel: '商业',
    description: '银河文明的中心，万商云集之地',
    prices: { food:1.0, water:1.0, minerals:1.0, technology:1.0, luxury:1.0, weapons:1.0, medicine:1.0, fuel:1.0 },
  },
];

export const FUEL_COST_PER_UNIT = 0.08; // fuel units per map-distance unit
