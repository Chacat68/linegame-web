// 扩大港口缓冲与每分钟恢复量，让基础商路能持续运行，扩充船队后再出现供需取舍。
export const MERCHANT_PORTS = Object.freeze([
  { id: 'sol_prime', name: '太阳主星', role: '农业港', supply: { food: 144 }, demand: { technology: 120, minerals: 96 }, buy: { food: 8 }, sell: { technology: 31, minerals: 19 } },
  { id: 'mineral_belt', name: '矿石带', role: '矿业港', supply: { minerals: 128 }, demand: { food: 160, technology: 72 }, buy: { minerals: 11 }, sell: { food: 14, technology: 27 } },
  { id: 'nebula_forge', name: '星云工厂', role: '工业港', supply: { technology: 104 }, demand: { minerals: 144, food: 64, alloys: 360 }, buy: { technology: 18 }, sell: { minerals: 20, food: 13, alloys: 17 } },
  { id: 'aurora_depot', name: '极光原料港', role: '原料港', supply: { alloys: 360 }, demand: {}, buy: { alloys: 12 }, sell: {} },
]);

export const MERCHANT_GOODS = Object.freeze([
  { id: 'food', name: '粮食', icon: '◈' },
  { id: 'minerals', name: '矿石', icon: '◆' },
  { id: 'technology', name: '工具', icon: '✦' },
  { id: 'alloys', name: '工业原料', icon: '⬡' },
]);

export const MERCHANT_SHIPS = Object.freeze([
  { id: 'courier', name: '迅鸥轻舟', companyLevel: 1, capacity: 12, speed: 1.4, price: 280, fee: 13, sceneType: 'shuttle', description: '小货量、高周转；需求有限时更容易满载。' },
  { id: 'clipper', name: '云帆快船', companyLevel: 6, techId: 'clipper_design', capacity: 18, speed: 1.12, price: 340, fee: 17, sceneType: 'clipper', description: '航速与载量均衡，适合稳定的常规商路。' },
  { id: 'hauler', name: '长鲸货船', companyLevel: 10, techId: 'hauler_design', capacity: 28, speed: 0.82, price: 560, fee: 27, sceneType: 'freighter', description: '大货量、较慢周转；需要更多货本与港口需求。' },
  { id: 'swift', name: '流星快递舰', capacity: 16, speed: 1.85, price: 850, fee: 19, sceneType: 'clipper', techId: 'fast_navigation', description: '高频往返，适合分散的短商路。' },
  { id: 'bulk', name: '巨帆散货舰', capacity: 36, speed: 0.68, price: 980, fee: 34, sceneType: 'galleon', techId: 'bulk_logistics', description: '一次利用大港供需，周转较慢。' },
  { id: 'relay', name: '远航联运舰', capacity: 30, speed: 1.2, price: 1250, fee: 31, sceneType: 'freighter', techId: 'integrated_freight', description: '兼顾大货量和跨港周转，购置成本较高。' },
]);

export const MERCHANT_TECH_CATEGORIES = Object.freeze(['航运科技', '航速', '载量', '收益', '船队扩容', '功能']);

export const MERCHANT_COMPANY_RULES = Object.freeze({ maxLevel: 100, levelsPerTier: 5, firstBreakthroughFactor: 2, breakthroughFactorStep: 0.5 });

