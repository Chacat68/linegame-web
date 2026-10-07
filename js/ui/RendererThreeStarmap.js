// 低多边形正式星图：视觉资源与预览共用，经营系统独占航行、探索和结算。
import * as THREE from 'three';
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { configureStarmapControls, getStarmapPixelRatio, panStarmapCameraTo, resolveStarmapQuality } from './StarmapViewPolicy.js';
import { getPresentedSceneSystems, getMerchantExplorationSignal } from './MerchantScenePresentation.js';
import { SYSTEMS } from '../data/systems.js';
import { MERCHANT_SHIPS } from '../data/merchant.js';
import { createWorld } from './StarmapVisualWorld.js';
import { createStarmapFleet } from './StarmapFleet.js';
import { getLowPolyStarmapLayout } from './StarmapLayout.js';
import { buildStarmapRouteGraph, starmapEdgeKey, sampleStarmapRoute } from './StarmapRouteLayout.js';
import { createSceneLighting } from './SceneLighting.js';
import { createSceneMotionClock } from './SceneMotionClock.js';

const { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial }=THREE;
const PLANET_TYPE_BADGES={
  agricultural:{top:'#304b3b',bottom:'#15291f',border:'#84bf94',text:'#dcf4d8'},
  mining:{top:'#634525',bottom:'#302519',border:'#d7a362',text:'#ffe5b1'},
  industrial:{top:'#324b61',bottom:'#192839',border:'#8fb4d4',text:'#dbeeff'},
};
const DEFAULT_TYPE_BADGE={top:'#403b48',bottom:'#24212c',border:'#aaa1b9',text:'#eee8f5'};
const QUALITY={low:'light',medium:'balanced',high:'detail'};
const viewQuaternion=new THREE.Quaternion(),inverseView=new THREE.Quaternion(),zAxis=new THREE.Vector3(0,0,1);
const shipTilt=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.56);
const position=new THREE.Vector3(),direction=new THREE.Vector3(),tail=new THREE.Vector3(),scale=new THREE.Vector3();
const shipQuaternion=new THREE.Quaternion(),engineQuaternion=new THREE.Quaternion(),matrix=new THREE.Matrix4();
let _canvas,_renderer,_scene,_lighting,_camera,_controls,_world=null,_fleet=null,_routeRoot=null;
let _routeMaterial=null,_markerMaterial=null,_signalObjects=[],_planetEntries=[],_planetPositions=new Map(),_routeGraph=new Map();
let _visible=false,_contextLost=false,_availabilityHandler=null,_stateRef=null,_motionPreference=null;
let _qualityLevel='auto',_motionLevel='full',_sizeKey='',_sceneKey='',_routeKey='',_fleetKey='',_labelKey='';
let _width=0,_height=0,_selectedRoute=null,_layout=null,_loadTiming={},_ambientClock=createSceneMotionClock();
const _sceneUpdateStats={planetEntryBuilds:0,planetSceneBuilds:0,routeBuilds:0,fleetBuilds:0};
let _drawTimes=[],_cpuTimes=[],_lastFrameCPU=0,_draws=0;

