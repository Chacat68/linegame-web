// 原创舰船建模源。坐标：+X 舰首、+Y 上方、Z 横向；每个单位仅为美术尺度。
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, Shape } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSceneMaterial } from './SceneMaterials.js';

const ACCENTS = { shuttle: '#4aafb9', freighter: '#c7934c', clipper: '#549680', galleon: '#8b799f' };

function createBuilder(type) {
  const materials = {
    hull: createSceneMaterial('hull'),
    armor: createSceneMaterial('armor'),
    frame: createSceneMaterial('frame'),
    glass: createSceneMaterial('glass'),
    accent: createSceneMaterial('accent', { color: ACCENTS[type] }),
    cargo: createSceneMaterial('cargo'),
    light: createSceneMaterial('light'),
    engine: createSceneMaterial('engine'),
  };
  Object.entries(materials).forEach(([name, mat]) => { mat.name = name; });
  const engineSockets = [];
  const parts = Object.fromEntries(Object.keys(materials).map(key => [key, []]));
  function add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
    geometry.rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]).translate(...position);
    parts[material].push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
  }
  function box(size, position, material = 'hull', rotation) {
    add(new BoxGeometry(...size), material, position, rotation);
  }
  function hull(outline, height, y, material = 'hull', bevel = 0.045) {
    const shape = new Shape();
    outline.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, {
      depth: height, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel,
      bevelSegments: 1, curveSegments: 1, steps: 1,
    }).rotateX(-Math.PI / 2);
    add(geometry, material, [0, y, 0]);
  }
  function slab(x, z, length, width, y, height, material = 'hull', chamfer = 0.14) {
    const l = length / 2, w = width / 2, c = Math.min(chamfer, l / 2, w / 2);
    hull([[x-l+c,z-w],[x+l-c,z-w],[x+l,z-w+c],[x+l,z+w-c],[x+l-c,z+w],
      [x-l+c,z+w],[x-l,z+w-c],[x-l,z-w+c]], height, y, material, 0.03);
  }
  function engine(x, y, z, radius = 0.26, length = 0.85) {
    engineSockets.push({ position: [x-length/2-.1,y,z], radius });
    add(new CylinderGeometry(radius * 0.88, radius, length, 12), 'armor', [x,y,z], [0,0,Math.PI/2]);
    add(new CylinderGeometry(radius * 0.79, radius * 0.79, 0.09, 12), 'frame', [x-length/2-0.04,y,z], [0,0,Math.PI/2]);
    add(new CylinderGeometry(radius * 0.51, radius * 0.51, 0.095, 12), 'engine', [x-length/2-0.09,y,z], [0,0,Math.PI/2]);
    for (const dz of [-radius * 0.65, radius * 0.65]) box([length * 0.7, .045, .055], [x,y+radius*.73,z+dz], 'frame');
  }
  function vents(x, y, z, count = 5, length = 0.48) {
    box([count * .11 + .12, .04, length + .1], [x,y,z], 'armor');
    for (let i=0;i<count;i++) box([.045,.045,length], [x+(i-(count-1)/2)*.11,y+.025,z], 'frame');
  }
  function panel(x, z, length, width, y, material = 'hull') {
    slab(x,z,length,width,y,.045,material,.04);
    // 装甲搭接、紧固点和小面积掉漆，以真实结构替代随机噪点。
    for(const dx of [-length*.39,length*.39]) for(const dz of [-width*.32,width*.32]) {
      box([.035,.012,.035],[x+dx,y+.057,z+dz],'frame');
    }
    box([length*.15,.013,.025],[x-length*.31,y+.06,z-width*.45],'armor');
  }
  function container(x,z,y,scale=1,material='cargo') {
    slab(x,z,1.12*scale,.84*scale,y,.72*scale,material,.08);
    for(const dx of [-.41,.41]) box([.045,.78*scale,.89*scale],[x+dx*scale,y+.36*scale,z],'frame');
    for(let i=0;i<5;i++) box([.035,.035,.8*scale],[x+(i-2)*.13*scale,y+.75*scale,z],'armor');
    box([.25*scale,.02,.18*scale],[x,y+.765*scale,z],'hull');
  }
  function finish() {
    const group = new Group();
    group.name = type;
    group.userData = { assetVersion: 3, origin: 'project-original', forwardAxis: '+X', upAxis: '+Y', engineSockets };
    for(const [name, geometries] of Object.entries(parts)) {
      if (!geometries.length) { materials[name].dispose(); continue; }
      const merged = mergeGeometries(geometries);
      geometries.forEach(geometry=>geometry.dispose());
      const mesh = new Mesh(merged, materials[name]);
      mesh.name = `${type}-${name}`;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
  return { box, hull, slab, engine, vents, panel, container, finish };
}

function shuttle(b) {
  b.hull([[-2,-.63],[-.85,-.88],[1.3,-.6],[2.6,-.19],[2.6,.19],[1.3,.6],[-.85,.88],[-2,.63]],.5,.15);
  b.slab(-.9,0,1.8,1.25,.65,.24,'armor');
  b.hull([[-.4,-.45],[1.05,-.38],[1.62,-.16],[1.62,.16],[1.05,.38],[-.4,.45]],.36,.66,'frame');
  b.hull([[-.29,-.39],[.89,-.33],[1.46,-.14],[1.46,.14],[.89,.33],[-.29,.39]],.17,.94,'glass',.02);
  b.box([.06,.025,.72],[.17,1.13,0],'hull');
  for(const side of [-1,1]) {
    b.hull([[-1.8,side*.5],[-1.7,side*1.72],[-.92,side*1.68],[.65,side*.68]],.12,.27,'armor');
    b.hull([[-1.67,side*.98],[-1.6,side*1.55],[-1.14,side*1.52],[-.44,side*.97]],.035,.42,'accent',.015);
    b.engine(-1.74,.4,side*.78,.3,.9);
    b.box([.18,.06,.08],[-1.36,.48,side*1.66],'light');
    b.panel(.47,side*.57,.82,.19,.7);
    b.box([.64,.025,.13],[-.7,.94,side*.4],'accent');
  }
  b.vents(-1.25,.94,0,5,.42);
  b.panel(1.82,0,.66,.28,.72);
  b.slab(-.45,0,1.1,.68,-.09,.23,'frame');
}

function freighter(b) {
  b.slab(-.15,0,6.6,1.08,.08,.53,'frame');
  b.slab(-.35,0,5.2,3.38,.33,.22,'armor');
  b.slab(2.38,0,1.46,2.1,.51,.6);
  b.slab(2.42,0,1.02,1.27,1.15,.55);
  b.slab(2.58,0,.78,1.18,1.51,.23,'glass',.06);
  b.slab(2.18,0,.78,1.42,1.77,.065,'hull',.05);
  for(const side of [-1,1]) {
    for(let i=0;i<3;i++) b.container(-1.8+i*1.23,side*1.12,.65,1,i===1?'accent':'cargo');
    b.box([4.1,.14,.16],[-.55,.5,side*1.75],'accent');
    b.slab(-2.92,side*1.05,1.02,1.05,.44,.78,'hull');
    b.engine(-3.07,.8,side*1.06,.41,1.2);
    b.vents(-2.91,1.31,side*1.05,5,.68);
    b.box([.19,.05,.13],[2.92,1.11,side*.75],'light');
    b.panel(2.22,side*.82,.85,.28,1.16,'accent');
  }
  for(let i=0;i<3;i++) b.panel(-1.63+i*1.25,0,1.06,.63,.59);
  b.box([.16,.9,.1],[1.94,1.9,-.48],'frame');
  b.box([.09,.05,.09],[1.94,2.38,-.48],'light');
}

function clipper(b) {
  b.hull([[-3,-.46],[-1.8,-.67],[1.7,-.4],[4.4,-.055],[4.4,.055],[1.7,.4],[-1.8,.67],[-3,.46]],.29,.22);
  b.hull([[-2.3,-.27],[-.2,-.34],[2.15,-.15],[3.55,0],[2.15,.15],[-.2,.34],[-2.3,.27]],.21,.57,'accent');
  b.hull([[-.4,-.28],[.94,-.22],[1.62,-.06],[1.62,.06],[.94,.22],[-.4,.28]],.22,.82,'glass',.025);
  for(const side of [-1,1]) {
    b.hull([[-2.6,side*.3],[-3.45,side*2.1],[-2.47,side*2.03],[.7,side*.53]],.1,.29,'armor');
    b.hull([[-2.61,side*1.42],[-3.06,side*1.85],[-2.56,side*1.8],[-1.04,side*.73]],.035,.44,'accent',.015);
    b.slab(-2.37,side*1.62,2.75,.46,.46,.27,'hull');
    b.engine(-3.3,.59,side*1.62,.23,.83);
    b.panel(-1.93,side*1.62,1.2,.27,.79);
    b.box([.22,.04,.055],[-1.13,.65,side*1.84],'light');
    b.box([1.24,.04,.04],[1.66,.58,side*.22],'armor');
  }
  b.engine(-2.95,.49,0,.25,.75);
  b.vents(-1.72,.85,0,7,.31);
  // 薄片式散热鳍，快速帆船保留独特的纵向剪影。
  b.box([1.75,.76,.07],[-1.88,1.11,-.24],'hull',[0,0,-.2]);
  b.box([1.38,.13,.085],[-1.91,1.46,-.24],'accent',[0,0,-.2]);
}

function galleon(b) {
  b.hull([[-3.6,-1.22],[-2.75,-1.7],[1.5,-1.65],[3.4,-1.08],[3.8,-.58],[3.8,.58],[3.4,1.08],[1.5,1.65],[-2.75,1.7],[-3.6,1.22]],.76,.13,'armor');
  b.hull([[-3.3,-1.18],[-2.5,-1.47],[1.42,-1.42],[3.3,-.97],[3.58,-.47],[3.58,.47],[3.3,.97],[1.42,1.42],[-2.5,1.47],[-3.3,1.18]],.28,.95);
  b.slab(-.2,0,5.7,1.33,1.28,.47,'frame');
  for(const side of [-1,1]) {
    b.slab(-.43,side*1.66,5.18,.72,.37,.68,'hull');
    for(let i=0;i<4;i++) {
      b.container(-2.24+i*1.03,side*1.01,1.28,.75,i%2?'cargo':'accent');
      b.panel(-2.15+i*1.09,side*1.77,.91,.34,1.12);
      b.box([.33,.075,.03],[-2.14+i*1.08,.78,side*2.035],'light');
    }
    for(const row of [0,1]) b.engine(-3.39,.6+row*.69,side*.88,.32,.95);
    b.engine(-3.21,.75,side*1.61,.35,1.13);
    b.panel(2.78,side*.58,1.12,.52,1.28);
    b.box([.67,.035,.11],[2.77,1.355,side*.61],'accent');
  }
  b.slab(-1.42,0,2.12,1.22,1.79,.48,'armor');
  b.slab(-1.49,0,1.82,1.01,2.32,.22,'glass');
  b.slab(-1.57,0,2.09,1.22,2.6,.11,'hull');
  b.slab(-1.97,0,.74,.6,2.77,.35,'armor');
  b.box([.1,.67,.1],[-2.17,3.3,-.16],'frame');
  b.box([.065,.05,.065],[-2.17,3.65,-.16],'light');
  for(let i=0;i<3;i++) b.panel(.24+i*.78,0,.64,.98,1.81,'hull');
  b.vents(-2.96,1.38,0,5,.63);
}

export function createShipAsset(type) {
  const factories = { shuttle, freighter, clipper, galleon };
  if (!Object.hasOwn(factories,type)) throw new Error('未知舰船资产：' + type);
  const builder = createBuilder(type);
  factories[type](builder);
  return builder.finish();
}