// 将十八级的船位、费用与已获得资格扩展为百级成长；存档映射到各旧级科技已全部开放的位置。
export const MERCHANT_COMPANY_ANCHORS = Object.freeze([
  { legacyLevel: 1, level: 4, shipLimit: 1, upgradeCost: 2100 },
  { legacyLevel: 2, level: 9, shipLimit: 1, upgradeCost: 3300 },
  { legacyLevel: 3, level: 13, shipLimit: 2, upgradeCost: 4900 },
  { legacyLevel: 4, level: 18, shipLimit: 2, upgradeCost: 6100 },
  { legacyLevel: 5, level: 23, shipLimit: 2, upgradeCost: 7400 },
  { legacyLevel: 6, level: 29, shipLimit: 3, upgradeCost: 22000 },
  { legacyLevel: 7, level: 33, shipLimit: 4, upgradeCost: 27500 },
  { legacyLevel: 8, level: 40, shipLimit: 4, upgradeCost: 33500 },
  { legacyLevel: 9, level: 44, shipLimit: 7, upgradeCost: 38500 },
  { legacyLevel: 10, level: 51, shipLimit: 9, upgradeCost: 45500 },
  { legacyLevel: 11, level: 55, shipLimit: 9, upgradeCost: 55500 },
  { legacyLevel: 12, level: 63, shipLimit: 12, upgradeCost: 94000 },
  { legacyLevel: 13, level: 69, shipLimit: 15, upgradeCost: 112000 },
  { legacyLevel: 14, level: 75, shipLimit: 15, upgradeCost: 124000 },
  { legacyLevel: 15, level: 81, shipLimit: 19, upgradeCost: 140000 },
  { legacyLevel: 16, level: 89, shipLimit: 22, upgradeCost: 159000 },
  { legacyLevel: 17, level: 95, shipLimit: 26, upgradeCost: 181000 },
  { legacyLevel: 18, level: 100, shipLimit: 30, upgradeCost: null },
]);
function companyBaseValue(level, key) {
  const upper = MERCHANT_COMPANY_ANCHORS.find(stage => stage.level >= level);
  const index = MERCHANT_COMPANY_ANCHORS.indexOf(upper);
  const lower = index > 0 ? MERCHANT_COMPANY_ANCHORS[index - 1] : upper;
  const high = upper[key] ?? lower[key];
  const low = lower[key];
  const value = upper.level === lower.level ? low : low + (high - low) * (level - lower.level) / (upper.level - lower.level);
  return key === 'shipLimit' ? Math.floor(value) : Math.ceil(value / 100) * 100;
}

// 科研与公司共用满编收入校准后的普通费用和阶段 N；突破金额不再重复作为科研基数。
export const MERCHANT_TECH_PRICING_RULES = Object.freeze({
  roundTo: 100, attributePercentPerPoint: 5, shipSlotPercent: 15, featurePercent: 25, shipDesignPercent: 50,
});

export const MERCHANT_TECH_MILESTONES = Object.freeze({
  berth_planning: { costFactor: 2, label: '船队扩张' },
  fleet_command: { costFactor: 1.75, label: '船队统筹' },
  planet_survey: { costFactor: 2, label: '首次开港' },
  fast_navigation: { costFactor: 1.75, label: '高速运输' },
  bulk_logistics: { costFactor: 2, label: '重载运输' },
  deep_survey: { costFactor: 2.25, label: '远域开港' },
  integrated_freight: { costFactor: 2.5, label: '跨港联运' },
  interstellar_docks: { costFactor: 2.5, label: '星际船队' },
});

// 分支在核心节点汇合；仅约束尚未研发的项目，已付费成果和历史航次保持原样。
const techBranchRequirements = {
  berth_planning: ['clipper_design'],
  fleet_command: ['hauler_design', 'berth_planning'],
  market_network: ['fleet_command', 'trade_quotes'],
  planet_survey: ['market_network'],
  dock_scheduling: ['fleet_command'],
  fast_navigation: ['clipper_design', 'cruise_tuning'],
  regional_berths: ['planet_survey'],
  bulk_logistics: ['hauler_design', 'cargo_racks'],
  deep_survey: ['bulk_logistics'],
  remote_berths: ['deep_survey'],
  integrated_freight: ['deep_survey'],
  interstellar_docks: ['integrated_freight'],
  alliance_berths: ['trade_network'],
};

function companyTierFactor(level) {
  const tier = Math.ceil(level / MERCHANT_COMPANY_RULES.levelsPerTier);
  return MERCHANT_COMPANY_RULES.firstBreakthroughFactor + (tier - 1) * MERCHANT_COMPANY_RULES.breakthroughFactorStep;
}

export function getMerchantTechPricing(tech, level = tech.companyLevel) {
  const rules = MERCHANT_TECH_PRICING_RULES;
  const points = Math.round(((tech.speedBonus || 0) + (tech.capacityBonus || 0) + (tech.profitBonus || 0)) * 100);
  const weightPercent = tech.unlockShipId ? rules.shipDesignPercent : tech.unlockFeature ? rules.featurePercent
    : tech.shipSlotBonus ? tech.shipSlotBonus * rules.shipSlotPercent : points * rules.attributePercentPerPoint;
  // Lv.100 虽已满级，科研仍使用终段的普通费用基数，不能变成免费。
  const baseCost = companyBaseValue(level, 'upgradeCost');
  const factor = companyTierFactor(level);
  const coreFactor = MERCHANT_TECH_MILESTONES[tech.id]?.costFactor || 1;
  const cost = Math.ceil(baseCost * factor * weightPercent / 100 * coreFactor / rules.roundTo) * rules.roundTo;
  return { baseCost, factor, weightPercent, coreFactor, cost };
}

