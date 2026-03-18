// js/data/goods.js — 商品定义
// 依赖：无
// 导出：GOODS

export const GOODS = [
  { id: 'food',       name: '食物',   emoji: '🌾', basePrice: 10,  desc: '维持生命的基本食物',   legality: 'legal', marketAccess: ['open'], upstream: [{ goodId: 'water', weight: 0.5 }] },
  { id: 'water',      name: '水资源', emoji: '💧', basePrice: 15,  desc: '珍贵的液态水',         legality: 'legal', marketAccess: ['open'], upstream: [] },
  { id: 'minerals',   name: '矿石',   emoji: '⛏',  basePrice: 30,  desc: '工业生产原材料',       legality: 'legal', marketAccess: ['open'], upstream: [] },
  { id: 'technology', name: '科技',   emoji: '🔬', basePrice: 60,  desc: '高端科技产品',         legality: 'restricted', marketAccess: ['open', 'black'], upstream: [{ goodId: 'minerals', weight: 0.6 }] },
  { id: 'luxury',     name: '奢侈品', emoji: '💎', basePrice: 90,  desc: '稀有奢华商品',         legality: 'restricted', marketAccess: ['open', 'black'], upstream: [] },
  { id: 'weapons',    name: '武器',   emoji: '⚔',  basePrice: 120, desc: '军用武器装备',         legality: 'illegal', marketAccess: ['black'], upstream: [{ goodId: 'technology', weight: 0.5 }, { goodId: 'minerals', weight: 0.3 }] },
  { id: 'medicine',   name: '医药',   emoji: '💊', basePrice: 50,  desc: '医疗用品与药品',       legality: 'legal', marketAccess: ['open'], upstream: [{ goodId: 'food', weight: 0.4 }] },
  { id: 'fuel',       name: '燃料',   emoji: '⚡', basePrice: 4,   desc: '飞船推进用燃料',       legality: 'legal', marketAccess: ['open'], upstream: [] },
];
