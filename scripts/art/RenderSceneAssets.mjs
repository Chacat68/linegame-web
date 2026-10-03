// 仅在制作阶段使用 WebGL；游戏运行时加载导出的透明图片。
import {
  ACESFilmicToneMapping, Box3, DataTexture, DirectionalLight, Group,
  LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardMaterial, OrthographicCamera, PCFSoftShadowMap, RGBAFormat,
  PlaneGeometry, Scene, ShadowMaterial, SphereGeometry, SRGBColorSpace, Vector3, VSMShadowMap,
} from 'three';
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSceneLighting } from '../../js/ui/SceneLighting.js';
import { createShipAsset } from './ShipAssetFactory.mjs';
import { createStarmapLandmark, createPlanetSurfaceDetails } from '../../js/ui/StarmapLandmarks.js';
import { createPlanetSurfaceData } from '../../js/ui/PlanetSurfaceTexture.js';
import { SCENE_ART_DIRECTION as art } from '../../js/data/sceneVisuals.js';

function configureShadows(key) {
  key.castShadow = true;
  key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:.1,far:60});
  key.shadow.normalBias = .025;
}

function pixelTexture(pixels,width,height,color=true) {
  const texture = new DataTexture(new Uint8Array(pixels),width,height,RGBAFormat);
  texture.colorSpace = color ? SRGBColorSpace : '';
  texture.magFilter=LinearFilter;
  texture.minFilter=LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  texture.needsUpdate = true;
  return texture;
}

function createPortAsset(kind) {
  if (kind === 'station' || kind === 'asteroids') {
    const asset = createStarmapLandmark(kind,'high',(_,factory)=>factory());
    asset.traverse(object=>{ if(object.isMesh) object.castShadow=object.receiveShadow=true; });
    return asset;
  }
  const type = kind === 'sol' ? 'agricultural' : kind;
  const surface = createPlanetSurfaceData({id:kind==='sol'?'sol_prime':'surface-family:'+type,type},'#94aca6',true,'high');
  const group = new Group();
  const planet = new Mesh(new SphereGeometry(1,96,64), new MeshStandardMaterial({
    map:pixelTexture(surface.albedo,surface.width,surface.height),
    bumpMap:pixelTexture(surface.bump,surface.width,surface.height,false), bumpScale:.018,
    roughness:.88,metalness:.02,
  }));
  group.add(planet);
  group.add(createPlanetSurfaceDetails(type,'high',(_,factory)=>factory()));
  if(surface.hasClouds) group.add(new Mesh(new SphereGeometry(1.012,96,64),new MeshStandardMaterial({
    map:pixelTexture(surface.clouds,surface.width,surface.height),transparent:true,
    opacity:.57,depthWrite:false,roughness:1,metalness:0,
  })));
  group.rotation.y = -.8;
  return group;
}

function fitCamera(model,aspect,ship) {
  const box = new Box3().setFromObject(model);
  const center = box.getCenter(new Vector3());
  const camera = new OrthographicCamera(-10*aspect,10*aspect,10,-10,.1,100);
  camera.position.copy(center).add(new Vector3(ship?10:8,ship?7.8:7,ship?12:12));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const projected = new Box3();
  for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) {
    projected.expandByPoint(new Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  }
  const extent = projected.getSize(new Vector3());
  const height = Math.max(extent.y,extent.x/aspect) * 1.12;
  camera.left = -height*aspect/2;
  camera.right = height*aspect/2;
  camera.top = height/2;
  camera.bottom = -height/2;
  camera.updateProjectionMatrix();
  return camera;
}

function inspectModel(model) {
  let triangles=0,meshes=0;
  model.traverse(object=>{
    if(!object.isMesh) return;
    meshes++;
    const position = object.geometry.attributes.position;
    if(!position || !Array.from(position.array).every(Number.isFinite)) throw new Error('资产包含非有限顶点');
    triangles += (object.geometry.index?.count || position.count)/3;
  });
  return {triangles,meshes};
}

function dispose(scene) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  scene.traverse(object=>{
    if(object.geometry) geometries.add(object.geometry);
    if(object.material) (Array.isArray(object.material)?object.material:[object.material]).forEach(material=>{
      materials.add(material);
      Object.values(material).forEach(value=>{if(value?.isTexture) textures.add(value);});
    });
  });
  textures.forEach(texture=>texture.dispose());
  materials.forEach(material=>material.dispose());
  geometries.forEach(geometry=>geometry.dispose());
}