export const MERCHANT_TECHS = Object.freeze([
  { id: 'efficient_engines', name: '高效推进', category: '航速', companyLevel: 1, requires: [], speedBonus: 0.02, description: '全船队航速 +2%，贸易与探索都适用' },
  { id: 'thruster_calibration', name: '推进校准', category: '航速', companyLevel: 1, requires: ['efficient_engines'], speedBonus: 0.02, description: '全船队航速 +2%' },
  { id: 'fuel_injection', name: '燃料微调', category: '航速', companyLevel: 1, requires: ['thruster_calibration'], speedBonus: 0.01, description: '全船队航速 +1%' },
  { id: 'clipper_design', name: '云帆船体', category: '航运科技', companyLevel: 2, requires: [], unlockShipId: 'clipper', description: '解锁云帆快船采购' },
  { id: 'cargo_partitions', name: '货舱分区', category: '载量', companyLevel: 2, requires: [], capacityBonus: 0.02, description: '全船队载货量 +2%，按整舱位取整' },
  { id: 'berth_planning', name: '船位规划', category: '船队扩容', companyLevel: 2, requires: [], shipSlotBonus: 1, description: '公司船只上限 +1 艘，飞船需另行采购' },
  { id: 'hauler_design', name: '长鲸船体', category: '航运科技', companyLevel: 3, requires: ['clipper_design'], unlockShipId: 'hauler', description: '解锁长鲸货船采购' },
  { id: 'loading_frames', name: '装载支架', category: '载量', companyLevel: 3, requires: ['cargo_partitions'], capacityBonus: 0.02, description: '全船队载货量 +2%，按整舱位取整' },
  { id: 'trade_quotes', name: '报价校核', category: '收益', companyLevel: 3, requires: [], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'fleet_command', name: '船队管理', category: '功能', companyLevel: 4, requires: [], unlockFeature: 'ships', description: '解锁船坞、完整船队与船型投资比较' },
  { id: 'engine_cooling', name: '引擎冷却', category: '航速', companyLevel: 4, requires: ['fuel_injection'], speedBonus: 0.02, description: '全船队航速 +2%' },
  { id: 'storage_layout', name: '仓储布局', category: '载量', companyLevel: 4, requires: ['loading_frames'], capacityBonus: 0.02, description: '全船队载货量 +2%，按整舱位取整' },
  { id: 'market_network', name: '市场通讯', category: '功能', companyLevel: 5, requires: [], unlockFeature: 'market', description: '解锁市场页、港口供需与星球情报交易' },
  { id: 'vector_nozzles', name: '矢量喷口', category: '航速', companyLevel: 5, requires: ['engine_cooling'], speedBonus: 0.02, description: '全船队航速 +2%' },
  { id: 'pallet_system', name: '托盘标准', category: '载量', companyLevel: 5, requires: ['storage_layout'], capacityBonus: 0.02, description: '全船队载货量 +2%，按整舱位取整' },
  { id: 'planet_survey', name: '新港勘察', category: '功能', companyLevel: 6, requires: [], unlockFeature: 'exploration', description: '解锁首次新港探索，返港后开放商路' },
  { id: 'cruise_tuning', name: '巡航调校', category: '航速', companyLevel: 6, requires: ['vector_nozzles'], speedBonus: 0.02, description: '全船队航速 +2%' },
  { id: 'local_contracts', name: '地方合约', category: '收益', companyLevel: 6, requires: ['trade_quotes'], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'dock_scheduling', name: '船坞排程', category: '船队扩容', companyLevel: 6, requires: ['berth_planning'], shipSlotBonus: 1, description: '公司船只上限 +1 艘，飞船需另行采购' },
  { id: 'cargo_racks', name: '货舱整理', category: '载量', companyLevel: 7, requires: ['pallet_system'], capacityBonus: 0.02, description: '全船队载货量 +2%，按整舱位取整' },
  { id: 'payment_terms', name: '账期协商', category: '收益', companyLevel: 7, requires: ['local_contracts'], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'berth_rotation', name: '泊位轮转', category: '船队扩容', companyLevel: 7, requires: ['dock_scheduling'], shipSlotBonus: 1, description: '公司船只上限 +1 艘，飞船需另行采购' },
  { id: 'fast_navigation', name: '快速航路', category: '航运科技', companyLevel: 8, requires: [], unlockShipId: 'swift', description: '解锁流星快递舰采购' },
  { id: 'autopilot_trim', name: '航向微调', category: '航速', companyLevel: 8, requires: ['cruise_tuning'], speedBonus: 0.02, description: '全船队航速 +2%' },
  { id: 'rack_reinforcement', name: '货架加固', category: '载量', companyLevel: 8, requires: ['cargo_racks'], capacityBonus: 0.03, description: '全船队载货量 +3%，按整舱位取整' },
  { id: 'fulfillment_protocol', name: '履约流程', category: '收益', companyLevel: 8, requires: ['payment_terms'], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'trade_contracts', name: '商贸合约', category: '收益', companyLevel: 9, requires: ['local_contracts'], profitBonus: 0.01, description: '可盈利商路的单趟净利 +1%' },
  { id: 'container_stacking', name: '集装堆叠', category: '载量', companyLevel: 9, requires: ['rack_reinforcement'], capacityBonus: 0.03, description: '全船队载货量 +3%，按整舱位取整' },
  { id: 'regional_berths', name: '区域泊位', category: '船队扩容', companyLevel: 9, requires: ['berth_rotation'], shipSlotBonus: 1, description: '公司船只上限 +1 艘，飞船需另行采购' },
  { id: 'engine_tuning', name: '引擎调校', category: '航速', companyLevel: 10, requires: ['autopilot_trim'], speedBonus: 0.02, description: '全船队航速 +2%' },
  { id: 'hold_balancing', name: '舱内配重', category: '载量', companyLevel: 10, requires: ['container_stacking'], capacityBonus: 0.03, description: '全船队载货量 +3%，按整舱位取整' },
  { id: 'margin_audits', name: '成本核算', category: '收益', companyLevel: 10, requires: ['fulfillment_protocol'], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'parallel_docks', name: '并行船坞', category: '船队扩容', companyLevel: 10, requires: ['regional_berths'], shipSlotBonus: 2, description: '公司船只上限 +2 艘，飞船需另行采购' },
  { id: 'bulk_logistics', name: '重载物流', category: '航运科技', companyLevel: 11, requires: [], unlockShipId: 'bulk', description: '解锁巨帆散货舰采购' },
  { id: 'ion_channels', name: '离子通道', category: '航速', companyLevel: 11, requires: ['engine_tuning'], speedBonus: 0.02, description: '全船队航速 +2%' },
  { id: 'partner_rebates', name: '伙伴返利', category: '收益', companyLevel: 11, requires: ['margin_audits'], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'deep_survey', name: '远域勘察', category: '功能', companyLevel: 12, requires: ['planet_survey'], unlockFeature: 'deepExploration', description: '解锁远域探索，发现极光原料港信号' },
  { id: 'plasma_flow', name: '等离子导流', category: '航速', companyLevel: 12, requires: ['ion_channels'], speedBonus: 0.02, description: '全船队航速 +2%' },
  { id: 'cargo_connectors', name: '货舱连接', category: '载量', companyLevel: 12, requires: ['hold_balancing'], capacityBonus: 0.03, description: '全船队载货量 +3%，按整舱位取整' },
  { id: 'freight_pricing', name: '运价细分', category: '收益', companyLevel: 12, requires: ['partner_rebates'], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'dock_network', name: '船坞联网', category: '船队扩容', companyLevel: 12, requires: ['parallel_docks'], shipSlotBonus: 1, description: '公司船只上限 +1 艘，飞船需另行采购' },
  { id: 'cargo_expansion', name: '货舱扩容', category: '载量', companyLevel: 13, requires: ['cargo_connectors'], capacityBonus: 0.03, description: '全船队载货量 +3%，按整舱位取整' },
  { id: 'warp_alignment', name: '跃迁对准', category: '航速', companyLevel: 13, requires: ['plasma_flow'], speedBonus: 0.02, description: '全船队航速 +2%' },
  { id: 'distribution_terms', name: '分销协商', category: '收益', companyLevel: 13, requires: ['freight_pricing'], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'remote_berths', name: '远域泊位', category: '船队扩容', companyLevel: 13, requires: ['dock_network'], shipSlotBonus: 1, description: '公司船只上限 +1 艘，飞船需另行采购' },
  { id: 'integrated_freight', name: '联运调度', category: '航运科技', companyLevel: 14, requires: ['fast_navigation', 'bulk_logistics'], unlockShipId: 'relay', description: '解锁远航联运舰采购' },
  { id: 'field_stabilization', name: '场域稳定', category: '航速', companyLevel: 14, requires: ['warp_alignment'], speedBonus: 0.02, description: '全船队航速 +2%' },
  { id: 'lightweight_containers', name: '轻质集装', category: '载量', companyLevel: 14, requires: ['cargo_expansion'], capacityBonus: 0.04, description: '全船队载货量 +4%，按整舱位取整' },
  { id: 'volume_contracts', name: '运量合约', category: '收益', companyLevel: 14, requires: ['distribution_terms'], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'trade_negotiation', name: '商贸谈判', category: '收益', companyLevel: 15, requires: ['partner_rebates', 'trade_contracts'], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'navigation_precision', name: '航迹精算', category: '航速', companyLevel: 15, requires: ['field_stabilization'], speedBonus: 0.02, description: '全船队航速 +2%' },
  { id: 'compression_cradles', name: '紧凑承架', category: '载量', companyLevel: 15, requires: ['lightweight_containers'], capacityBonus: 0.04, description: '全船队载货量 +4%，按整舱位取整' },
  { id: 'fleet_hubs', name: '船队枢纽', category: '船队扩容', companyLevel: 15, requires: ['remote_berths'], shipSlotBonus: 2, description: '公司船只上限 +2 艘，飞船需另行采购' },
  { id: 'advanced_engines', name: '跃迁推进', category: '航速', companyLevel: 16, requires: ['navigation_precision'], speedBonus: 0.02, description: '全船队航速 +2%' },
  { id: 'jump_efficiency', name: '跃迁校准', category: '航速', companyLevel: 16, requires: ['advanced_engines'], speedBonus: 0.03, description: '全船队航速 +3%' },
  { id: 'distributed_storage', name: '分布储舱', category: '载量', companyLevel: 16, requires: ['compression_cradles'], capacityBonus: 0.04, description: '全船队载货量 +4%，按整舱位取整' },
  { id: 'settlement_network', name: '结算联网', category: '收益', companyLevel: 16, requires: ['volume_contracts', 'trade_negotiation'], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'hub_coordination', name: '枢纽协同', category: '船队扩容', companyLevel: 16, requires: ['fleet_hubs'], shipSlotBonus: 1, description: '公司船只上限 +1 艘，飞船需另行采购' },
  { id: 'modular_cargo', name: '模块货舱', category: '载量', companyLevel: 17, requires: ['distributed_storage'], capacityBonus: 0.04, description: '全船队载货量 +4%，按整舱位取整' },
  { id: 'adaptive_bulkheads', name: '适配舱壁', category: '载量', companyLevel: 17, requires: ['modular_cargo'], capacityBonus: 0.04, description: '全船队载货量 +4%，按整舱位取整' },
  { id: 'regional_arbitrage', name: '区域调价', category: '收益', companyLevel: 17, requires: ['settlement_network'], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'interstellar_docks', name: '星际船坞', category: '船队扩容', companyLevel: 17, requires: ['hub_coordination'], shipSlotBonus: 2, description: '公司船只上限 +2 艘，飞船需另行采购' },
  { id: 'trade_network', name: '星际商盟', category: '收益', companyLevel: 18, requires: ['regional_arbitrage'], profitBonus: 0.02, description: '可盈利商路的单趟净利 +2%' },
  { id: 'alliance_dividends', name: '商盟分红', category: '收益', companyLevel: 18, requires: ['trade_network'], profitBonus: 0.03, description: '可盈利商路的单趟净利 +3%' },
  { id: 'alliance_berths', name: '商盟泊位', category: '船队扩容', companyLevel: 18, requires: ['interstellar_docks'], shipSlotBonus: 2, description: '公司船只上限 +2 艘，飞船需另行采购' },
].map((tech, index, techs) => {
  const companyLevel = 1 + Math.round(index * (MERCHANT_COMPANY_RULES.maxLevel - 1) / (techs.length - 1));
  return Object.freeze({ ...tech, legacyCompanyLevel: tech.companyLevel, companyLevel,
    snapshotRequires: Object.freeze([...tech.requires]),
    requires: Object.freeze([...new Set([...tech.requires, ...(techBranchRequirements[tech.id] || [])])]),
    milestone: MERCHANT_TECH_MILESTONES[tech.id] ? Object.freeze({ ...MERCHANT_TECH_MILESTONES[tech.id] }) : null,
    cost: getMerchantTechPricing(tech, companyLevel).cost });
}));

