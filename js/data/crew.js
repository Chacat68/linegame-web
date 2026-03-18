// js/data/crew.js — 船员职业、成长与人才市场定义
// 依赖：无
// 导出：CREW_ROLES, CREW_SPECIALTIES, CREW_MARKET_CONFIG,
//       CREW_NAME_POOLS, getCrewRoleDef, getCrewRoleLabel, getCrewSpecialtyDef

export const CREW_MARKET_CONFIG = {
  refreshIntervalDays: 3,
  baseOfferCount: 3,
  maxOfferCount: 5,
};

export const CREW_ROLE_NAMES = {
  pilot: '领航员',
  engineer: '轮机师',
  quartermaster: '货运主管',
  broker: '交易掮客',
};

export const CREW_ROLES = [
  {
    id: 'pilot',
    roleName: '领航员',
    emoji: '🧭',
    titles: ['巡航领航员', '星图解算员', '深空引航手'],
    baseHireCost: 360,
    baseWage: 88,
    baseEffect: { fuelEffMultiplier: 0.97 },
    growthPerLevel: { fuelEffMultiplier: 0.008 },
    expPerDay: 10,
    specialtyPool: ['route_savant', 'void_runner', 'convoy_scout'],
    marketWeightByType: {
      agricultural: 0.9,
      technology: 1.0,
      mining: 0.8,
      commercial: 1.1,
      military: 1.0,
      medical: 0.8,
      industrial: 0.8,
      energy: 0.9,
      research: 1.2,
      special: 1.0,
    },
    desc: '负责航线规划、燃料节奏与远距离航行稳定性。',
  },
  {
    id: 'engineer',
    roleName: '轮机师',
    emoji: '🔧',
    titles: ['轮机工程师', '损管技师', '反应堆维护员'],
    baseHireCost: 400,
    baseWage: 98,
    baseEffect: { autoRepair: 2 },
    growthPerLevel: { autoRepair: 0.8 },
    expPerDay: 10,
    specialtyPool: ['damage_control', 'salvage_rigger', 'reactor_tuner'],
    marketWeightByType: {
      agricultural: 0.7,
      technology: 1.0,
      mining: 1.1,
      commercial: 0.8,
      military: 1.1,
      medical: 0.8,
      industrial: 1.2,
      energy: 1.2,
      research: 0.9,
      special: 1.0,
    },
    desc: '负责维修、损管与关键设备维保。',
  },
  {
    id: 'quartermaster',
    roleName: '货运主管',
    emoji: '📦',
    titles: ['货舱统筹官', '装卸总监', '补给策划师'],
    baseHireCost: 430,
    baseWage: 108,
    baseEffect: { cargo: 4 },
    growthPerLevel: { cargo: 1.5 },
    expPerDay: 11,
    specialtyPool: ['container_architect', 'cold_chain_keeper', 'salvage_logistician'],
    marketWeightByType: {
      agricultural: 1.0,
      technology: 0.8,
      mining: 1.1,
      commercial: 1.2,
      military: 0.9,
      medical: 1.0,
      industrial: 1.2,
      energy: 0.9,
      research: 0.7,
      special: 1.0,
    },
    desc: '负责货舱编排、补给周转与高价值装载。',
  },
  {
    id: 'broker',
    roleName: '交易掮客',
    emoji: '💼',
    titles: ['市场顾问', '港务经纪人', '货主代表'],
    baseHireCost: 460,
    baseWage: 118,
    baseEffect: { buyDiscount: 0.01, sellBonus: 0.01 },
    growthPerLevel: { buyDiscount: 0.004, sellBonus: 0.004 },
    expPerDay: 12,
    specialtyPool: ['market_maker', 'luxury_curator', 'gray_channel'],
    marketWeightByType: {
      agricultural: 0.8,
      technology: 0.9,
      mining: 0.7,
      commercial: 1.3,
      military: 0.8,
      medical: 0.9,
      industrial: 0.8,
      energy: 0.8,
      research: 0.9,
      special: 1.2,
    },
    desc: '负责议价、渠道协调与高利润货盘撮合。',
  },
];

