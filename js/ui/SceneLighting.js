// 星图与资产制作共用的灯光和反射环境。环境只生成一次，销毁时归还 GPU 资源。
import {
  AmbientLight, Color, DataTexture, DataUtils, DirectionalLight, EquirectangularReflectionMapping,
  Group, HalfFloatType, LinearFilter, RGBAFormat, Vector3,
} from 'three';
import { PMREMGenerator } from 'three/src/extras/PMREMGenerator.js';
import { SCENE_ART_DIRECTION as art } from '../data/sceneVisuals.js';

export function createReflectionSource(width = 256, height = 128) {
  const pixels = new Float32Array(width * height * 4);
  const key = new Vector3(...art.keyPosition).normalize();
  const rim = new Vector3(...art.rimPosition).normalize();
  const overhead = new Vector3(-.3,1,-.3).normalize();
  const warm = new Color(art.keyColor), cool = new Color(art.rimColor);
  const direction = new Vector3();
  for(let y=0;y<height;y++) {
    const latitude = y/(height-1)*Math.PI;
    for(let x=0;x<width;x++) {
      const longitude = x/(width-1)*Math.PI*2;
      direction.set(-Math.cos(longitude)*Math.sin(latitude),Math.cos(latitude),Math.sin(longitude)*Math.sin(latitude));
      const keySoftbox = Math.exp((direction.dot(key)-1)*26)*5;
      const rimSoftbox = Math.exp((direction.dot(rim)-1)*18)*2.4;
      const ceiling = Math.exp((direction.dot(overhead)-1)*5)*.75;
      const ambient = .035 + Math.max(direction.y,0)*.025;
      const offset=(y*width+x)*4;
      pixels[offset] = ambient*.65+keySoftbox*warm.r+rimSoftbox*cool.r+ceiling*.82;
      pixels[offset+1] = ambient*.85+keySoftbox*warm.g+rimSoftbox*cool.g+ceiling*.93;
      pixels[offset+2] = ambient+keySoftbox*warm.b+rimSoftbox*cool.b+ceiling;
      pixels[offset+3] = 1;
    }
  }
  const halfPixels=Uint16Array.from(pixels,value=>DataUtils.toHalfFloat(value));
  const texture = new DataTexture(halfPixels,width,height,RGBAFormat,HalfFloatType);
  texture.name = 'scene-reflection-source';
  texture.mapping = EquirectangularReflectionMapping;
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createSceneLighting(renderer, options = {}) {
  const group = new Group();
  group.name='scene-lighting';
  const ambient = new AmbientLight(art.ambientColor,art.ambientIntensity);
  const key = new DirectionalLight(art.keyColor,art.keyIntensity);
  key.position.set(...art.keyPosition).multiplyScalar(options.scale || 1);
  const rim = new DirectionalLight(art.rimColor,art.rimIntensity);
  rim.position.set(...art.rimPosition).multiplyScalar(options.scale || 1);
  group.add(ambient,key,rim);
  let environment=null;
  if(renderer) {
    const source=createReflectionSource();
    const pmrem=new PMREMGenerator(renderer);
    try { environment=pmrem.fromEquirectangular(source); }
    finally {source.dispose();pmrem.dispose();}
    environment.texture.name='scene-reflection-pmrem';
  }
  let disposed=false;
  return {
    group,key,environment:environment && environment.texture,
    attach(scene) {
      if(disposed) return;
      scene.add(group);
      scene.environment=environment && environment.texture;
      scene.environmentIntensity=art.reflectionIntensity;
    },
    dispose(scene) {
      if(disposed) return false;
      disposed=true;
      group.removeFromParent();
      if(scene && scene.environment===environment?.texture) scene.environment=null;
      if(environment) environment.dispose();
      if(key.shadow) key.shadow.dispose();
      return true;
    },
  };
}