// v30 及更早的属性研发对应拆分后的整组；保留旧档已购买的效果与航次快照。
export const MERCHANT_LEGACY_TECH_GROUPS = Object.freeze({
  efficient_engines: ['efficient_engines', 'thruster_calibration', 'fuel_injection'],
  engine_tuning: ['engine_cooling', 'vector_nozzles', 'cruise_tuning', 'autopilot_trim', 'engine_tuning'],
  advanced_engines: ['ion_channels', 'plasma_flow', 'warp_alignment', 'field_stabilization', 'navigation_precision', 'advanced_engines', 'jump_efficiency'],
  cargo_racks: ['cargo_partitions', 'loading_frames', 'storage_layout', 'pallet_system', 'cargo_racks'],
  cargo_expansion: ['rack_reinforcement', 'container_stacking', 'hold_balancing', 'cargo_connectors', 'cargo_expansion'],
  modular_cargo: ['lightweight_containers', 'compression_cradles', 'distributed_storage', 'modular_cargo', 'adaptive_bulkheads'],
  trade_contracts: ['trade_quotes', 'local_contracts', 'trade_contracts'],
  trade_negotiation: ['payment_terms', 'fulfillment_protocol', 'margin_audits', 'partner_rebates', 'trade_negotiation'],
  trade_network: ['freight_pricing', 'distribution_terms', 'volume_contracts', 'settlement_network', 'regional_arbitrage', 'trade_network', 'alliance_dividends'],
});