export const CREW_SPECIALTIES = [
  {
    id: 'route_savant',
    role: 'pilot',
    name: '主航路算师',
    shortLabel: '航路派',
    desc: '擅长在成熟航路中压低补给冗余与绕行成本。',
    bonusEffect: { fuelEffMultiplier: 0.94, buyDiscount: 0.01 },
    systemBias: ['commercial', 'technology', 'research'],
  },
  {
    id: 'void_runner',
    role: 'pilot',
    name: '深空跃迁手',
    shortLabel: '深空派',
    desc: '更适合长距离、补给稀缺的航线。',
    bonusEffect: { fuelEffMultiplier: 0.92 },
    systemBias: ['special', 'military', 'energy'],
  },
  {
    id: 'convoy_scout',
    role: 'pilot',
    name: '商队先导',
    shortLabel: '商队派',
    desc: '在高频短驳与密集贸易路线上表现更稳。',
    bonusEffect: { fuelEffMultiplier: 0.95, sellBonus: 0.01 },
    systemBias: ['agricultural', 'commercial', 'industrial'],
  },
  {
    id: 'damage_control',
    role: 'engineer',
    name: '损管主管',
    shortLabel: '损管派',
    desc: '专注船体修复与突发故障处理。',
    bonusEffect: { autoRepair: 2 },
    systemBias: ['military', 'mining', 'industrial'],
  },
  {
    id: 'salvage_rigger',
    role: 'engineer',
    name: '打捞改装师',
    shortLabel: '打捞派',
    desc: '擅长边修边改，顺手压榨出一些额外货舱空间。',
    bonusEffect: { autoRepair: 1, cargo: 2 },
    systemBias: ['special', 'mining', 'military'],
  },
  {
    id: 'reactor_tuner',
    role: 'engineer',
    name: '反应堆调谐师',
    shortLabel: '能机派',
    desc: '通过设备调谐间接改善能耗表现。',
    bonusEffect: { autoRepair: 1, fuelEffMultiplier: 0.96 },
    systemBias: ['energy', 'technology', 'research'],
  },
  {
    id: 'container_architect',
    role: 'quartermaster',
    name: '集装架构师',
    shortLabel: '仓储派',
    desc: '擅长标准化货柜排布，持续挤出装载空间。',
    bonusEffect: { cargo: 4 },
    systemBias: ['commercial', 'industrial', 'agricultural'],
  },
  {
    id: 'cold_chain_keeper',
    role: 'quartermaster',
    name: '冷链保全师',
    shortLabel: '冷链派',
    desc: '适合医药与高价值货物周转，也改善采购损耗。',
    bonusEffect: { cargo: 2, buyDiscount: 0.01 },
    systemBias: ['medical', 'technology', 'research'],
  },
  {
    id: 'salvage_logistician',
    role: 'quartermaster',
    name: '边境补给官',
    shortLabel: '边运派',
    desc: '在混乱港区与边境星球仍能维持高效周转。',
    bonusEffect: { cargo: 3, autoRepair: 1 },
    systemBias: ['special', 'military', 'mining'],
  },
  {
    id: 'market_maker',
    role: 'broker',
    name: '行情做市人',
    shortLabel: '做市派',
    desc: '擅长压价买入、抬价卖出，是公开市场的硬实力派。',
    bonusEffect: { buyDiscount: 0.02, sellBonus: 0.02 },
    systemBias: ['commercial', 'technology', 'industrial'],
  },
  {
    id: 'luxury_curator',
    role: 'broker',
    name: '高端货策展人',
    shortLabel: '奢品派',
    desc: '更懂得包装和出手高溢价货盘。',
    bonusEffect: { sellBonus: 0.03 },
    systemBias: ['commercial', 'medical', 'research'],
  },
  {
    id: 'gray_channel',
    role: 'broker',
    name: '灰渠联络人',
    shortLabel: '灰市派',
    desc: '兼顾公开市场与灰色渠道的模糊边界。',
    bonusEffect: { sellBonus: 0.025, buyDiscount: 0.005 },
    systemBias: ['special', 'military', 'commercial'],
  },
];

export const CREW_NAME_POOLS = {
  first: ['凌', '霍', '宋', '艾', '维', '阿', '白', '芙', '宁', '顾', '洛', '夏', '沈', '裴', '唐', '纪', '闻', '岳', '岑', '裘'],
  second: ['岚', '原', '柯', '莎', '诺', '沐', '栖', '雅', '弦', '彻', '衡', '澄', '岑', '越', '谙', '璃', '芮', '泠', '川', '霁'],
};

export function getCrewRoleDef(roleId) {
  return CREW_ROLES.find(function (role) {
    return role.id === roleId;
  }) || null;
}

export function getCrewSpecialtyDef(specialtyId) {
  return CREW_SPECIALTIES.find(function (specialty) {
    return specialty.id === specialtyId;
  }) || null;
}

export function getCrewRoleLabel(roleId) {
  var role = getCrewRoleDef(roleId);
  return role ? role.roleName : (CREW_ROLE_NAMES[roleId] || roleId);
}