function renderContactShadow(renderer,model,camera) {
  const scene=new Scene();
  const previousParent=model.parent;
  const materials=new Set();
  model.traverse(object=>{if(object.isMesh) materials.add(object.material);});
  const previous=[...materials].map(material=>[material,material.colorWrite,material.depthWrite]);
  const floorY=new Box3().setFromObject(model).min.y-.12;
  const floor=new Mesh(new PlaneGeometry(24,24),new ShadowMaterial({opacity:.5,color:'#02070b'}));
  floor.rotation.x=-Math.PI/2;
  floor.position.y=floorY;
  floor.receiveShadow=true;
  const light=new DirectionalLight('#ffffff',1);
  light.position.set(-1,16,1);
  configureShadows(light);
  light.shadow.radius=9;
  light.shadow.blurSamples=12;
  scene.add(model,floor,light);
  const previousShadowType=renderer.shadowMap.type;
  try {
    previous.forEach(([material])=>{material.colorWrite=false;material.depthWrite=false;});
    renderer.shadowMap.type=VSMShadowMap;
    renderer.shadowMap.needsUpdate=true;
    renderer.render(scene,camera);
    const canvas=document.createElement('canvas');
    canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(renderer.domElement,0,0);
    const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let occupiedPixels=0,borderPixels=0;
    for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) {
      if(rgba[(y*canvas.width+x)*4+3]<16) continue;
      occupiedPixels++;
      if(x===0||y===0||x===canvas.width-1||y===canvas.height-1) borderPixels++;
    }
    if(occupiedPixels<canvas.width*canvas.height*.01||occupiedPixels>canvas.width*canvas.height*.6||borderPixels) throw new Error('停泊阴影为空或被裁切');
    return {image:canvas.toDataURL('image/webp',.92).split(',')[1],metadata:{width:canvas.width,height:canvas.height,occupiedPixels,borderPixels}};
  } finally {
    previous.forEach(([material,colorWrite,depthWrite])=>{material.colorWrite=colorWrite;material.depthWrite=depthWrite;});
    renderer.shadowMap.type=previousShadowType;
    if(previousParent) previousParent.add(model);
    else model.removeFromParent();
    light.shadow.dispose();
    dispose(scene);
  }
}

export async function renderAsset(kind,id) {
  const ship = kind==='ship';
  const width=ship?1120:640,height=640;
  const model=ship?createShipAsset(id):createPortAsset(id);
  const scene=new Scene();
  scene.add(model);
  const renderer=new WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);
  renderer.setSize(width,height);
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=SRGBColorSpace;
  renderer.toneMapping=ACESFilmicToneMapping;
  renderer.toneMappingExposure=art.exposure;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=PCFSoftShadowMap;
  const lighting=createSceneLighting(renderer,{scale:.09});
  lighting.attach(scene);
  configureShadows(lighting.key);
  const camera=fitCamera(model,width/height,ship);
  try {
    renderer.render(scene,camera);
    // 验证实际光栅：必须有透明边界、有色像素，且主体没有裁切到画布边缘。
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(renderer.domElement,0,0);
    const pixels=ctx.getImageData(0,0,width,height).data;
    let occupied=0,border=0;
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      if(pixels[(y*width+x)*4+3]<20) continue;
      occupied++;
      if(x===0||y===0||x===width-1||y===height-1) border++;
    }
    if(occupied<width*height*.025||occupied>width*height*.9||border) throw new Error('资产透明边界或主体覆盖率异常：'+id);
    let glb=null;
    if(ship) {
      const buffer=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:true});
      const imported=await new GLTFLoader().parseAsync(buffer,'');
      const roundtrip=inspectModel(imported.scene),original=inspectModel(model);
      if(roundtrip.triangles!==original.triangles) throw new Error('GLB 回读三角面不一致：'+id);
      dispose(imported.scene);
      glb=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob([buffer]));});
    }
    const shadow=ship?renderContactShadow(renderer,model,camera):null;
    return {image:canvas.toDataURL('image/webp',.92).split(',')[1],glb,shadow:shadow && shadow.image,
      metadata:{...inspectModel(model),width,height,occupiedPixels:occupied,borderPixels:border,...(shadow?{shadow:shadow.metadata}:{})}};
  } finally {
    lighting.dispose(scene);
    dispose(scene);
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