export const MERCHANT_18_LEVEL_MAP = Object.freeze(Object.fromEntries(MERCHANT_COMPANY_ANCHORS.map(stage => [stage.legacyLevel, stage.level])));
// v27 及更早先按原六级能力对应的十八级节点，再转换到百级。
export const MERCHANT_LEGACY_LEVEL_MAP = Object.freeze(Object.fromEntries(Object.entries({ 1: 3, 2: 6, 3: 9, 4: 12, 5: 15, 6: 18 })
  .map(([oldLevel, level]) => [oldLevel, MERCHANT_18_LEVEL_MAP[level]])));

// 普通费用保持原梯度的起点及分段锚点；每五级仅用突破操作进入下一阶段。
// 突破费用 = 升到当前阶段第五级的普通费用 × N，N = 2 + 0.5 × (阶段序号 - 1)。
export const MERCHANT_COMPANY_LEVELS = Object.freeze(Array.from({ length: MERCHANT_COMPANY_RULES.maxLevel }, (_, index) => {
  const level = index + 1;
  const tier = Math.ceil(level / MERCHANT_COMPANY_RULES.levelsPerTier);
  const isBreakthrough = level < MERCHANT_COMPANY_RULES.maxLevel && level % MERCHANT_COMPANY_RULES.levelsPerTier === 0;
  const breakthroughFactor = isBreakthrough ? companyTierFactor(level) : null;
  const breakthroughBaseCost = isBreakthrough ? companyBaseValue(level - 1, 'upgradeCost') : null;
  const ordinaryUpgradeCost = level === MERCHANT_COMPANY_RULES.maxLevel ? null : companyBaseValue(level, 'upgradeCost');
  const upgradeCost = level === MERCHANT_COMPANY_RULES.maxLevel ? null : isBreakthrough ? Math.ceil(breakthroughBaseCost * breakthroughFactor) : ordinaryUpgradeCost;
  const shipLimit = companyBaseValue(level, 'shipLimit');
  const shipLimitIncrease = level > 1 ? shipLimit - companyBaseValue(level - 1, 'shipLimit') : 0;
  const techs = MERCHANT_TECHS.filter(tech => tech.companyLevel === level);
  const researchShipSlots = MERCHANT_TECHS.filter(tech => tech.companyLevel <= level).reduce((sum, tech) => sum + (tech.shipSlotBonus || 0), 0);
  return Object.freeze({ level, tier, tierStartLevel: (tier - 1) * 5 + 1, tierEndLevel: tier * 5, shipLimit, researchShipSlots,
    isBreakthrough, breakthroughFactor, breakthroughBaseCost, ordinaryUpgradeCost, upgradeCost,
    unlock: techs.length ? `${techs.length} 项研发资格` : '',
    description: [shipLimitIncrease ? `基础船位 +${shipLimitIncrease}` : '',
      techs.length ? `开放${techs.map(tech => tech.name).join('、')}研发资格` : ''].filter(Boolean).join('；'),
  });
}));

