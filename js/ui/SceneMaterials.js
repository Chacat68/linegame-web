// 同一套 PBR 参数服务实时星图与离线展示图；材质由调用者独立持有。
import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { SCENE_MATERIALS } from '../data/sceneVisuals.js';

export function createSceneMaterial(kind, overrides = {}) {
  const preset=Object.hasOwn(SCENE_MATERIALS,kind)?SCENE_MATERIALS[kind]:SCENE_MATERIALS.hull;
  const Material=kind==='glass'?MeshPhysicalMaterial:MeshStandardMaterial;
  const material=new Material({...preset,...overrides});
  material.name=kind;
  return material;
}
