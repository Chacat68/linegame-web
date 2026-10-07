import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildStarmapRouteGraph, sampleStarmapRoute, starmapEdgeKey } from '../js/ui/StarmapRouteLayout.js';
import { getLowPolyStarmapLayout } from '../js/ui/StarmapLayout.js';
import { buildMerchantStarmapProjection } from '../js/ui/MerchantStarmapProjection.js';
import { MERCHANT_DEFAULTS } from '../js/data/merchant.js';

let renderer,scene,canvas,draw,context,controls;
function snapshot(){
  const merchant=structuredClone(MERCHANT_DEFAULTS);
  merchant.tasks=[{id:'task-1',from:'sol_prime',to:'mineral_belt'}];
  Object.assign(merchant.ships[0],{taskId:'task-1',phase:'outbound',departAt:100,arriveAt:200});
  return{merchant,currentSystem:'sol_prime',viewingGalaxy:'milky_way'};
}
beforeEach(async()=>{
  vi.resetModules();
  const gradient={addColorStop:vi.fn()};
  context={fillRect:vi.fn(),clearRect:vi.fn(),fillText:vi.fn(),beginPath:vi.fn(),roundRect:vi.fn(),fill:vi.fn(),stroke:vi.fn(),
    createRadialGradient:()=>gradient,createLinearGradient:()=>gradient,measureText:text=>({width:text.length*18})};
  canvas={style:{},clientWidth:1280,clientHeight:820,getContext:()=>({}),addEventListener:vi.fn(),removeEventListener:vi.fn(),
    getBoundingClientRect:()=>({width:canvas.clientWidth,height:canvas.clientHeight,left:0,top:0})};
  draw=vi.fn((next,camera)=>{scene=next;scene.updateMatrixWorld(true);camera.updateMatrixWorld();});
  vi.stubGlobal('document',{hidden:false,getElementById:id=>id==='starmap-three-canvas'?canvas:id==='status-bar'?{getBoundingClientRect:()=>({top:canvas.clientHeight-90})}:null,
    createElement:()=>({width:0,height:0,getContext:()=>context})});
  vi.stubGlobal('window',{devicePixelRatio:1,matchMedia:()=>({matches:false})});
  vi.stubGlobal('navigator',{deviceMemory:8});
  vi.doMock('three/src/renderers/WebGLRenderer.js',()=>({WebGLRenderer:class{
    constructor(){this.info={render:{calls:0,triangles:0},memory:{geometries:0,textures:0}};this.render=draw;}
    setSize(){}setPixelRatio(value){this.ratio=value;}getPixelRatio(){return this.ratio;}dispose(){}
  }}));
  vi.doMock('three/addons/controls/OrbitControls.js',()=>({OrbitControls:class{
    constructor(camera){controls=this;this.object=camera;this.target=new THREE.Vector3();this.panOffset=new THREE.Vector3();this.mouseButtons={};this.touches={};}
    update(){this.target.addScaledVector(this.panOffset,this.enableDamping?this.dampingFactor:1);if(this.enableDamping)this.panOffset.multiplyScalar(1-this.dampingFactor);else this.panOffset.set(0,0,0);this.object.lookAt(this.target);this.object.updateMatrixWorld();}dispose(){}
  }}));
  vi.doMock('../js/ui/SceneLighting.js',()=>({createSceneLighting:()=>{
    const group=new THREE.Group(),key=new THREE.DirectionalLight();group.add(new THREE.AmbientLight(),key);
    return{group,key,attach:target=>target.add(group),dispose:()=>group.removeFromParent()};
  }}));
  renderer=await import('../js/ui/RendererThreeStarmap.js');
  renderer.setQuality('low');expect(renderer.init()).toBe(true);renderer.setVisible(true);
});
afterEach(()=>{
  renderer?.dispose();
  vi.doUnmock('three/src/renderers/WebGLRenderer.js');vi.doUnmock('three/addons/controls/OrbitControls.js');vi.doUnmock('../js/ui/SceneLighting.js');
  vi.unstubAllGlobals();
});
const paint=(state,now=150)=>renderer.render(buildMerchantStarmapProjection(state,now),'planets','milky_way');

it('拖动惯性尚未结束时点击全景也能准确归零，后续绘制不会再次偏移',()=>{
  const state=snapshot();paint(state);controls.panOffset.set(.7,0,-.4);
  renderer.resetCamera();paint(state);paint(state);
  expect(renderer.getRendererInfo().cameraTarget).toEqual([0,0,0]);
  expect(renderer.getRendererInfo().cameraOffset).toEqual([0,105,130]);
  expect(controls.enableDamping).toBe(true);
});