export const MERCHANT_VIEW_LEVELS = Object.freeze({ tasks: 1, starmap: 1, reports: 1, ships: 15, market: 20 });

export function isMerchantViewUnlocked(merchant, view) {
  const level = MERCHANT_VIEW_LEVELS[view];
  if (!level) return false;
  if (view === 'ships') return merchant?.researchedTechIds?.includes('fleet_command') || false;
  if (view === 'market') return merchant?.researchedTechIds?.includes('market_network') || false;
  if ((merchant?.companyLevel || 1) >= level) return true;
  return false;
}

export const MERCHANT_EXPLORATION_RULES = Object.freeze({
  companyLevel: 24,
  targetPortId: 'nebula_forge',
  techId: 'planet_survey',
  minDelayMs: 0,
  maxDelayMs: 0,
  surveyMs: 30_000,
  cost: 360,
});

export const MERCHANT_EXPLORATION_TARGETS = Object.freeze([
  Object.freeze({ ...MERCHANT_EXPLORATION_RULES, requiresPorts: [] }),
  Object.freeze({ companyLevel: 57, techId: 'deep_survey', targetPortId: 'aurora_depot', requiresPorts: ['nebula_forge'], minDelayMs: 45_000, maxDelayMs: 90_000, surveyMs: 60_000, cost: 1800 }),
]);