function _getEffectiveQualityLevel(){
  return _qualityLevel==='auto'?resolveStarmapQuality({memory:navigator.deviceMemory||8,width:_width||_canvas?.clientWidth||1280}):_qualityLevel;
}
function _preventZoom(event){event.preventDefault();}
function _lost(event){event.preventDefault();_contextLost=true;_availabilityHandler?.(false);}
function _restored(){_contextLost=false;_sceneKey='';_availabilityHandler?.(true);}
export function setAvailabilityHandler(handler){_availabilityHandler=handler;}
export function init(){
  if(isAvailable())return true;
  _loadTiming={};_canvas=document.getElementById('starmap-three-canvas');
  if(!_canvas)return false;
  const context=_canvas.getContext('webgl2',{alpha:false,antialias:true,depth:true,stencil:false,powerPreference:'default'});
  if(!context)return false;
  try{_renderer=new WebGLRenderer({canvas:_canvas,context,antialias:true});}catch{return false;}
  _renderer.outputColorSpace=THREE.SRGBColorSpace;_renderer.toneMapping=THREE.ACESFilmicToneMapping;_renderer.toneMappingExposure=1.1;
  _scene=new THREE.Scene();_camera=new THREE.OrthographicCamera(-8,8,5,-5,.1,3000);
  _camera.position.set(0,105,130);_camera.lookAt(0,0,0);
  viewQuaternion.copy(_camera.quaternion);inverseView.copy(viewQuaternion).invert();
  _controls=new OrbitControls(_camera,_canvas);_controls.enableDamping=true;_controls.dampingFactor=.07;_controls.panSpeed=.55;
  configureStarmapControls(_controls);
  const started=performance.now();_lighting=createSceneLighting(_renderer);_lighting.attach(_scene);
  _lighting.group?.quaternion.copy(viewQuaternion);
  if(_lighting.key){_lighting.key.intensity=3.7;_lighting.key.position.set(-7,9,10);}
  if(_lighting.group)_lighting.group.children[0].intensity=1.12;
  _scene.environmentIntensity=.48;_loadTiming.lightingMs=performance.now()-started;
  _routeMaterial=new THREE.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:'attribute float alpha;attribute float across;varying vec3 tint;varying float opacity;varying float edge;void main(){tint=color;opacity=alpha;edge=across;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 tint;varying float opacity;varying float edge;void main(){gl_FragColor=vec4(tint,opacity*(1.-smoothstep(.72,1.,abs(edge))));\n#include <colorspace_fragment>\n}`,
  });
  _markerMaterial=new THREE.ShaderMaterial({uniforms:{pixelRatio:{value:1}},
    vertexShader:'uniform float pixelRatio;void main(){gl_PointSize=12.*pixelRatio;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'void main(){float r=length(gl_PointCoord-.5);float core=1.-smoothstep(.10,.22,r);float alpha=(core*.85+exp(-r*r*24.)*.5)*(1.-smoothstep(.42,.50,r));gl_FragColor=vec4(mix(vec3(1.,.51,.09),vec3(1.,.92,.62),core),alpha);}',
    transparent:true,depthWrite:false,
  });
  _routeRoot=new THREE.Group();_routeRoot.quaternion.copy(viewQuaternion);_scene.add(_routeRoot);
  _motionPreference=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  _canvas.addEventListener('webglcontextlost',_lost);_canvas.addEventListener('webglcontextrestored',_restored);
  for(const name of ['wheel','gesturestart','gesturechange'])_canvas.addEventListener(name,_preventZoom,{passive:false,capture:true});
  _contextLost=false;_visible=false;_sizeKey='';_sceneKey='';_routeKey='';return true;
}
export function isAvailable(){return!!_renderer&&!_contextLost;}
export function setVisible(value){
  _visible=!!value&&isAvailable();
  if(_canvas)_canvas.style.display=_visible?'block':'none';
  if(!_visible){_ambientClock.suspend();_drawTimes=[];}
}
export function setMotionLevel(value){_motionLevel=value;}
export function setQuality(value){
  _qualityLevel=['high','medium','low'].includes(value)?value:'auto';
  _sceneKey='';_sizeKey='';
}
function _screenPoint(x,y,z=0){
  return new THREE.Vector3((x/_width-.5)*(_camera.right-_camera.left),(.5-y/_height)*10,z);
}
function _resize(){
  const rect=_canvas.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));
  _width=width;_height=height;
  const dpr=getStarmapPixelRatio(_getEffectiveQualityLevel(),window.devicePixelRatio,width,height),key=[width,height,dpr].join(':');
  if(key===_sizeKey)return false;
  _width=width;_height=height;_sizeKey=key;
  _renderer.setPixelRatio(dpr);_renderer.setSize(width,height,false);
  _camera.left=-5*width/height;_camera.right=5*width/height;_camera.updateProjectionMatrix();
  return true;
}
export function resetCamera(){
  if(!_camera||!_controls)return;
  // 先消耗并清空拖动惯性，再写入全景位置，避免残留平移把镜头再次推开。
  const damping=_controls.enableDamping;_controls.enableDamping=false;_controls.update();
  _controls.target.set(0,0,0);_camera.position.set(0,105,130);_camera.zoom=1;_camera.updateProjectionMatrix();
  _controls.enableDamping=damping;
  configureStarmapControls(_controls);_controls.update();_labelKey='';
}
function _releaseWorld(){
  for(const entry of _planetEntries){
    entry.label.removeFromParent();entry.label.material.map.dispose();entry.label.material.dispose();
  }
  for(const object of _signalObjects){
    object.removeFromParent();object.traverse(part=>{part.geometry?.dispose();part.material?.dispose();});
  }
  _signalObjects=[];_planetEntries=[];_planetPositions.clear();
  _world?.dispose();_world=null;
}
function _buildPorts(systems,signal){
  _releaseWorld();_sceneUpdateStats.planetSceneBuilds++;
  const discovered=signal?.stage==='returning';
  const surfaceOnlyPorts=discovered?[signal.portId]:[];
  _world=createWorld('cinematic',QUALITY[_getEffectiveQualityLevel()],{portIds:[...systems.map(s=>s.id),...surfaceOnlyPorts],surfaceOnlyPorts,shipTypes:[],routeMarkers:false});
  const byId=new Map(systems.map(system=>[system.id,system]));
  _planetEntries=_world.ports.map(port=>{
    const bounds=new THREE.Box3().setFromObject(port.group);
    const system=byId.get(port.id)||SYSTEMS.find(system=>system.id===port.id);
    const label=_createPlanetLabelSprite(system,true,port.id===_stateRef.currentSystem);
    label.center.set(.5,.5);_world.root.add(label);_sceneUpdateStats.planetEntryBuilds++;
    return{...port,bounds,label,system,opened:byId.has(port.id)};
  });
  if(signal){
    const target=new THREE.Group();target.name='merchant-unknown-signal';
    if(!discovered){
      const body=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:'#183444',roughness:.88,metalness:.08,flatShading:true}));
      body.name='merchant-unknown-planet';target.add(body);
    }
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.13,.009,4,64),new THREE.MeshBasicMaterial({color:'#8eb4bd',transparent:true,opacity:.4,depthWrite:false}));
    ring.name='merchant-exploration-scan-ring';ring.position.z=.8;
    target.add(ring);target.userData.scanRing=ring;
    _world.root.add(target);_signalObjects=[target];
  }
  _world.root.quaternion.copy(viewQuaternion);_scene.add(_world.root);
  _positionScene(signal);_routeKey='';_labelKey='';
}
function _positionScene(signal){
  _layout=getLowPolyStarmapLayout(_width,_height);_planetPositions.clear();
  for(const port of _planetEntries){
    const point=_layout.ports.get(port.id);
    port.group.position.copy(_screenPoint(point.x,point.y));
    port.group.scale.setScalar(_layout.planetRadius/_height*10*port.radius);
    _planetPositions.set(port.id,port.group.position.clone().applyQuaternion(viewQuaternion));
  }
  const sun=_layout.sun;
  _world.sun.position.copy(_screenPoint(sun.x,sun.y,-2));_world.sun.scale.setScalar(sun.radius/_height*10/.42);
  if(signal&&_layout.ports.has(signal.portId)){
    const point=_layout.ports.get(signal.portId),local=_screenPoint(point.x,point.y);
    const radius=signal.portId==='aurora_depot'?.83:.94;
    _signalObjects.forEach(object=>{object.position.copy(local);object.scale.setScalar(_layout.planetRadius/_height*10*radius);});
    _planetPositions.set(signal.portId,local.applyQuaternion(viewQuaternion));
  }
  const positions=_world.stars.geometry.attributes.position,normalized=_world.stars.userData.normalized;
  for(let i=0;i<positions.count;i++)positions.setXYZ(i,normalized[i*3]*(_camera.right-_camera.left),normalized[i*3+1]*10,normalized[i*3+2]);
  positions.needsUpdate=true;_world.starMaterial.uniforms.pixelRatio.value=_renderer.getPixelRatio();
  _world.root.updateMatrixWorld(true);_routeKey='';_labelKey='';
}
function _ribbon(curve,color,opacity,pixels){
  const positions=[],colors=[],alphas=[],across=[],indices=[],segments=_getEffectiveQualityLevel()==='low'?32:64,half=pixels/_height*5;
  for(let i=0;i<=segments;i++){
    curve.getPoint(i/segments,position);curve.getTangent(i/segments,direction);
    const nx=-direction.y*half,ny=direction.x*half;
    positions.push(position.x+nx,position.y+ny,-.9,position.x-nx,position.y-ny,-.9);
    for(let j=0;j<2;j++){colors.push(color.r,color.g,color.b);alphas.push(opacity);across.push(j===0?-1:1);}
    if(i<segments){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('alpha',new THREE.Float32BufferAttribute(alphas,1));geometry.setAttribute('across',new THREE.Float32BufferAttribute(across,1));geometry.setIndex(indices);
  const flat=geometry.toNonIndexed();geometry.dispose();return flat;
}
function _clearRoutes(){
  if(!_routeRoot)return;
  for(const object of [..._routeRoot.children]){object.geometry.dispose();_routeRoot.remove(object);}
}
function _buildRoutes(routes){
  _clearRoutes();_sceneUpdateStats.routeBuilds++;
  const docks=new Map(_planetEntries.filter(port=>port.opened).map(port=>[port.id,port.group.localToWorld(port.dock.clone()).applyQuaternion(inverseView)]));
  const openedPortIds=new Set(docks.keys());
  const centers=new Map([..._planetPositions].map(([id,point])=>[id,point.clone().applyQuaternion(inverseView)]));
  const signal=getMerchantExplorationSignal(_stateRef);
  const target=centers.get(signal?.portId),home=centers.get(signal?.from||'sol_prime');
  if(target&&home){
    const approach=home.clone().sub(target);approach.z=0;
    const radius=_layout.planetRadius/_height*10*(signal.portId==='aurora_depot'?.83:.94);
    docks.set(signal.portId,target.clone().add(approach.normalize().multiplyScalar(radius*1.4)));
  }
  _routeGraph=buildStarmapRouteGraph(docks,centers,routes,openedPortIds);
  const active=new Set(routes.map(route=>starmapEdgeKey(route.startSystemId,route.endSystemId)));
  const selected=_selectedRoute&&starmapEdgeKey(_selectedRoute.startSystemId,_selectedRoute.endSystemId);
  const parts=[],markers=[];
  for(const edge of _routeGraph.values()){
    const hot=edge.key===selected,color=new THREE.Color(edge.source==='exploration'?'#ead09b':'#e9bb71');
    parts.push(_ribbon(edge.curve,color,hot?.22:.13,5));
    parts.push(_ribbon(edge.curve,color,hot?.98:active.has(edge.key)?.92:.70,hot?1.8:1.3));
    for(const t of [.32,.68]){edge.curve.getPoint(t,position);markers.push(position.x,position.y,-.82);}
  }
  if(parts.length){
    const geometry=mergeGeometries(parts);parts.forEach(part=>part.dispose());
    _routeRoot.add(new THREE.Mesh(geometry,_routeMaterial));
    const points=new THREE.BufferGeometry();points.setAttribute('position',new THREE.Float32BufferAttribute(markers,3));
    const glints=new THREE.Points(points,_markerMaterial);glints.frustumCulled=false;_routeRoot.add(glints);
  }
  _markerMaterial.uniforms.pixelRatio.value=_renderer.getPixelRatio();
}
function _ensureFleet(){
  const types=[...new Set(_stateRef.merchant.ships.map(ship=>MERCHANT_SHIPS.find(type=>type.id===ship.typeId)?.sceneType||'shuttle'))].sort();
  const capacity=Math.max(4,2**Math.ceil(Math.log2(Math.max(1,_stateRef.merchant.ships.length))));
  const key=types.join(':')+':'+capacity;
  if(_fleetKey===key)return;
  _fleet?.dispose();_fleet=createStarmapFleet({shipTypes:types,capacity});
  _fleet.root.quaternion.copy(viewQuaternion);_scene.add(_fleet.root);_fleetKey=key;_sceneUpdateStats.fleetBuilds++;
}
function _updateShips(routes,full){
  const sets=new Map(_fleet.shipSets.map(set=>[set.type,{...set,count:0}]));
  let engineCount=0;
  for(const route of routes){
    const edge=_routeGraph.get(starmapEdgeKey(route.startSystemId,route.endSystemId));
    const set=sets.get(route.shipTypeId||'shuttle');
    if(!route.isTraveling||!edge||!set)continue;
    sampleStarmapRoute(edge,route,position,direction);position.z=1.15;
    const angle=Math.atan2(direction.y,direction.x);
    shipQuaternion.setFromAxisAngle(zAxis,angle).multiply(shipTilt);
    const pixels=_width<700?(set.type==='shuttle'?23:29):(set.type==='shuttle'?35:45),s=pixels/_height*10/set.length;
    scale.setScalar(s);matrix.compose(position,shipQuaternion,scale);
    for(const mesh of set.meshes)mesh.setMatrixAt(set.count,matrix);
    set.count++;
    if(full&&route.isMoving!==false){
      tail.copy(position).addScaledVector(direction,-pixels/_height*9);tail.z=1.1;
      engineQuaternion.setFromAxisAngle(zAxis,angle);scale.set(pixels/_height*9,pixels/_height*2.2,1);
      matrix.compose(tail,engineQuaternion,scale);_fleet.engines.setMatrixAt(engineCount++,matrix);
    }
  }
  for(const set of sets.values())for(const mesh of set.meshes){mesh.count=set.count;mesh.instanceMatrix.needsUpdate=true;}
  _fleet.engines.count=engineCount;_fleet.engines.instanceMatrix.needsUpdate=engineCount>0;
}
function _animate(time,routes){
  const full=_motionLevel==='full'&&!_motionPreference?.matches&&!document.hidden;
  const {elapsed}=_ambientClock.advance(time,full);
  for(const material of _world.animated)if(material.uniforms.time)material.uniforms.time.value=elapsed/1000;
  const current=_selectedRoute?.startSystemId||_stateRef.currentSystem;
  const port=_planetEntries.find(entry=>entry.opened&&entry.id===current)||_planetEntries.find(entry=>entry.opened);
  _world.selection.visible=!!port;
  if(port){_world.selection.position.copy(port.group.position);_world.selection.position.z=1.8;_world.selection.scale.setScalar(port.group.scale.x);}
  const pan=_controls.target.clone().applyQuaternion(inverseView);
  _world.background.position.set(pan.x,pan.y,-8);_world.background.scale.set(_camera.right-_camera.left,10,1);
  _world.stars.position.set(pan.x,pan.y,0);
  const ring=_signalObjects[0]?.userData.scanRing;
  if(ring){
    const stage=getMerchantExplorationSignal(_stateRef)?.stage,surveying=stage==='surveying';
    const pulse=surveying&&full?Math.sin(elapsed/500)*.035:0;
    ring.scale.setScalar(1+pulse);ring.material.opacity=surveying?.85:stage==='returning'?.22:.4;
    ring.material.color.set(surveying?'#ead09b':'#8eb4bd');
  }
  _updateShips(routes,full);_layoutPlanetLabels();
}
export function render(state,_view,_galaxyId){
  if(!_visible||!isAvailable())return;
  const started=performance.now();_stateRef=state;
  const resizeStarted=performance.now(),resized=_resize();
  const systems=getPresentedSceneSystems(SYSTEMS,state),signal=getMerchantExplorationSignal(state);
  const key=[_getEffectiveQualityLevel(),...systems.map(system=>system.id),signal?.id||'',signal?.stage==='returning'].join(':');
  if(_sceneKey!==key){
    _loadTiming.resizeMs=performance.now()-resizeStarted;
    const portsStarted=performance.now();_buildPorts(systems,signal);_loadTiming.portsMs=performance.now()-portsStarted;_sceneKey=key;
  }else if(resized){_positionScene(signal);resetCamera();}
  const routes=state.merchantStarmapRoutes||[];
  const routeKey=JSON.stringify(routes.map(route=>[route.id,route.startSystemId,route.endSystemId,route.source]))+':'+(_selectedRoute?.id||'');
  if(_routeKey!==routeKey){_buildRoutes(routes);_routeKey=routeKey;}
  _ensureFleet();_controls.update();configureStarmapControls(_controls);
  _animate(performance.now(),routes);
  const drawStarted=performance.now();_renderer.render(_scene,_camera);
  if(_loadTiming.drawMs===undefined)_loadTiming.drawMs=performance.now()-drawStarted;
  _lastFrameCPU=performance.now()-started;_draws++;_drawTimes.push(performance.now());_cpuTimes.push(_lastFrameCPU);
  if(_drawTimes.length>60)_drawTimes.shift();if(_cpuTimes.length>60)_cpuTimes.shift();
}
export function focusRoute(route){
  _selectedRoute=route;_routeKey='';_labelKey='';
  const from=_planetPositions.get(route.startSystemId),to=_planetPositions.get(route.endSystemId);
  if(!from||!to||!_controls)return;
  const local=from.clone().lerp(to,.5).applyQuaternion(inverseView);
  // 沿原有水平平面移动镜头，以保持高度和朝向；把屏幕纵坐标换算到地面 Z。
  const up=new THREE.Vector3(0,1,0).applyQuaternion(viewQuaternion);
  panStarmapCameraTo(_camera,_controls,new THREE.Vector3(local.x,0,local.y/up.z));
}
export function getRendererInfo(){
  if(!_renderer)return null;
  const span=_drawTimes.length>1?_drawTimes.at(-1)-_drawTimes[0]:0;
  const p95=values=>values.length?Number([...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1].toFixed(2)):0;
  return{renderer:'three',sceneStyle:'low-poly',quality:_getEffectiveQualityLevel(),pixelRatio:_renderer.getPixelRatio(),
    width:_width,height:_height,cameraHeight:_camera.position.y,cameraTarget:_controls.target.toArray(),cameraOffset:_camera.position.clone().sub(_controls.target).toArray(),
    panOnly:!_controls.enableZoom&&!_controls.enableRotate,calls:_renderer.info.render.calls,triangles:_renderer.info.render.triangles,
    geometries:_renderer.info.memory.geometries,textures:_renderer.info.memory.textures,sceneUpdates:{..._sceneUpdateStats},loadTiming:{..._loadTiming},
    draws:_draws,fps:span>0?Number(((_drawTimes.length-1)*1000/span).toFixed(1)):0,frameCPUms:Number(_lastFrameCPU.toFixed(2)),frameCPUP95ms:p95(_cpuTimes),
    sunRadiusPx:_layout?.sun.radius,starCount:_world?.stars.geometry.attributes.position.count,visiblePortIds:_planetEntries.filter(entry=>entry.opened).map(entry=>entry.id),
    discoveredPortIds:_planetEntries.filter(entry=>!entry.opened).map(entry=>entry.id),explorationStage:getMerchantExplorationSignal(_stateRef)?.stage||_stateRef?.merchant.exploration.event?.status||null,
    routes:_routeGraph.size,travelingShips:(_stateRef?.merchantStarmapRoutes||[]).filter(route=>route.isTraveling&&_routeGraph.has(starmapEdgeKey(route.startSystemId,route.endSystemId))).length,
    labels:_planetEntries.filter(entry=>entry.opened).map(entry=>({id:entry.id,visible:entry.label.visible,...entry.label.userData.bounds})),
  };
}
export function getExplorationScreenPosition(portId){
  const point=_planetPositions.get(portId);
  if(!point||!_camera||!_canvas)return null;
  const projected=point.clone().project(_camera),rect=_canvas.getBoundingClientRect(),parent=_canvas.parentElement?.getBoundingClientRect()||rect;
  const x=rect.left-parent.left+(projected.x+1)*rect.width/2,y=rect.top-parent.top+(1-projected.y)*rect.height/2;
  const radius=_layout.planetRadius*(_planetEntries.find(entry=>entry.id===portId)?.radius||(portId==='aurora_depot'?.83:.94));
  return{x,y,radius,onScreen:projected.z>-1&&projected.z<1&&x>78&&x<parent.width-78&&y>100&&y<parent.height-100};
}
function _layoutPlanetLabels(){
  _camera.updateMatrixWorld();
  const key=[..._camera.position.toArray(),..._controls.target.toArray(),_sizeKey,_stateRef.currentSystem,_selectedRoute?.id||''].join(':');
  if(_labelKey===key)return;_labelKey=key;
  const canvasRect=_canvas.getBoundingClientRect(),nav=document.getElementById('status-bar')?.getBoundingClientRect();
  const navTop=nav?nav.top-canvasRect.top:_height-80,occupied=[],pan=_controls.target.clone().applyQuaternion(inverseView);
  for(const entry of _planetEntries){
    if(!entry.opened){entry.label.visible=false;continue;}
    const label=entry.label,world=entry.group.position.clone().applyQuaternion(viewQuaternion).project(_camera);
    const x=(world.x+1)*_width/2,y=(1-world.y)*_height/2;
    label.visible=x>-80&&x<_width+80&&y>40&&y<_height+80;
    if(!label.visible)continue;
    const top=entry.group.position.clone();top.y+=entry.bounds.max.y*entry.group.scale.x;
    top.applyQuaternion(viewQuaternion).project(_camera);
    const pixels=Math.min(32,(_width-16)/label.userData.labelAspect),half=pixels*label.userData.labelAspect/2;
    const labelX=Math.max(half+8,Math.min(_width-half-8,x));
    let labelY=Math.max(68,Math.min(navTop-32,(1-top.y)*_height/2-16));
    for(const old of occupied)if(Math.abs(labelX-old.x)<half+old.half+8&&Math.abs(labelY-old.y)<34)labelY=old.y+35;
    labelY=Math.min(navTop-32,labelY);occupied.push({x:labelX,y:labelY,half});
    label.position.copy(_screenPoint(labelX,labelY,3)).add(new THREE.Vector3(pan.x,pan.y,0));
    label.scale.set(pixels/_height*10*label.userData.labelAspect,pixels/_height*10,1);
    label.material.opacity=1;
    label.userData.bounds={left:labelX-half,right:labelX+half,top:labelY-pixels/2,bottom:labelY+pixels/2};
  }
}
export function dispose(){
  const renderer=_renderer,canvas=_canvas;_renderer=null;_visible=false;_contextLost=false;
  let disposalError=null;const release=cleanup=>{try{cleanup();}catch(error){disposalError||=error;}};
  release(()=>_controls?.dispose());release(()=>_lighting?.dispose(_scene));
  release(()=>_fleet?.dispose());release(_clearRoutes);release(_releaseWorld);
  release(()=>_routeMaterial?.dispose());release(()=>_markerMaterial?.dispose());
  if(canvas){
    canvas.removeEventListener('webglcontextlost',_lost);canvas.removeEventListener('webglcontextrestored',_restored);
    for(const name of ['wheel','gesturestart','gesturechange'])canvas.removeEventListener(name,_preventZoom,true);
    canvas.style.display='none';canvas.style.visibility='hidden';
  }
  release(()=>renderer?.dispose());
  _canvas=_scene=_lighting=_camera=_controls=_world=_fleet=_routeRoot=_routeMaterial=_markerMaterial=null;
  _stateRef=_motionPreference=_selectedRoute=_layout=null;_sizeKey=_sceneKey=_routeKey=_fleetKey=_labelKey='';
  _routeGraph.clear();_planetPositions.clear();_planetEntries=[];_signalObjects=[];_ambientClock=createSceneMotionClock();_drawTimes=[];_cpuTimes=[];_draws=0;
  if(disposalError)throw disposalError;
}

function _createPlanetLabelSprite(system, unlocked, current) {
  const merchantScene = Boolean(_stateRef?.merchant);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const nameFont = `${current ? '700 32px' : '600 30px'} system-ui, sans-serif`;
  const typeFont = '600 22px system-ui, sans-serif';
  const typeLabel = system.typeLabel || '航点';
  ctx.font = nameFont;
  const nameWidth = Math.ceil(ctx.measureText(system.name).width);
  ctx.font = typeFont;
  const badgeWidth = Math.ceil(ctx.measureText(typeLabel).width) + 24;
  const badgeX = 12 + nameWidth + 12;
  canvas.width = badgeX + badgeWidth + 12;
  canvas.height = 64;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#02060b';
  ctx.shadowBlur = 4;
  ctx.fillStyle = unlocked ? (merchantScene ? '#f4e8d8' : current ? '#fff0b5' : '#dff7ff') : '#7d8b95';
  ctx.font = nameFont;
  ctx.fillText(system.name, 12, 32);
  ctx.shadowBlur = 0;
  const palette = Object.hasOwn(PLANET_TYPE_BADGES, system.type) ? PLANET_TYPE_BADGES[system.type] : DEFAULT_TYPE_BADGE;
  const gradient = ctx.createLinearGradient(0, 15, 0, 49);
  gradient.addColorStop(0, palette.top);
  gradient.addColorStop(1, palette.bottom);
  ctx.fillStyle = gradient;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(badgeX + 1, 15, badgeWidth - 2, 34, 8);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = typeFont;
  ctx.fillStyle = palette.text;
  ctx.fillText(typeLabel, badgeX + badgeWidth / 2, 32);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: unlocked ? 1 : 0.56,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const sprite = new Sprite(material);
  sprite.userData.labelAspect = canvas.width / canvas.height;
  sprite.center.set(0.5, 0.25);
  sprite.scale.set(9 * sprite.userData.labelAspect, 9, 1);
  return sprite;
}
