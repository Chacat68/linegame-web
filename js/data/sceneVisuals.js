// 场景只读美术配置；尺寸和实体类别不参与航程、价格或存档计算。
export const SCENE_ART_DIRECTION = Object.freeze({
  hull: '#dfcfb8', armor: '#b2a08e', frame: '#514955', glass: '#476574',
  workLight: '#ffd49a', engineLight: '#83cbd7',
  metalness: 0.08, roughness: 0.86,
  keyColor: '#ffe4c4', keyIntensity: 2.7, keyPosition: Object.freeze([-130, 80, 60]),
  ambientColor: '#b5a5b9', ambientIntensity: 0.85,
  rimColor: '#a9b2d7', rimIntensity: 1.1, rimPosition: Object.freeze([110, 28, -120]),
  reflectionIntensity: 0.3,
  exposure: 1.08,
});

// 材质分工：漆面、裸露结构、玻璃和粗糙矿石分别控制高光宽度。
export const SCENE_MATERIALS = Object.freeze(Object.fromEntries(Object.entries({
  hull: { color: '#dfcfb8', metalness: .08, roughness: .86 },
  armor: { color: '#b2a08e', metalness: .12, roughness: .8 },
  frame: { color: '#514955', metalness: .12, roughness: .82 },
  glass: { color: '#3c677f', metalness: 0, roughness: .13, clearcoat: 1, clearcoatRoughness: .08, ior: 1.46, envMapIntensity: 1.3 },
  panels: { color: '#70687c', metalness: .06, roughness: .88 },
  accent: { color: '#d48669', metalness: .06, roughness: .86 },
  cargo: { color: '#c2a37b', metalness: .06, roughness: .9 },
  rock: { color: '#9d8274', metalness: .03, roughness: .96 },
  light: { color: '#ffd49a', emissive: '#ffc783', emissiveIntensity: 1.05, metalness: 0, roughness: .4 },
  engine: { color: '#83cbd7', emissive: '#83cbd7', emissiveIntensity: 1.2, metalness: 0, roughness: .3 },
}).map(([name,preset])=>[name,Object.freeze(preset)])));

const DEFAULT_VISUAL = Object.freeze({ bodyKind: 'planet', radius: 4.1, landmark: null });
const LOCATION_VISUALS = Object.freeze({
  sol_prime: Object.freeze({ bodyKind: 'planet', radius: 11, landmark: 'agri-port' }),
  mineral_belt: Object.freeze({ bodyKind: 'asteroids', radius: 10, landmark: null }),
  nebula_forge: Object.freeze({ bodyKind: 'planet', radius: 9, landmark: 'industrial-port' }),
});

const ENVIRONMENTS = Object.freeze(Object.fromEntries([
  ['milky_way', '#181c32', '#65517b', '#bd7959', '#e99b78', '#ffd1ac'],
  ['andromeda', '#111f34', '#43769c', '#677fa5', '#8ec9de', '#cef0f5'],
  ['orion_arm', '#291b2b', '#8a536b', '#bc8060', '#e69c83', '#ffd4bd'],
  ['magellanic_cloud', '#242034', '#97744c', '#776189', '#dab879', '#ffe4b0'],
  ['dark_sector', '#151a27', '#45485e', '#6b6077', '#a5a6c7', '#dfdef5'],
  ['phoenix_nebula', '#2b1929', '#ad6053', '#835578', '#ed9c83', '#ffceb3'],
  ['jade_expanse', '#152b31', '#497d71', '#617d99', '#9dcbb4', '#d5eddb'],
  ['chrono_rift', '#211c36', '#865f9f', '#6173a1', '#bea1db', '#e6d2f5'],
].map(([id, background, nebula, dust, accent, accentLight]) => [id, Object.freeze({ background, nebula, dust, accent, accentLight })])));

export function getLocationVisual(system) {
  const id = system && system.id;
  return Object.hasOwn(LOCATION_VISUALS, id) ? LOCATION_VISUALS[id] : DEFAULT_VISUAL;
}

export function getSceneEnvironment(galaxyId) {
  return Object.hasOwn(ENVIRONMENTS, galaxyId) ? ENVIRONMENTS[galaxyId] : ENVIRONMENTS.milky_way;
}