export const MERCHANT_INTELLIGENCE = Object.freeze([
  Object.freeze({ id: 'forge_coordinates', type: 'planet', companyLevel: 20, targetPortId: 'nebula_forge', cost: 180,
    title: '外围工业星球情报', summary: '获取一颗未知工业星球的身份、产业线索与勘察坐标。',
    detail: '星云工厂拥有工具生产设施，对矿石与粮食存在需求，可扩展现有商圈。' }),
  Object.freeze({ id: 'aurora_coordinates', type: 'planet', companyLevel: 50, targetPortId: 'aurora_depot', cost: 600,
    title: '远域原料星球情报', summary: '获取远域资源星球的身份与勘察坐标，寻找新的大宗货源。',
    detail: '极光原料港储有大宗工业原料，适合向工业星域供货；航程较长，需要兼顾运力和周转。' }),
]);

export const MERCHANT_EXPLORATION_DEFAULTS = Object.freeze({ rngState: 0, nextEventAt: 0, nextPortId: null, event: null, completed: [] });
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
  analyticsMinutes: 60,
});

export const MERCHANT_DISTANCES = Object.freeze({
  'mineral_belt:sol_prime': 1,
  'mineral_belt:nebula_forge': 1.35,
  'nebula_forge:sol_prime': 1.8,
  'aurora_depot:sol_prime': 3.2,
  'aurora_depot:mineral_belt': 2.8,
  'aurora_depot:nebula_forge': 2.5,
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
  purchasedIntelIds: [],
  exploration: MERCHANT_EXPLORATION_DEFAULTS,
  onboarding: MERCHANT_ONBOARDING_DEFAULTS,
  ships: [{ id: 'ship-1', typeId: 'courier', taskId: null, phase: 'idle', arriveAt: 0, departAt: 0, trip: null }],
  tasks: [],
  history: [],
  analytics: { since: 0, routes: [], fleet: [] },
  markets: {},
  lastCatchupMs: 0,
});
