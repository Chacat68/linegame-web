import { describe,expect,it } from 'vitest';
import { DataUtils,Scene } from 'three';
import { createReflectionSource,createSceneLighting } from '../js/ui/SceneLighting.js';
import { createSceneMaterial } from '../js/ui/SceneMaterials.js';

describe('共享光照与材质',()=>{
  it('反射源保留 HDR 范围，接缝和两极连续且没有非有限值',()=>{
    const texture=createReflectionSource(64,32);
    const {data,width,height}=texture.image;
    const linear=Array.from(data,value=>DataUtils.fromHalfFloat(value));
    expect(linear.every(Number.isFinite)).toBe(true);
    expect(Math.max(...linear)).toBeGreaterThan(1);
    for(let y=0;y<height;y++) {
      for(let channel=0;channel<4;channel++) expect(data[(y*width)*4+channel]).toBe(data[(y*width+width-1)*4+channel]);
    }
    for(const y of [0,height-1]) for(let x=1;x<width;x++) {
      expect(data[(y*width+x)*4]).toBe(data[y*width*4]);
    }
    texture.dispose();
  });

  it('灯光可幂等释放，已释放的灯组不可重新挂载',()=>{
    const scene=new Scene();
    const lighting=createSceneLighting(null);
    lighting.attach(scene);
    expect(scene.children).toContain(lighting.group);
    expect(lighting.dispose(scene)).toBe(true);
    expect(lighting.dispose(scene)).toBe(false);
    lighting.attach(scene);
    expect(scene.children).toHaveLength(0);
  });

  it('玻璃使用介电材质，矿石保持粗糙，材质实例互不污染',()=>{
    const glass=createSceneMaterial('glass');
    const rock=createSceneMaterial('rock');
    const first=createSceneMaterial('hull'),second=createSceneMaterial('hull');
    expect(glass.isMeshPhysicalMaterial).toBe(true);
    expect(glass.metalness).toBe(0);
    expect(glass.ior).toBeCloseTo(1.46);
    expect(rock.roughness).toBeGreaterThan(.9);
    first.color.set('#ff0000');
    expect(first.color.equals(second.color)).toBe(false);
    [glass,rock,first,second].forEach(material=>material.dispose());
  });
});
