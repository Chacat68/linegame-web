// 地点的静态实体：按材质合并几何，复用渲染器缓存和释放协议。
import {
  BoxGeometry, CylinderGeometry, Group, IcosahedronGeometry,
  Mesh, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSceneMaterial } from './SceneMaterials.js';

function combine(parts) {
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  return geometry;
}

function box(size, position, rotationY = 0) {
  return new BoxGeometry(...size).rotateY(rotationY).translate(...position);
}

function stationParts(layer, simple) {
  const parts = [];
  const segments = simple ? 24 : 64;
  if (layer === 'hull') {
    parts.push(new TorusGeometry(1, 0.115, 6, segments).rotateX(Math.PI / 2));
    parts.push(new CylinderGeometry(0.25, 0.34, 0.8, 8));
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      parts.push(box([1.8, 0.09, 0.1], [0, 0, 0], angle));
      parts.push(box([0.36, 0.18, 0.54], [Math.cos(angle) * 1.13, 0, Math.sin(angle) * 1.13], -angle));
    }
    parts.push(box([0.13, 0.12, 2.9], [0, -0.2, 0]));
  } else if (layer === 'panels') {
    for (const side of [-1, 1]) {
      for (const wing of [-1, 1]) {
        parts.push(box([0.63, 0.035, 0.4], [wing * 0.48, -0.18, side * 1.34]));
      }
    }
  } else {
    const count = simple ? 12 : 32;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2;
      parts.push(box([0.12, 0.045, 0.045], [Math.cos(angle), 0.108, Math.sin(angle)], -angle + Math.PI / 2));
    }
    parts.push(box([0.07, 0.05, 0.65], [0.23, 0.42, 0]));
    parts.push(box([0.07, 0.05, 0.65], [-0.23, 0.42, 0]));
  }
  return combine(parts);
}

function asteroidParts(layer, simple) {
  const parts = [];
  if (layer === 'rock') {
    const count = simple ? 8 : 18;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996;
      const spread = i === 0 ? 0 : 0.55 + (i % 5) * 0.17;
      const size = i === 0 ? 0.52 : 0.12 + (i % 4) * 0.06;
      parts.push(new IcosahedronGeometry(size, 0)
        .scale(1.3, 0.7 + (i % 3) * 0.17, 0.9)
        .rotateY(angle).rotateZ(angle * 0.3)
        .translate(Math.cos(angle) * spread, Math.sin(i * 4.7) * 0.2, Math.sin(angle) * spread * 0.72));
    }
  } else if (layer === 'hull') {
    parts.push(box([0.7, 0.16, 0.4], [0.6, 0.16, 0.55]));
    parts.push(box([0.07, 0.08, 0.85], [0.36, 0.26, 0.25], -0.5));
    parts.push(box([0.09, 0.64, 0.09], [0.83, 0.52, 0.55]));
  } else {
    parts.push(box([0.56, 0.025, 0.025], [0.6, 0.25, 0.76]));
    parts.push(box([0.12, 0.05, 0.12], [0.83, 0.87, 0.55]));
    for (let i = 0; i < 3; i++) parts.push(box([0.13, 0.12, 0.2], [0.42 + i * 0.18, 0.29, 0.54]));
  }
  return combine(parts);
}

export function createStarmapLandmark(kind, quality, getGeometry, unlocked = true) {
  const group = new Group();
  group.name = 'landmark-' + kind;
  const simple = quality === 'low';
  const layers = kind === 'asteroids' ? ['rock', 'hull', 'lights'] : ['hull', 'panels', 'lights'];
  for (const layer of layers) {
    const geometry = getGeometry('landmark-' + kind + '-' + layer + '-' + (simple ? 'low' : 'full'),
      () => kind === 'asteroids' ? asteroidParts(layer, simple) : stationParts(layer, simple));
    const material = createSceneMaterial(layer==='lights'?'light':layer,
      unlocked ? {} : {color:'#4b5764',emissive:'#000000'});
    const mesh = new Mesh(geometry, material);
    mesh.name = layer;
    group.add(mesh);
  }
  return group;
}

// 软雕塑般的云团和港口建筑，仅是球面装饰，没有独立的经营状态。
export function createPlanetSurfaceDetails(type, quality, getGeometry) {
  const group = new Group();
  group.name = 'planet-surface-details';
  if (!['agricultural', 'industrial'].includes(type)) return group;
  const simple = quality === 'low';
  if (type === 'industrial') {
    // 建筑沿球面法线贴地排列，避免未对齐的高烟囱和白色云团像尖刺。
    const geometry = getGeometry('industrial-surface-block', () => new BoxGeometry(.12, .035, .1));
    const hull = createSceneMaterial('hull', { color: '#bca58d' });
    const accent = createSceneMaterial('accent', { color: '#cb977a' });
    for (let index = 0; index < (simple ? 2 : 4); index++) {
      const normal = new Vector3(-.35 + index * .13, .58, .8).normalize();
      const building = new Mesh(geometry, index % 2 ? accent : hull);
      building.position.copy(normal).multiplyScalar(1.005);
      building.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), normal);
      group.add(building);
    }
    return group;
  }
  const sphere = getGeometry('soft-cloud-' + quality, () => new SphereGeometry(1, simple ? 8 : 16, simple ? 6 : 12));
  const cloud = createSceneMaterial('hull', { color: '#f0dfd2', metalness: 0, roughness: 1 });
  const positions = [[-.62,.64,.52],[.62,.22,.77],[-.28,-.68,.7]];
  for (const [x, y, z] of positions) {
    for (let index = 0; index < (simple ? 2 : 4); index++) {
      const puff = new Mesh(sphere, cloud);
      puff.position.set(x + (index - 1.5) * .07, y + Math.sin(index * 2) * .035, z).normalize().multiplyScalar(1.015);
      puff.scale.set(.11 + index % 2 * .025, .075, .105);
      group.add(puff);
    }
  }
  const structure = getGeometry('soft-port-structure', () => new BoxGeometry(.11,.13,.15));
  const hull = createSceneMaterial('hull'), accent = createSceneMaterial('accent');
  for (let index = 0; index < (simple ? 2 : 4); index++) {
    const building = new Mesh(structure, index % 2 ? accent : hull);
    const angle = -.5 + index * .23;
    building.position.set(Math.sin(angle) * .78, .62, Math.cos(angle) * .78);
    building.lookAt(0,0,0);
    group.add(building);
  }
  return group;
}