it('真实去程与返程在同一曲线上相遇、方向相反，进度不由装饰时钟决定',()=>{
  const state=snapshot(),positions=new Map([['sol_prime',new THREE.Vector3(-2,1,0)],['mineral_belt',new THREE.Vector3(3,1,0)]]);
  const graph=buildStarmapRouteGraph(positions,positions),edge=graph.get(starmapEdgeKey('sol_prime','mineral_belt'));
  const out=buildMerchantStarmapProjection(state,125).merchantStarmapRoutes[0];
  state.merchant.ships[0].phase='return';
  const returning=buildMerchantStarmapProjection(state,175).merchantStarmapRoutes[0];
  const p1=new THREE.Vector3(),p2=new THREE.Vector3(),d1=new THREE.Vector3(),d2=new THREE.Vector3();
  sampleStarmapRoute(edge,out,p1,d1);sampleStarmapRoute(edge,returning,p2,d2);
  expect(p1.distanceTo(p2)).toBeLessThan(1e-8);expect(d1.dot(d2)).toBeCloseTo(-1);
  paint(state,175);const first=scene.getObjectByName('shuttle-hull'),a=new THREE.Matrix4(),b=new THREE.Matrix4();
  first.getMatrixAt(0,a);paint(state,175);first.getMatrixAt(0,b);
  expect(a.elements).toEqual(b.elements);
});

it('航次进度与去返阶段刷新不重建港口或同型船，隐藏星图时停止绘制',()=>{
  const state=snapshot(),before=structuredClone(state);paint(state,120);
  const first=renderer.getRendererInfo().sceneUpdates;
  paint(state,160);expect(renderer.getRendererInfo().sceneUpdates).toEqual(first);expect(state).toEqual(before);
  state.merchant.ships[0].phase='return';paint(state,160);
  expect(renderer.getRendererInfo().sceneUpdates.fleetBuilds).toBe(first.fleetBuilds);
  expect(renderer.getRendererInfo().sceneUpdates.planetSceneBuilds).toBe(first.planetSceneBuilds);
  state.merchant.ships[0].phase='waiting';paint(state,160);
  expect(renderer.getRendererInfo().sceneUpdates.fleetBuilds).toBe(first.fleetBuilds);
  expect(renderer.getRendererInfo().travelingShips).toBe(0);
  const count=draw.mock.calls.length;renderer.setVisible(false);paint(state);
  expect(draw).toHaveBeenCalledTimes(count);
});

it('待探索时只呈现未知球，返港开放新港后释放旧模型，三档重建资源没有累积',()=>{
  const state=snapshot();state.merchant.exploration.event={id:'signal-1',portId:'nebula_forge',status:'available'};
  paint(state);expect(renderer.getRendererInfo().visiblePortIds).toEqual(['sol_prime','mineral_belt']);
  expect(scene.getObjectByName('system_nebula_forge')).toBeUndefined();
  expect(renderer.getExplorationScreenPosition('nebula_forge')?.onScreen).toBe(true);
  const oldWorld=scene.getObjectByName('merchant-low-poly-world'),releases=new Map();
  oldWorld.traverse(object=>{
    if(object.isMesh&&!releases.has(object.geometry)){const listener=vi.fn();object.geometry.addEventListener('dispose',listener);releases.set(object.geometry,listener);}
  });
  state.merchant.unlockedPorts.push('nebula_forge');state.merchant.exploration.event.status='completed';paint(state);
  expect(renderer.getRendererInfo().visiblePortIds).toContain('nebula_forge');
  expect(scene.getObjectByName('merchant-unknown-signal')).toBeUndefined();
  for(const listener of releases.values())expect(listener).toHaveBeenCalledOnce();
  for(const quality of ['medium','high','low']){
    renderer.setQuality(quality);paint(state);
    expect(scene.children.filter(child=>child.name==='merchant-low-poly-world')).toHaveLength(1);
    expect(scene.children.filter(child=>child.name==='merchant-flight-fleet')).toHaveLength(1);
  }
});

