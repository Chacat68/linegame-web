// 2.0 的商圈与经营参数。后续平衡调整通过新版本发布。
export const MERCHANT_PORTS = Object.freeze([
  { id: 'sol_prime', name: '太阳主星', role: '农业港', supply: { food: 36 }, demand: { technology: 30, minerals: 12 }, buy: { food: 8 }, sell: { technology: 31, minerals: 19 } },
  { id: 'mineral_belt', name: '矿石带', role: '矿业港', supply: { minerals: 32 }, demand: { food: 40, technology: 18 }, buy: { minerals: 11 }, sell: { food: 14, technology: 27 } },
  { id: 'nebula_forge', name: '星云工厂', role: '工业港', supply: { technology: 26 }, demand: { minerals: 36, food: 16 }, buy: { technology: 18 }, sell: { minerals: 20, food: 13 } },
]);

export const MERCHANT_GOODS = Object.freeze([
  { id: 'food', name: '粮食', icon: '◈' },
  { id: 'minerals', name: '矿石', icon: '◆' },
  { id: 'technology', name: '工具', icon: '✦' },
]);

export const MERCHANT_SHIPS = Object.freeze([
  { id: 'courier', name: '迅鸥轻舟', capacity: 12, speed: 1.4, price: 280, fee: 13, sceneType: 'shuttle', description: '小货量、高周转；需求有限时更容易满载。' },
  { id: 'clipper', name: '云帆快船', capacity: 18, speed: 1.12, price: 340, fee: 17, sceneType: 'clipper', description: '航速与载量均衡，适合稳定的常规商路。' },
  { id: 'hauler', name: '长鲸货船', capacity: 28, speed: 0.82, price: 560, fee: 27, sceneType: 'freighter', description: '大货量、较慢周转；需要更多货本与港口需求。' },
  { id: 'swift', name: '流星快递舰', capacity: 16, speed: 1.85, price: 850, fee: 19, sceneType: 'clipper', techId: 'fast_navigation', description: '高频往返，适合分散的短商路。' },
  { id: 'bulk', name: '巨帆散货舰', capacity: 36, speed: 0.68, price: 980, fee: 34, sceneType: 'galleon', techId: 'bulk_logistics', description: '一次利用大港供需，周转较慢。' },
  { id: 'relay', name: '远航联运舰', capacity: 30, speed: 1.2, price: 1250, fee: 31, sceneType: 'freighter', techId: 'integrated_freight', description: '兼顾大货量和跨港周转，购置成本较高。' },
]);

export const MERCHANT_TECHS = Object.freeze([
  // 每档费用为上一档的三倍；每项只开放一种进阶船的购买资格。
  { id: 'fast_navigation', name: '快速航路', companyLevel: 3, cost: 3000, requires: [], unlockShipId: 'swift' },
  { id: 'bulk_logistics', name: '重载物流', companyLevel: 4, cost: 9000, requires: [], unlockShipId: 'bulk' },
  { id: 'integrated_freight', name: '联运调度', companyLevel: 5, cost: 27000, requires: ['fast_navigation', 'bulk_logistics'], unlockShipId: 'relay' },
]);

// 公司扩容与船型科技分开：等级控制总运力规模，科技控制可购船型。
// 升级成本逐级约翻倍，让三港经营成形后仍需积累并取舍采购与研发。
export const MERCHANT_COMPANY_LEVELS = Object.freeze([
  { level: 1, shipLimit: 4, upgradeCost: 1800, unlock: '基础经营' },
  { level: 2, shipLimit: 8, upgradeCost: 4000, unlock: '船坞与探索' },
  { level: 3, shipLimit: 14, upgradeCost: 9000, unlock: '快速航路' },
  { level: 4, shipLimit: 22, upgradeCost: 18000, unlock: '重载物流' },
  { level: 5, shipLimit: 32, upgradeCost: 36000, unlock: '联运调度' },
  { level: 6, shipLimit: 48, upgradeCost: null, unlock: '规模经营' },
]);

export const MERCHANT_VIEW_LEVELS = Object.freeze({ tasks: 1, starmap: 1, reports: 1, ships: 2, market: 2 });

export function isMerchantViewUnlocked(merchant, view) {
  const level = MERCHANT_VIEW_LEVELS[view];
  if (!level) return false;
  if ((merchant?.companyLevel || 1) >= level) return true;
  // 迁移前已开放经营能力的商队继续使用完整采购与市场入口。
  return ['ships', 'market'].includes(view) && Boolean(
    merchant?.unlockedPorts?.includes('nebula_forge') || merchant?.researchedTechIds?.length
  );
}

export const MERCHANT_EXPLORATION_RULES = Object.freeze({
  companyLevel: 2,
  targetPortId: 'nebula_forge',
  minDelayMs: 30_000,
  maxDelayMs: 90_000,
  surveyMs: 30_000,
  cost: 360,
});

export const MERCHANT_EXPLORATION_DEFAULTS = Object.freeze({ rngState: 0, nextEventAt: 0, event: null });
export const MERCHANT_ONBOARDING_DEFAULTS = Object.freeze({ step: 0, skipped: false });

export const MERCHANT_RULES = Object.freeze({
  shipPriceGrowth: 1.2,
  restockMs: 60_000,
  restockFraction: 0.5,
  legMsPerDistance: 12_000,
  feePerDistance: 17,
  maxEventsPerAdvance: 5000,
  recentTrips: 12,
  archivedTasks: 24,
});

export const MERCHANT_DISTANCES = Object.freeze({
  'mineral_belt:sol_prime': 1,
  'mineral_belt:nebula_forge': 1.35,
  'nebula_forge:sol_prime': 1.8,
});

export function merchantDistance(from, to) {
  return MERCHANT_DISTANCES[[from, to].sort().join(':')] || 1.5;
}

export const MERCHANT_DEFAULTS = Object.freeze({
  companyLevel: 1,
  lastTickAt: 0,
  nextRestockAt: 0,
  nextId: 2,
  unlockedPorts: ['sol_prime', 'mineral_belt'],
  researchedTechIds: [],
  exploration: MERCHANT_EXPLORATION_DEFAULTS,
  onboarding: MERCHANT_ONBOARDING_DEFAULTS,
  ships: [{ id: 'ship-1', typeId: 'courier', taskId: null, phase: 'idle', arriveAt: 0, departAt: 0, trip: null }],
  tasks: [],
  history: [],
  markets: {},
  lastCatchupMs: 0,
});
