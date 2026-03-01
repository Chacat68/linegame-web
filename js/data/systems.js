// js/data/systems.js — 星系(Galaxy)与星球(Planet)定义（含程序化生成）
// 依赖：无
// 导出：GALAXIES, SYSTEMS, FUEL_COST_PER_UNIT,
//        GALAXY_JUMP_FUEL, GALAXY_JUMP_DAYS,
//        findSystem, getSystemsByGalaxy, findGalaxy

/* ── 确定性伪随机 ── */
function _rng(seed) {
  let s = seed | 0 || 1;
  return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/* ── 名称生成 ── */
const _P = [
  '星','云','暗','光','远','深','新','古','暮','晨','极','赤','紫','碧','铁','金','银','冰','焰','雷',
  '苍','翠','玄','朱','墨','白','黑','青','丹','霜','岚','幽','瑶','琉','华','炎','霞','珀','灵','隐',
  '寒','烈','玉','龙','凤','天','元','恒','曦','瀚'];
const _S = [
  '港','站','堡','域','城','湾','垒','峰','渊','洲','岛','原','关','界','殿','台','都','谷','塔','坊',
  '阙','海','泽','野','陵','丘','核','环','弧','点'];
function _genName(r, used) {
  for (let i = 0; i < 80; i++) {
    const n = _P[r() * _P.length | 0] + _S[r() * _S.length | 0];
    if (!used.has(n)) { used.add(n); return n; }
  }
  const f = _P[r() * _P.length | 0] + _S[r() * _S.length | 0] + '-' + (r() * 900 + 100 | 0);
  used.add(f); return f;
}

/* ── 星球类型模板 ── */
const _TYPES = [
  { t:'agricultural',l:'农业',c:['#4CAF50','#66BB6A','#81C784'],b:{food:.5,water:.6,minerals:1.3,technology:1.7,luxury:1.8,weapons:1.5,medicine:1.2,fuel:.9}},
  { t:'technology',l:'科技',c:['#2196F3','#42A5F5','#64B5F6'],b:{food:1.6,water:1.4,minerals:1.3,technology:.4,luxury:1.4,weapons:1.2,medicine:.7,fuel:.9}},
  { t:'mining',l:'矿业',c:['#FF9800','#FFA726','#FFB74D'],b:{food:1.5,water:1.3,minerals:.4,technology:1.4,luxury:1.7,weapons:1.3,medicine:1.4,fuel:.6}},
  { t:'commercial',l:'商业',c:['#9C27B0','#AB47BC','#CE93D8'],b:{food:1.2,water:1.1,minerals:1.3,technology:1.1,luxury:.6,weapons:1.5,medicine:1.2,fuel:1}},
  { t:'military',l:'军事',c:['#E91E63','#EC407A','#F06292'],b:{food:1.8,water:1.6,minerals:1.4,technology:1.3,luxury:2,weapons:.4,medicine:2,fuel:1.2}},
  { t:'medical',l:'医疗',c:['#00BCD4','#26C6DA','#4DD0E1'],b:{food:1.4,water:1.2,minerals:1.5,technology:.8,luxury:1.4,weapons:1.6,medicine:.4,fuel:1}},
  { t:'industrial',l:'工业',c:['#FF7043','#FF8A65','#FFAB91'],b:{food:1.4,water:1.2,minerals:.6,technology:.8,luxury:1.5,weapons:.7,medicine:1.4,fuel:.8}},
  { t:'energy',l:'能源',c:['#FFEE58','#FFF176','#FFF59D'],b:{food:1.5,water:1.3,minerals:1.2,technology:1.2,luxury:1.6,weapons:1.4,medicine:1.5,fuel:.3}},
  { t:'research',l:'研究',c:['#66BB6A','#81C784','#A5D6A7'],b:{food:1.3,water:1.1,minerals:1.6,technology:.5,luxury:1.3,weapons:1.8,medicine:.4,fuel:1}},
  { t:'special',l:'特殊',c:['#607D8B','#78909C','#90A4AE'],b:{food:.9,water:.8,minerals:.7,technology:.8,luxury:.7,weapons:.6,medicine:.8,fuel:.7}},
];
const _DESC = {
  agricultural:['粮食产地','生态农场','田园殖民地'],technology:['科研前哨','数据中心','技术枢纽'],
  mining:['矿产殖民地','采掘站','矿石加工站'],commercial:['贸易中转站','商贸枢纽','自由市场'],
  military:['军事基地','防御前线','前哨要塞'],medical:['医疗站','制药中心','疗养殖民地'],
  industrial:['工厂群','制造中心','重工基地'],energy:['能源站','核聚变环','反物质站'],
  research:['实验站','观测台','学术前哨'],special:['神秘星球','独立殖民地','异常前哨'],
};
function _pickType(r, bias) {
  if (bias && r() < .55) { const f = _TYPES.find(x => x.t === bias[r() * bias.length | 0]); if (f) return f; }
  return _TYPES[r() * _TYPES.length | 0];
}
function _genPrices(r, base) {
  const p = {}; for (const k in base) p[k] = Math.round(base[k] * (.7 + r() * .6) * 100) / 100; return p;
}

/* ── 星系定义 ── */
export const GALAXIES = [
  { id:'milky_way',        name:'银河系',     description:'人类文明的发源地，资源均衡的标准星系',
    color:'#4FC3F7', icon:'🌌', gx:.35, gy:.45, unlocked:true,  techRequired:null,
    targetCount:30, seed:42,  typeBias:null },
  { id:'andromeda',        name:'仙女座星系', description:'科技高度发达的星系，先进文明的遗产遍布其中',
    color:'#AB47BC', icon:'🔮', gx:.75, gy:.25, unlocked:false, techRequired:'hyperspace_jump',
    targetCount:40, seed:137, typeBias:['technology','research','medical'] },
  { id:'orion_arm',        name:'猎户座旋臂', description:'矿产丰富但战事频繁的边陲星域',
    color:'#FF7043', icon:'⚔️', gx:.65, gy:.75, unlocked:false, techRequired:'hyperspace_jump',
    targetCount:25, seed:256, typeBias:['military','mining','industrial'] },
  { id:'magellanic_cloud', name:'麦哲伦星云', description:'奢华与商贸的天堂，银河巨贾的聚集地',
    color:'#FFD54F', icon:'💎', gx:.20, gy:.75, unlocked:false, techRequired:'hyperspace_jump',
    targetCount:35, seed:512, typeBias:['commercial','agricultural','energy'] },
  { id:'dark_sector',      name:'暗星域',     description:'危机四伏的未知领域，蕴藏难以想象的财富',
    color:'#78909C', icon:'🕳️', gx:.50, gy:.15, unlocked:false, techRequired:'hyperspace_jump',
    targetCount:20, seed:666, typeBias:['special','military'] },
];

/* ── 银河系种子星球 ── */
const _SEEDS_MW = [
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

  // ── 新增星系 ──
  {
    id: 'nebula_forge', name: '星云工厂',
    x: 0.30, y: 0.52, color: '#FF7043', type: 'industrial', typeLabel: '工业',
    description: '利用星云气体驱动的巨型工业综合体，制造业发达',
    prices: { food:1.5, water:1.3, minerals:0.5, technology:0.7, luxury:1.6, weapons:0.6, medicine:1.5, fuel:0.7 },
  },
  {
    id: 'frontier_outpost', name: '边境哨站',
    x: 0.05, y: 0.55, color: '#8D6E63', type: 'military', typeLabel: '军事',
    description: '银河边缘的军事前哨，物资匮乏但走私猖獗',
    prices: { food:2.2, water:2.0, minerals:1.3, technology:1.6, luxury:2.5, weapons:0.5, medicine:2.2, fuel:1.4 },
  },
  {
    id: 'free_port', name: '自由港',
    x: 0.55, y: 0.08, color: '#26C6DA', type: 'commercial', typeLabel: '商业',
    description: '不受任何派系管辖的自由贸易区，零关税天堂',
    prices: { food:0.9, water:0.9, minerals:0.9, technology:0.9, luxury:0.7, weapons:0.8, medicine:0.9, fuel:0.9 },
  },
  {
    id: 'gene_lab', name: '基因实验室',
    x: 0.92, y: 0.12, color: '#66BB6A', type: 'research', typeLabel: '研究',
    description: '前沿基因工程研究所，高端医疗与生物科技的摇篮',
    prices: { food:1.3, water:1.1, minerals:1.8, technology:0.5, luxury:1.4, weapons:2.0, medicine:0.3, fuel:1.1 },
  },
  {
    id: 'ruin_star', name: '废墟星',
    x: 0.38, y: 0.92, color: '#78909C', type: 'special', typeLabel: '遗迹',
    description: '远古文明遗迹所在地，偶尔出土价值连城的古物',
    prices: { food:1.8, water:1.6, minerals:0.7, technology:0.6, luxury:0.4, weapons:1.4, medicine:1.8, fuel:0.8 },
  },
  {
    id: 'energy_core', name: '能源核心',
    x: 0.78, y: 0.48, color: '#FFEE58', type: 'energy', typeLabel: '能源',
    description: '围绕恒星建造的戴森球能源站，燃料取之不尽',
    prices: { food:1.6, water:1.4, minerals:1.3, technology:1.2, luxury:1.8, weapons:1.5, medicine:1.6, fuel:0.2 },
  },
  {
    id: 'wormhole_nexus', name: '虫洞枢纽',
    x: 0.18, y: 0.12, color: '#CE93D8', type: 'commercial', typeLabel: '枢纽',
    description: '天然虫洞交汇点，四通八达的星际物流中转站',
    prices: { food:1.1, water:1.0, minerals:1.1, technology:1.3, luxury:1.2, weapons:1.3, medicine:1.1, fuel:0.5 },
  },
  {
    id: 'exile_colony', name: '流放地',
    x: 0.62, y: 0.95, color: '#A1887F', type: 'special', typeLabel: '特殊',
    description: '被遗忘的殖民星球，罪犯与流亡者的栖身之所',
    prices: { food:0.6, water:0.5, minerals:0.8, technology:1.9, luxury:2.3, weapons:0.7, medicine:2.0, fuel:1.3 },
  },
];

/* ── 其他星系种子星球 ── */
const _SEEDS_OTHER = {
  andromeda: [
    { id:'citadel_prime', name:'学术圣殿', x:.50, y:.45, color:'#7C4DFF', type:'research', typeLabel:'研究',
      description:'仙女座最大的学术中心', prices:{food:1.3,water:1.1,minerals:1.5,technology:.3,luxury:1.5,weapons:2,medicine:.4,fuel:.9}},
    { id:'quantum_lab', name:'量子实验场', x:.28, y:.22, color:'#448AFF', type:'technology', typeLabel:'科技',
      description:'量子力学尖端实验设施', prices:{food:1.8,water:1.5,minerals:1.6,technology:.3,luxury:1.8,weapons:1.5,medicine:.5,fuel:1}},
    { id:'harmony_world', name:'和谐世界', x:.72, y:.68, color:'#69F0AE', type:'agricultural', typeLabel:'农业',
      description:'仙女座的粮仓星球', prices:{food:.3,water:.4,minerals:1.5,technology:2,luxury:2.2,weapons:2.5,medicine:1.5,fuel:.8}},
    { id:'neon_bazaar', name:'霓虹集市', x:.82, y:.30, color:'#FF4081', type:'commercial', typeLabel:'商业',
      description:'仙女座最繁华的不夜城', prices:{food:1.1,water:1,minerals:1.2,technology:.8,luxury:.4,weapons:1.3,medicine:1,fuel:.9}},
  ],
  orion_arm: [
    { id:'iron_fortress', name:'铁壁要塞', x:.40, y:.35, color:'#D50000', type:'military', typeLabel:'军事',
      description:'猎户座旋臂最坚固的堡垒', prices:{food:2.2,water:1.9,minerals:1.2,technology:1.5,luxury:2.8,weapons:.3,medicine:2.5,fuel:1.3}},
    { id:'deep_mine', name:'深渊矿井', x:.65, y:.60, color:'#FF6D00', type:'mining', typeLabel:'矿业',
      description:'深入星球核心的超级矿井', prices:{food:1.8,water:1.5,minerals:.2,technology:1.6,luxury:2,weapons:1.2,medicine:1.6,fuel:.5}},
    { id:'warmonger_dock', name:'战贩船坞', x:.25, y:.72, color:'#C62828', type:'industrial', typeLabel:'工业',
      description:'军火制造与战舰维修船坞', prices:{food:1.6,water:1.4,minerals:.6,technology:.9,luxury:1.8,weapons:.3,medicine:1.8,fuel:.7}},
  ],
  magellanic_cloud: [
    { id:'golden_palace', name:'黄金宫殿', x:.50, y:.40, color:'#FFD700', type:'commercial', typeLabel:'商业',
      description:'银河首富的私人空间站', prices:{food:1.5,water:1.3,minerals:1.8,technology:1.3,luxury:.3,weapons:2.2,medicine:1.5,fuel:1.1}},
    { id:'garden_eden', name:'伊甸园', x:.28, y:.25, color:'#00E676', type:'agricultural', typeLabel:'农业',
      description:'产出最优质食物与水源的星球', prices:{food:.3,water:.3,minerals:1.8,technology:2,luxury:1.8,weapons:2.5,medicine:1,fuel:.9}},
    { id:'plasma_reactor', name:'等离子炉', x:.75, y:.60, color:'#FFAB00', type:'energy', typeLabel:'能源',
      description:'麦哲伦星云最大的能源中心', prices:{food:1.4,water:1.2,minerals:1.1,technology:1,luxury:1.5,weapons:1.3,medicine:1.4,fuel:.15}},
    { id:'silk_road', name:'星际丝路', x:.60, y:.80, color:'#E040FB', type:'commercial', typeLabel:'商业',
      description:'商队络绎不绝的贸易枢纽', prices:{food:.8,water:.8,minerals:.9,technology:.9,luxury:.5,weapons:1,medicine:.9,fuel:.8}},
  ],
  dark_sector: [
    { id:'void_station', name:'虚空站', x:.50, y:.45, color:'#455A64', type:'special', typeLabel:'特殊',
      description:'一切交易不留痕迹的神秘空间站', prices:{food:.7,water:.6,minerals:.5,technology:.6,luxury:.5,weapons:.4,medicine:.6,fuel:.5}},
    { id:'dead_world', name:'死寂星', x:.22, y:.28, color:'#37474F', type:'special', typeLabel:'遗迹',
      description:'废墟中隐藏着远古文明的秘密', prices:{food:2.5,water:2,minerals:.5,technology:.4,luxury:.3,weapons:1,medicine:2.5,fuel:1.5}},
    { id:'pirate_haven', name:'海盗天堂', x:.78, y:.68, color:'#B71C1C', type:'military', typeLabel:'军事',
      description:'银河最大的海盗据点', prices:{food:1,water:.9,minerals:.7,technology:.8,luxury:.4,weapons:.3,medicine:1.5,fuel:.8}},
  ],
};

/* ── 程序化生成 ── */
function _gen(galaxyId, seed, targetCount, seedPlanets, typeBias) {
  const r = _rng(seed);
  const used = new Set(seedPlanets.map(p => p.name));
  const list = seedPlanets.map(p => Object.assign({}, p, { galaxyId: galaxyId }));
  const need = targetCount - seedPlanets.length;
  for (let i = 0; i < need; i++) {
    const tp = _pickType(r, typeBias);
    let x = .5, y = .5;
    for (let a = 0; a < 120; a++) {
      x = .05 + r() * .9; y = .05 + r() * .9;
      if (list.every(p => (p.x - x) ** 2 + (p.y - y) ** 2 > .004)) break;
    }
    const nm = _genName(r, used);
    const descs = _DESC[tp.t] || ['星球'];
    list.push({
      id: galaxyId + '_' + i, name: nm, galaxyId: galaxyId,
      x: x, y: y,
      color: tp.c[r() * tp.c.length | 0],
      type: tp.t, typeLabel: tp.l,
      description: nm + ' — ' + descs[r() * descs.length | 0],
      prices: _genPrices(r, tp.b),
      generated: true,
    });
  }
  return list;
}

/* ── 构建星球列表 ── */
const _all = [];
_all.push(..._gen('milky_way', 42, 30, _SEEDS_MW, null));
Object.entries(_SEEDS_OTHER).forEach(function (entry) {
  const gid = entry[0], seeds = entry[1];
  const g = GALAXIES.find(function (x) { return x.id === gid; });
  if (g) _all.push(..._gen(gid, g.seed, g.targetCount, seeds, g.typeBias));
});

const _byId = Object.create(null);
_all.forEach(function (p) { _byId[p.id] = p; });

/* ── 导出 ── */
export const SYSTEMS = _all;
export const FUEL_COST_PER_UNIT = 0.08;
export const GALAXY_JUMP_FUEL = 40;
export const GALAXY_JUMP_DAYS = 3;

export function findSystem(id) { return _byId[id] || null; }
export function getSystemsByGalaxy(gid) { return _all.filter(function (p) { return p.galaxyId === gid; }); }
export function findGalaxy(id) { return GALAXIES.find(function (g) { return g.id === id; }) || null; }