it('去程与勘察共享未知球，发现后只显露地表，完整返港才显示建筑与经营航路',()=>{
  const state=snapshot();state.merchant.tasks=[];
  const event={id:'event-9',portId:'nebula_forge',status:'exploring',shipId:'ship-1',from:'sol_prime',startedAt:1000,legMs:1000,arriveAt:32000};
  state.merchant.exploration.event=event;
  Object.assign(state.merchant.ships[0],{taskId:event.id,phase:'exploring'});
  paint(state,1500);expect(renderer.getRendererInfo().explorationStage).toBe('outbound');
  expect(scene.getObjectByName('merchant-unknown-planet')).toBeDefined();
  const first=renderer.getRendererInfo().sceneUpdates;
  paint(state,2200);expect(renderer.getRendererInfo().explorationStage).toBe('surveying');
  expect(renderer.getRendererInfo().sceneUpdates.planetSceneBuilds).toBe(first.planetSceneBuilds);
  expect(scene.getObjectByName('merchant-flight-engines').count).toBe(0);
  const parked=new THREE.Matrix4();scene.getObjectByName('shuttle-hull').getMatrixAt(0,parked);
  const shipPoint=new THREE.Vector3().setFromMatrixPosition(parked),unknown=scene.getObjectByName('merchant-unknown-signal');
  expect(Math.hypot(shipPoint.x-unknown.position.x,shipPoint.y-unknown.position.y)).toBeGreaterThan(unknown.scale.x*1.3);
  event.status='returning';event.arriveAt=33000;state.merchant.ships[0].phase='explore_return';
  const before=structuredClone(state);paint(state,32500);
  const info=renderer.getRendererInfo(),surface=scene.getObjectByName('system_nebula_forge');
  expect(info.visiblePortIds).not.toContain('nebula_forge');expect(info.discoveredPortIds).toEqual(['nebula_forge']);
  expect(info.routes).toBe(2);expect(scene.getObjectByName('merchant-unknown-planet')).toBeUndefined();
  expect(surface.children.some(child=>child.material?.name==='cinematic-cream')).toBe(false);
  paint(state,32700);expect(renderer.getRendererInfo().sceneUpdates).toEqual(info.sceneUpdates);expect(state).toEqual(before);
  state.merchant.unlockedPorts.push('nebula_forge');event.status='completed';
  Object.assign(state.merchant.ships[0],{taskId:null,phase:'idle'});paint(state,33000);
  expect(renderer.getRendererInfo().visiblePortIds).toContain('nebula_forge');
  expect(scene.getObjectByName('system_nebula_forge').children.some(child=>child.material?.name==='cinematic-cream')).toBe(true);
  expect(renderer.getRendererInfo().routes).toBe(3);
});

it('四港与放大的太阳在桌面和窄屏共用预览比例，标签避开资源栏和导航',()=>{
  const state=snapshot();state.merchant.unlockedPorts=['sol_prime','mineral_belt','nebula_forge','aurora_depot'];paint(state);
  expect(renderer.getRendererInfo()).toMatchObject({sunRadiusPx:60,starCount:80,panOnly:true,visiblePortIds:state.merchant.unlockedPorts});
  const initialOffset=renderer.getRendererInfo().cameraOffset;
  renderer.focusRoute(buildMerchantStarmapProjection(state,150).merchantStarmapRoutes[0]);paint(state);
  expect(renderer.getRendererInfo().cameraHeight).toBe(105);
  renderer.getRendererInfo().cameraOffset.forEach((value,i)=>expect(value).toBeCloseTo(initialOffset[i]));
  renderer.resetCamera();
  for(const [width,height] of [[393,900],[320,740],[360,640]]){
    canvas.clientWidth=width;canvas.clientHeight=height;paint(state);
    const info=renderer.getRendererInfo(),layout=getLowPolyStarmapLayout(width,height);
    expect(info.sunRadiusPx).toBe(38);expect(layout.planetRadius).toBe(44);
    for(const label of info.labels){
      expect(label.visible).toBe(true);expect(label.left).toBeGreaterThanOrEqual(8);
      expect(label.right).toBeLessThanOrEqual(width-8);expect(label.top).toBeGreaterThanOrEqual(44);
      expect(label.bottom).toBeLessThanOrEqual(height-90);
    }
  }
});

it('所有正式船型按拥有的类型共享实例，48 艘船不会超过容量，减少动画关闭喷焰但保持真实位置',()=>{
  const state=snapshot();state.merchant.unlockedPorts=['sol_prime','mineral_belt','nebula_forge','aurora_depot'];
  state.merchant.ships=Array.from({length:48},(_,i)=>({...state.merchant.ships[0],id:'ship-'+i,typeId:['courier','clipper','hauler','bulk'][i%4]}));
  paint(state);
  const fleet=scene.children.find(child=>child.name==='merchant-flight-fleet'),names=['shuttle-hull','clipper-hull','freighter-hull','galleon-hull'];
  for(const name of names){const hull=fleet.getObjectByName(name);expect(hull.count).toBe(12);expect(hull.instanceMatrix.count).toBe(64);}
  expect(fleet.getObjectByName('merchant-flight-engines').count).toBe(48);
  renderer.setMotionLevel('reduced');paint(state,175);
  expect(fleet.getObjectByName('merchant-flight-engines').count).toBe(0);
  for(const name of names)expect(fleet.getObjectByName(name).count).toBe(12);
  expect(renderer.getRendererInfo().travelingShips).toBe(48);
});
