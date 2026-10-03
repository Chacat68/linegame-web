// 经营星图：真实航次只读投影，固定视角与高度，拖拽平移。
import {
  ACESFilmicToneMapping, AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry,
  CanvasTexture, Color, ConeGeometry, DoubleSide, FogExp2, GridHelper, Group, Line,
  LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera,
  Points, PointsMaterial, QuadraticBezierCurve3, RepeatWrapping, RingGeometry, SRGBColorSpace,
  Scene, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, Vector3,
} from 'three';
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGalaxyBackdropData } from './GalaxyBackdrop.js';
import { configureStarmapControls, getStarmapPixelRatio, panStarmapCameraTo, resolveStarmapQuality } from './StarmapViewPolicy.js';
import { getLocationVisual, getSceneEnvironment, SCENE_ART_DIRECTION } from '../data/sceneVisuals.js';
import { createStarmapLandmark, createPlanetSurfaceDetails } from './StarmapLandmarks.js';
import { getPresentedSceneSystems, composeMerchantScene, getMerchantExplorationSignal } from './MerchantScenePresentation.js';
import { SYSTEMS } from '../data/systems.js';
import { createPlanetAtmosphere } from './PlanetAtmosphere.js';
import { createPlanetSurfaceData } from './PlanetSurfaceTexture.js';
import { createSceneLighting } from './SceneLighting.js';
import { createSceneMotionClock } from './SceneMotionClock.js';
import { createShipAsset } from './ShipModelFactory.js';
import { createFlightShip, updateFlightShip } from './ShipFlightVisual.js';
const PLANET_SPAN_X = 672, PLANET_SPAN_Z = 470.4;
const PLANET_LAYOUT_SCALE_X = PLANET_SPAN_X / 292, PLANET_LAYOUT_SCALE_Z = PLANET_SPAN_Z / 204;
const PLANET_LAYOUT_SCALE = (PLANET_LAYOUT_SCALE_X + PLANET_LAYOUT_SCALE_Z) / 2;
const PLANET_COLORS = { agricultural:'#82b6a1', mining:'#ffb35a', industrial:'#ff8662' };
// 类型标签使用稳定语义色，不随星系环境光改变。
const PLANET_TYPE_BADGES = {
  agricultural:{top:'#304b3b',bottom:'#15291f',border:'#84bf94',text:'#dcf4d8'},
  mining:{top:'#634525',bottom:'#302519',border:'#d7a362',text:'#ffe5b1'},
  industrial:{top:'#324b61',bottom:'#192839',border:'#8fb4d4',text:'#dbeeff'},
};
const DEFAULT_TYPE_BADGE = {top:'#403b48',bottom:'#24212c',border:'#aaa1b9',text:'#eee8f5'};
const PLANET_VISUAL_PROFILES = {
  agricultural:{bodyScale:[1,1.03,.98],metalness:.04,roughness:.82,cloudColor:'#f2fff2',cloudOpacity:.48,atmosphereColor:'#6ff2b3'},
  mining:{bodyScale:[1.04,.92,1],metalness:.2,roughness:.94,cloudColor:'#d9b18a',cloudOpacity:.16,atmosphereColor:'#d68a52',debrisCount:18},
  industrial:{bodyScale:[1.02,.96,1.01],metalness:.54,roughness:.66,cloudColor:'#d6a07e',cloudOpacity:.3,atmosphereColor:'#ff875c',satelliteCount:1},
};
const DEFAULT_PLANET_VISUAL_PROFILE = PLANET_VISUAL_PROFILES.agricultural;
const QUALITY = {
  high:{backgroundStars:1100,curveSegments:40,planetSegments:30},
  medium:{backgroundStars:650,curveSegments:28,planetSegments:22},
  low:{backgroundStars:320,curveSegments:18,planetSegments:16},
};
let _canvas, _renderer, _scene, _lighting, _camera, _controls, _backgroundRoot, _planetRoot, _routeRoot;
let _backgroundTexture = null, _backgroundTextureKey = '', _stateRef = null, _currentGalaxyId = 'milky_way';
let _visible = false, _contextLost = false, _availabilityHandler = null, _sizeKey = '', _sceneKey = '', _routeKey = '';
let _qualityLevel = 'auto', _motionLevel = 'full', _motionPreference = null;
let _planetPositions = new Map(), _planetEntries = [], _routeVisuals = [], _selectedRoute = null, _sun = null;
let _selectedPlanetId = null, _hoveredPlanetId = null, _focusPlanetId = null;
let _sharedHaloTexture = null, _sharedStarTexture = null, _sharedSunGlowTexture = null;
const _sharedGeometryCache = new Map(), _persistentGeometries = new Set();
const _planetSurfaceMapCache = new Map(), _persistentPlanetTextures = new Set();
let _ambientClock = createSceneMotionClock();
const _sceneUpdateStats = {planetEntryBuilds:0,planetSceneBuilds:0,routeBuilds:0};
let _loadTiming = {};
function _isRouteEndpoint(id) { return !!_selectedRoute && [ _selectedRoute.startSystemId, _selectedRoute.endSystemId ].includes(id); }
function _getEffectiveQualityLevel() {
  return _qualityLevel === 'auto' ? resolveStarmapQuality({ memory: navigator.deviceMemory || 8, width: _canvas?.clientWidth || 1280 }) : _qualityLevel;
}
function _preventZoom(event) { event.preventDefault(); }
function _lost(event) { event.preventDefault(); _contextLost = true; _availabilityHandler?.(false); }
function _restored() { _contextLost = false; _sceneKey = ''; _availabilityHandler?.(true); }
export function setAvailabilityHandler(handler) { _availabilityHandler = handler; }
export function init() {
  if (isAvailable()) return true;
  _loadTiming = {};
  _canvas = document.getElementById('starmap-three-canvas');
  if (!_canvas) return false;
  const context = _canvas.getContext('webgl2',{alpha:false,antialias:true,depth:true,stencil:false,powerPreference:'high-performance'});
  if (!context) return false;
  try { _renderer = new WebGLRenderer({canvas:_canvas,context,antialias:true}); }
  catch { return false; }
  _renderer.outputColorSpace = SRGBColorSpace; _renderer.toneMapping = ACESFilmicToneMapping; _renderer.toneMappingExposure = SCENE_ART_DIRECTION.exposure;
  _scene = new Scene(); _scene.fog = new FogExp2('#181c32',.0007);
  _camera = new PerspectiveCamera(48,1,.1,3000); _camera.position.set(0,105,130);
  _controls = new OrbitControls(_camera,_canvas); _controls.enableDamping=true; _controls.dampingFactor=.07; _controls.panSpeed=.55;
  configureStarmapControls(_controls,true);
  _backgroundRoot = new Group(); _planetRoot = new Group(); _scene.add(_backgroundRoot,_planetRoot);
  const lightingStartedAt = performance.now();
  _lighting = createSceneLighting(_renderer); _lighting.attach(_scene);
  _loadTiming.lightingMs = performance.now() - lightingStartedAt;
  _motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  _canvas.addEventListener('webglcontextlost',_lost); _canvas.addEventListener('webglcontextrestored',_restored);
  for (const name of ['wheel','gesturestart','gesturechange']) _canvas.addEventListener(name,_preventZoom,{passive:false,capture:true});
  _contextLost=false; _visible=false; _sizeKey=''; _sceneKey=''; _routeKey=''; return true;
}
export function isAvailable() { return !!_renderer && !_contextLost; }
export function setVisible(value) { _visible=!!value && isAvailable(); if (_canvas) _canvas.style.display=_visible?'block':'none'; if (!_visible) _ambientClock.suspend(); }
export function setMotionLevel(value) { _motionLevel = value; }
export function setQuality(value) { _qualityLevel = ['high','medium','low'].includes(value) ? value : 'auto'; _sceneKey=''; _sizeKey=''; }
function _resize() {
  const rect=_canvas.getBoundingClientRect(), width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));
  const dpr=getStarmapPixelRatio(_getEffectiveQualityLevel(),window.devicePixelRatio,width,height),key=[width,height,dpr].join(':');
  if (key===_sizeKey) return false;
  _sizeKey=key; _renderer.setPixelRatio(dpr); _renderer.setSize(width,height,false); _camera.aspect=width/height; _camera.updateProjectionMatrix(); _updateBackdropTexture(); return true;
}
export function resetCamera() {
  if (!_camera || !_planetPositions.size) return;
  // 全景同时照顾恒星轮廓；它只是装饰，不加入港口和航路资料。
  const points=[..._planetPositions.values(),...(_sun ? [_sun.position] : [])];
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
  const target=new Vector3((minX+maxX)/2,-2,(minZ+maxZ)/2),tanFov=Math.tan(_camera.fov*Math.PI/360);
  const distance=Math.max(168,((maxX-minX)/2+22)/(tanFov*Math.max(.2,_camera.aspect)*.9),((maxZ-minZ)/2+22)/(tanFov*.8));
  _controls.target.copy(target); _camera.position.copy(target).add(new Vector3(0,105,130).normalize().multiplyScalar(distance));
  configureStarmapControls(_controls,true); _controls.update();
}
function _buildPorts() {
  _clearGroup(_planetRoot); _planetEntries=[]; _routeVisuals=[]; _routeKey=''; _sceneUpdateStats.planetSceneBuilds++;
  const systems=getPresentedSceneSystems(SYSTEMS,_stateRef);
  const signal=getMerchantExplorationSignal(_stateRef);
  const locationIds=systems.map(system=>system.id);
  if (signal) locationIds.push(signal.portId);
  _planetPositions=composeMerchantScene(new Map(locationIds.map(id=>[id,new Vector3()])),_stateRef);
  _buildPlanetEnvironment();
  _routeRoot=new Group(); _planetRoot.add(_routeRoot);
  _sun=new Mesh(_getSharedGeometry('stellar-sphere',()=>new SphereGeometry(1,40,28)),_createSunMaterial());
  _sun.name='merchant-sun'; _sun.scale.setScalar(12); _sun.position.set(-98,-3,-46);
  const glow=new Sprite(new SpriteMaterial({map:_getSharedSunGlowTexture(),color:'#ffae59',transparent:true,opacity:.52,depthWrite:false,blending:AdditiveBlending}));
  glow.position.copy(_sun.position); glow.scale.set(68,68,1); _planetRoot.add(glow,_sun);
  _planetEntries=systems.map((system,index)=>{const entry=_createPlanetEntry(system,index,_stateRef,_planetPositions,_getEffectiveQualityLevel()); _planetRoot.add(entry.group); return entry;});
  if (signal) {
    const position=_planetPositions.get(signal.portId);
    const beacon=new Sprite(new SpriteMaterial({map:_getSharedStarTexture(),color:'#ead09b',transparent:true,opacity:.9,depthWrite:false,blending:AdditiveBlending}));
    beacon.name='merchant-unknown-signal'; beacon.position.copy(position); beacon.scale.set(8,8,1);
    const ring=new Mesh(new RingGeometry(6,6.3,48),new MeshBasicMaterial({color:'#ead09b',transparent:true,opacity:.6,side:DoubleSide,depthWrite:false}));
    ring.position.copy(position); ring.rotation.x=-Math.PI/2;
    _planetRoot.add(beacon,ring);
  }
  resetCamera();
}
function _buildRoutes(routes) {
  _clearGroup(_routeRoot); _routeVisuals=[]; _sceneUpdateStats.routeBuilds++;
  for (const route of routes) {
    const start=_planetPositions.get(route.startSystemId),end=_planetPositions.get(route.endSystemId);
    if (!start || !end || start.equals(end)) continue;
    const from=start.clone(),to=end.clone(),direction=to.clone().sub(from).normalize(),distance=from.distanceTo(to);
    from.addScaledVector(direction,Math.min(distance*.18,18)); to.addScaledVector(direction,-Math.min(distance*.18,18));
    const mid=from.clone().lerp(to,.5); mid.y+=8;
    const curve=new QuadraticBezierCurve3(from,mid,to), selected=route.id===_selectedRoute?.id;
    const line=new Line(new BufferGeometry().setFromPoints(curve.getPoints(_getQualitySettings().curveSegments)),new LineBasicMaterial({color:route.source==='exploration'?'#ead09b':selected?'#ffd1ac':'#e99b78',transparent:true,opacity:selected?.85:.5,depthWrite:false,blending:AdditiveBlending})); _routeRoot.add(line);
    let ship=null;
    if (route.isTraveling) {
      const prototype=createShipAsset(route.shipTypeId); prototype.traverse(object=>{if(object.isMesh) _getSharedGeometry('ship-'+object.name,()=>object.geometry);});
      ship=createFlightShip(prototype,_getSharedGeometry('plume',()=>new ConeGeometry(1,1,8,1,true)),_getSharedHaloTexture());
      prototype.traverse(object=>{if(object.isMesh) object.material.dispose();}); _routeRoot.add(ship);
    }
    _routeVisuals.push({id:route.id,curve,ship});
  }
}
function _animate(time) {
  const full=_motionLevel==='full'&&!_motionPreference?.matches&&!document.hidden;
  const {elapsed,delta}=_ambientClock.advance(time,full),seconds=delta/1000;
  if (full && _sun) _sun.rotation.y+=seconds*.015;
  for (const entry of _planetEntries) {
    if (full) {if(entry.bodyKind==='planet') entry.body.rotation.y+=seconds*.022; if(entry.cloudShell) entry.cloudShell.rotation.y+=seconds*.032; if(entry.moonPivot) entry.moonPivot.rotation.y+=seconds*.045; if(entry.landmark&&entry.bodyKind!=='asteroids') entry.landmark.rotation.y+=seconds*.025;}
    entry.halo.visible=entry.current||_isRouteEndpoint(entry.id); entry.haloMaterial.opacity=.18; entry.halo.scale.set(entry.radius*4.2,entry.radius*4.2,1);
  }
  _layoutPlanetLabels();
  for (const visual of _routeVisuals) {
    if (!visual.ship) continue;
    const route=_stateRef.merchantStarmapRoutes.find(item=>item.id===visual.id),progress=route?.progress || 0;
    const position=visual.curve.getPoint(progress); visual.ship.position.copy(position); visual.ship.lookAt(visual.curve.getTangent(progress).add(position));
    const view=position.clone().applyMatrix4(_camera.matrixWorldInverse),height=_canvas.clientHeight || 720;
    const screenScale=-view.z*2*Math.tan(_camera.fov*Math.PI/360)*17/height/visual.ship.userData.bodyLength;
    updateFlightShip(visual.ship,{opacity:1,engine:route?.isMoving === false ? 0 : 1},elapsed,full,screenScale);
  }
  _backgroundRoot.children.forEach(child=>{if(!full)return; if(child.userData.rotationRate) child.rotation.y+=child.userData.rotationRate*delta; if(child.userData.pulseSpeed) child.material.opacity=child.userData.baseOpacity*(.86+Math.sin(elapsed*child.userData.pulseSpeed+child.userData.pulsePhase)*.14);});
}
export function render(state,_view,galaxyId) {
  if (!_visible || !isAvailable()) return;
  _stateRef=state;
  const changed=(_currentGalaxyId !== galaxyId); _currentGalaxyId=galaxyId || 'milky_way';
  const resizeStartedAt = performance.now();
  const resized=_resize(),key=[_currentGalaxyId,_getEffectiveQualityLevel(),...state.merchant.unlockedPorts,getMerchantExplorationSignal(state)?.id || ''].join(':');
  if (_sceneKey!==key || changed) {
    _loadTiming.resizeMs = performance.now() - resizeStartedAt;
    const backgroundStartedAt = performance.now();
    _buildBackground();
    _loadTiming.backgroundMs = performance.now() - backgroundStartedAt;
    const portsStartedAt = performance.now();
    _buildPorts();
    _loadTiming.portsMs = performance.now() - portsStartedAt;
    _sceneKey=key;
  }
  else if (resized) resetCamera();
  const routes=state.merchantStarmapRoutes || [],routeKey=JSON.stringify(routes.map(route=>[route.id,route.routeRevision,_selectedRoute?.id]));
  if (_routeKey!==routeKey) { _buildRoutes(routes); _routeKey=routeKey; }
  _controls.update(); configureStarmapControls(_controls,true); _animate(performance.now());
  const drawStartedAt = performance.now();
  _renderer.render(_scene,_camera);
  if (_loadTiming.drawMs === undefined) _loadTiming.drawMs = performance.now() - drawStartedAt;
}
export function focusRoute(route) {
  _selectedRoute=route; _routeKey='';
  const from=_planetPositions.get(route.startSystemId),to=_planetPositions.get(route.endSystemId);
  if (from && to) panStarmapCameraTo(_camera,_controls,from.clone().lerp(to,.5));
}
export function getRendererInfo() {
  if (!_renderer) return null;
  return {renderer:'three',quality:_getEffectiveQualityLevel(),pixelRatio:_renderer.getPixelRatio(),cameraHeight:_camera.position.y,cameraTarget:_controls.target.toArray(),cameraOffset:_camera.position.clone().sub(_controls.target).toArray(),panOnly:!_controls.enableZoom&&!_controls.enableRotate,calls:_renderer.info.render.calls,triangles:_renderer.info.render.triangles,geometries:_renderer.info.memory.geometries,textures:_renderer.info.memory.textures,sceneUpdates:{..._sceneUpdateStats},loadTiming:{..._loadTiming}};
}
export function getExplorationScreenPosition(portId) {
  const position=_planetPositions.get(portId);
  if (!position || !_camera || !_canvas) return null;
  const projected=position.clone().project(_camera),rect=_canvas.getBoundingClientRect();
  const parent=_canvas.parentElement?.getBoundingClientRect() || rect;
  const x=rect.left-parent.left+(projected.x+1)*rect.width/2;
  const y=rect.top-parent.top+(1-projected.y)*rect.height/2;
  return {x,y,onScreen:projected.z>-1 && projected.z<1 && x>78 && x<parent.width-78 && y>100 && y<parent.height-100};
}
export function dispose() {
  const renderer = _renderer;
  const canvas = _canvas;
  // 初始化可能在 controls / lighting 创建前失败，先解除可用状态，避免重试复用半成品。
  _renderer = null;
  _visible = false;
  _contextLost = false;
  let disposalError = null;
  const release = cleanup => {
    try { cleanup(); }
    catch (error) { disposalError ||= error; }
  };

  release(() => _controls?.dispose());
  release(() => _lighting?.dispose(_scene));
  if (_planetRoot) release(() => _clearGroup(_planetRoot));
  if (_backgroundRoot) release(() => _clearGroup(_backgroundRoot));
  release(() => _clearPlanetSurfaceMapCache());
  _planetSurfaceMapCache.clear();
  _persistentPlanetTextures.forEach(texture => release(() => texture.dispose()));
  _persistentPlanetTextures.clear();
  _persistentGeometries.forEach(geometry => release(() => geometry.dispose()));
  _persistentGeometries.clear();
  _sharedGeometryCache.clear();
  release(() => _backgroundTexture?.dispose());

  if (canvas) {
    canvas.removeEventListener('webglcontextlost', _lost);
    canvas.removeEventListener('webglcontextrestored', _restored);
    for (const name of ['wheel', 'gesturestart', 'gesturechange']) {
      canvas.removeEventListener(name, _preventZoom, true);
    }
    canvas.style.display = 'none';
    canvas.style.visibility = 'hidden';
  }
  release(() => renderer?.dispose());

  _canvas = _scene = _lighting = _camera = _controls = null;
  _backgroundRoot = _planetRoot = _routeRoot = null;
  _sharedHaloTexture = _sharedStarTexture = _sharedSunGlowTexture = _backgroundTexture = null;
  _backgroundTextureKey = _sizeKey = _sceneKey = _routeKey = '';
  _stateRef = _motionPreference = null;
  _planetEntries = [];
  _planetPositions.clear();
  _routeVisuals = [];
  _selectedRoute = _sun = null;
  _selectedPlanetId = _hoveredPlanetId = _focusPlanetId = null;
  _ambientClock = createSceneMotionClock();
  if (disposalError) throw disposalError;
}
function _planetEntryKey(system, state, quality) {
  const unlocked = true;
  const current = system.id === state.currentSystem;
  const hot = quality !== 'high' && (current || system.id === _selectedPlanetId || system.id === _focusPlanetId || _isRouteEndpoint(system.id));
  return [unlocked, current, hot].join(':');
}

function _createPlanetEntry(system, index, state, positions, qualityLevel) {
  _sceneUpdateStats.planetEntryBuilds += 1;
  const unlocked = true;
  const current = system.id === state.currentSystem;
  const selected = system.id === _selectedPlanetId || _isRouteEndpoint(system.id);
  const focused = system.id === _focusPlanetId;
  const locationVisual = getLocationVisual(system);
  const isPlanet = locationVisual.bodyKind === 'planet';
  const visualProfile = PLANET_VISUAL_PROFILES[system.type] || DEFAULT_PLANET_VISUAL_PROFILE;
  const baseColor = new Color(PLANET_COLORS[system.type] || system.color || '#72ddff');
  const displayColor = unlocked ? baseColor : baseColor.clone().lerp(new Color(0x52616c), 0.58);
  const radius = _getPlanetRadius(system);
  const richVisuals = qualityLevel === 'high' || current || selected || focused;
  const group = new Group();
  group.name = 'system_' + system.id;
  group.position.copy(positions.get(system.id));
  group.userData.baseY = group.position.y;
  group.userData.phase = (_hash(system.id) % 628) / 100;

  const haloMaterial = new SpriteMaterial({
    map: _getSharedHaloTexture(),
    color: displayColor,
    transparent: true,
    opacity: current ? 0.46 : (selected || focused ? 0.18 : 0.28),
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const halo = new Sprite(haloMaterial);
  const haloScale = radius * (current ? 6.4 : (selected || focused ? 4.8 : 8.4));
  halo.scale.set(haloScale, haloScale, 1);
  halo.renderOrder = 1;
  halo.visible = current || selected || focused;
  group.add(halo);

  const surfaceMaps = isPlanet ? _createPlanetSurfaceMaps(system, baseColor, richVisuals) : {};
  const bodyMaterial = new MeshStandardMaterial({
    color: unlocked ? 0xffffff : 0x71808a,
    map: surfaceMaps.colorMap || null,
    bumpMap: system.id === 'nebula_forge' ? null : surfaceMaps.bumpMap || null,
    bumpScale: system.id === 'nebula_forge' ? radius * 0.006 : surfaceMaps.gaseous ? radius * 0.014 : radius * 0.03,
    emissive: surfaceMaps.emissiveMap
      ? displayColor.clone().lerp(new Color(0xbfefff), 0.32)
      : new Color(0x000000),
    emissiveMap: surfaceMaps.emissiveMap || null,
    emissiveIntensity: unlocked && surfaceMaps.emissiveMap ? 0.5 : 0.08,
    metalness: Math.min(0.08, visualProfile.metalness),
    roughness: Math.max(0.84, visualProfile.roughness),
    transparent: !unlocked || !isPlanet,
    opacity: isPlanet ? (unlocked ? 1 : 0.72) : 0,
    colorWrite: isPlanet,
    depthWrite: isPlanet,
  });
  const body = new Mesh(_getSharedPlanetSphereGeometry(), bodyMaterial);
  body.scale.set(
    radius * visualProfile.bodyScale[0],
    radius * visualProfile.bodyScale[1],
    radius * visualProfile.bodyScale[2]
  );
  body.rotation.z = ((_hash(system.id) % 21) - 10) * 0.015;
  body.rotation.y = (_hash(system.id + ':surface-offset') % 628) / 100;
  body.renderOrder = 4;
  body.userData = { systemId: system.id, unlocked };
  group.add(body);
  if (isPlanet && unlocked) {
    const details = createPlanetSurfaceDetails(system.type, qualityLevel, _getSharedGeometry);
    details.scale.setScalar(radius);
    details.rotation.copy(body.rotation);
    group.add(details);
  }
  // 空心空间站与碎石群用透明拾取体，点击孔洞仍可选择同一个地点。
  let landmark = null;
  if (!isPlanet) {
    body.scale.setScalar(radius * 1.5);
    landmark = createStarmapLandmark(locationVisual.bodyKind, qualityLevel, _getSharedGeometry, unlocked);
    landmark.scale.setScalar(radius);
    landmark.rotation.y = 0.32;
    group.add(landmark);
  } else if (locationVisual.landmark && unlocked) {
    const port = createStarmapLandmark('station', qualityLevel, _getSharedGeometry, unlocked);
    landmark = port;
    port.scale.setScalar(radius * 0.22);
    port.position.set(radius * 1.44, radius * 0.1, radius * 0.26);
    group.add(port);
  }

  let cloudShell = null;
  let cloudMaterial = null;
  if (richVisuals && surfaceMaps.cloudMap && (unlocked || current)) {
    cloudMaterial = new MeshStandardMaterial({
      color: visualProfile.cloudColor,
      map: surfaceMaps.cloudMap,
      transparent: true,
      opacity: current
        ? Math.min(0.82, visualProfile.cloudOpacity + 0.12)
        : visualProfile.cloudOpacity,
      alphaTest: 0.025,
      depthWrite: false,
      metalness: 0,
      roughness: 0.86,
    });
    cloudShell = new Mesh(_getSharedPlanetSphereGeometry(), cloudMaterial);
    cloudShell.scale.set(
      radius * visualProfile.bodyScale[0] * 1.026,
      radius * visualProfile.bodyScale[1] * 1.026,
      radius * visualProfile.bodyScale[2] * 1.026
    );
    cloudShell.rotation.y = (_hash(system.id + ':cloud') % 628) / 100;
    cloudShell.rotation.z = body.rotation.z;
    cloudShell.renderOrder = 5;
    group.add(cloudShell);
  }

  let atmosphereMaterial = null;
  if (isPlanet && richVisuals && (unlocked || current)) {
    atmosphereMaterial = createPlanetAtmosphere(visualProfile.atmosphereColor);
    const atmosphere = new Mesh(_getSharedPlanetSphereGeometry(), atmosphereMaterial);
    atmosphere.scale.copy(body.scale).multiplyScalar(1.055);
    group.add(atmosphere);
  }

  let ring = null;
  let ringMaterial = null;
  if (isPlanet && visualProfile.physicalRing && unlocked && qualityLevel !== 'low') {
    ringMaterial = new MeshBasicMaterial({
      color: current ? 0xffedb0 : 0xf3c96f,
      transparent: true,
      opacity: current ? 0.54 : 0.38,
      side: DoubleSide,
      depthWrite: false,
    });
    ring = new Mesh(_getSharedGeometry(
      'planet-energy-ring',
      function () { return new RingGeometry(1.32, 1.82, 72); }
    ), ringMaterial);
    ring.scale.setScalar(radius);
    ring.rotation.set(Math.PI * 0.6, 0.12, ((_hash(system.id) % 24) - 12) * 0.012);
    ring.renderOrder = 5;
    group.add(ring);
  }

  let debrisRing = null;
  if (isPlanet && visualProfile.debrisCount && unlocked && (qualityLevel === 'high' || current)) {
    debrisRing = _createPlanetDebrisBelt(system, radius, displayColor, visualProfile.debrisCount);
    group.add(debrisRing);
  }

  const moonPivot = isPlanet ? _createPlanetOrbitAccents(
    system,
    radius,
    displayColor,
    visualProfile,
    unlocked,
    qualityLevel,
    current || selected || focused
  ) : null;
  if (moonPivot) {
    group.add(moonPivot);
  }

  const labelPriority = current || unlocked;
  const shouldCreateLabel = qualityLevel === 'high' || labelPriority || selected || focused;
  const label = shouldCreateLabel
    ? _createPlanetLabelSprite(system, unlocked, current)
    : null;
  if (label) {
    label.position.set(0, radius * 1.6 + 2.8, 0);
    label.renderOrder = 10;
    group.add(label);
  }

  return {
    key: _planetEntryKey(system, state, qualityLevel),
    bodyKind: locationVisual.bodyKind,
    radius,
    id: system.id,
    system,
    visualProfile,
    unlocked,
    current,
    group,
    body,
    bodyMaterial,
    cloudShell,
    cloudMaterial,
    atmosphereMaterial,
    landmark,
    landmarkLight: landmark ? landmark.getObjectByName('lights').material : null,
    halo,
    haloMaterial,
    ring,
    ringMaterial,
    debrisRing,
    moonPivot,
    label,
    labelPriority,
    phase: index * 0.41,
  };
}

function _buildPlanetEnvironment() {
  const qualityLevel = _getEffectiveQualityLevel();
  const rng = _createRng(87211);
  const dustCount = qualityLevel === 'low' ? 90 : (qualityLevel === 'high' ? 260 : 170);
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  for (let index = 0; index < dustCount; index += 1) {
    dustPositions[index * 3] = (rng() - 0.5) * PLANET_SPAN_X * 1.18;
    dustPositions[index * 3 + 1] = -10 + rng() * 25;
    dustPositions[index * 3 + 2] = (rng() - 0.5) * PLANET_SPAN_Z * 1.18;
    const warm = rng() > 0.78;
    dustColors[index * 3] = warm ? 1 : 0.35 + rng() * 0.3;
    dustColors[index * 3 + 1] = warm ? 0.62 : 0.68 + rng() * 0.24;
    dustColors[index * 3 + 2] = warm ? 0.32 : 0.88 + rng() * 0.12;
  }
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute('position', new BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute('color', new BufferAttribute(dustColors, 3));
  const dustMaterial = new PointsMaterial({
    map: _getSharedStarTexture(),
    size: qualityLevel === 'low' ? 1.05 : 1.34,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.58,
    alphaTest: 0.015,
    vertexColors: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const dust = new Points(dustGeometry, dustMaterial);
  dust.position.y = -2;
  _planetRoot.add(dust);

  const environment = getSceneEnvironment(_currentGalaxyId);
  const nebulae = (qualityLevel !== 'high'
    ? [
      { x: -58, y: -15, z: 30, color: '#184e77', scale: 76 },
      { x: 86, y: -18, z: -42, color: '#5f285f', scale: 68 },
    ]
    : [
      { x: -96, y: -18, z: 48, color: '#164e70', scale: 96 },
      { x: 15, y: -22, z: -62, color: '#4b286f', scale: 88 },
      { x: 105, y: -17, z: 42, color: '#6f3e26', scale: 78 },
      { x: 22, y: -24, z: 66, color: '#165a54', scale: 72 },
    ]).map(function (spec) {
      return Object.assign({}, spec, {
        x: spec.x * PLANET_LAYOUT_SCALE_X,
        z: spec.z * PLANET_LAYOUT_SCALE_Z,
        scale: spec.scale * PLANET_LAYOUT_SCALE,
      });
    });
  nebulae.forEach(function (spec, index) {
    const material = new SpriteMaterial({
      map: _createNebulaTexture(index % 2 ? environment.dust : environment.nebula, index + 11),
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const cloud = new Sprite(material);
    cloud.position.set(spec.x, spec.y, spec.z);
    cloud.scale.set(spec.scale * 1.45, spec.scale, 1);
    cloud.renderOrder = -2;
    _planetRoot.add(cloud);
  });
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

function _createPlanetSurfaceMaps(system, color, includeDetail) {
  const qualityLevel = _getEffectiveQualityLevel();
  const detailed = !!includeDetail && qualityLevel !== 'low';
  const surfaceId = system.id === 'sol_prime' ? system.id : 'surface-family:' + (system.type || 'special');
  const cacheKey = [qualityLevel, surfaceId, color.getHexString(), detailed ? 'detail' : 'base'].join(':');
  if (_planetSurfaceMapCache.has(cacheKey)) return _planetSurfaceMapCache.get(cacheKey);
  const surface = createPlanetSurfaceData(
    { id: surfaceId, type: system.type || 'special' },
    '#' + color.getHexString(),
    true,
    qualityLevel
  );
  const maps = {
    colorMap: _createPixelTexture(surface.albedo, surface.width, surface.height, true),
    bumpMap: detailed ? _createPixelTexture(surface.bump, surface.width, surface.height, false) : null,
    cloudMap: detailed && surface.hasClouds
      ? _createPixelTexture(surface.clouds, surface.width, surface.height, true)
      : null,
    emissiveMap: detailed && surface.hasLights && surface.emissive
      ? _createPixelTexture(surface.emissive, surface.width, surface.height, true)
      : null,
    gaseous: surface.gaseous,
  };
  [maps.colorMap, maps.bumpMap, maps.cloudMap, maps.emissiveMap].forEach(function (texture) {
    if (texture) _persistentPlanetTextures.add(texture);
  });
  _planetSurfaceMapCache.set(cacheKey, maps);
  return maps;
}

function _clearPlanetSurfaceMapCache() {
  _planetSurfaceMapCache.forEach(function (maps) {
    [maps.colorMap, maps.bumpMap, maps.cloudMap, maps.emissiveMap].forEach(function (texture) {
      if (!texture) return;
      _persistentPlanetTextures.delete(texture);
      texture.dispose();
    });
  });
  _planetSurfaceMapCache.clear();
}

function _createPixelTexture(pixels, width, height, colorManaged) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);
  const texture = new CanvasTexture(canvas);
  if (colorManaged) texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  const qualityLevel = _getEffectiveQualityLevel();
  const anisotropyLimit = qualityLevel === 'high' ? 8 : (qualityLevel === 'medium' ? 4 : 2);
  texture.anisotropy = _renderer && _renderer.capabilities
    ? Math.min(anisotropyLimit, _renderer.capabilities.getMaxAnisotropy())
    : 1;
  texture.needsUpdate = true;
  return texture;
}

function _createNebulaTexture(colorHex, seed) {
  const size = _getEffectiveQualityLevel() === 'low' ? 96 : 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const color = new Color(colorHex);
  const srgb = color.clone().convertLinearToSRGB();
  const red = Math.round(srgb.r * 255);
  const green = Math.round(srgb.g * 255);
  const blue = Math.round(srgb.b * 255);
  const rng = _createRng(seed * 7193);
  ctx.globalCompositeOperation = 'lighter';
  for (let index = 0; index < 18; index += 1) {
    const x = size * (0.25 + rng() * 0.5);
    const y = size * (0.24 + rng() * 0.52);
    const radius = size * (0.12 + rng() * 0.22);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(' + red + ',' + green + ',' + blue + ',' + (0.16 + rng() * 0.12) + ')');
    gradient.addColorStop(0.55, 'rgba(' + red + ',' + green + ',' + blue + ',0.075)');
    gradient.addColorStop(1, 'rgba(' + red + ',' + green + ',' + blue + ',0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function _getPlanetRadius(system) {
  return getLocationVisual(system).radius;
}

function _createPlanetDebrisBelt(system, radius, color, count) {
  const rng = _createRng(_hash(system.id + ':debris'));
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2 + (rng() - 0.5) * 0.24;
    const distance = radius * (1.42 + rng() * 0.46);
    positions[index * 3] = Math.cos(angle) * distance;
    positions[index * 3 + 1] = (rng() - 0.5) * radius * 0.22;
    positions[index * 3 + 2] = Math.sin(angle) * distance;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    map: _getSharedStarTexture(),
    color: color.clone().lerp(new Color(0xffcf8a), 0.48),
    size: Math.max(0.48, radius * 0.22),
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.76,
    alphaTest: 0.04,
    depthWrite: false,
  });
  const belt = new Points(geometry, material);
  belt.rotation.set(Math.PI * 0.58, 0.12, ((_hash(system.id) % 30) - 15) * 0.018);
  belt.renderOrder = 4;
  return belt;
}

function _createPlanetOrbitAccents(system, radius, color, profile, unlocked, qualityLevel, hot) {
  const satelliteCount = profile.satelliteCount || 0;
  if (!unlocked || (!hot && qualityLevel !== 'high') || (!satelliteCount && !profile.naturalMoon)) {
    return null;
  }

  const pivot = new Group();
  pivot.rotation.x = 0.22 + (_hash(system.id) % 17) * 0.016;

  if (profile.naturalMoon) {
    const moonMaterial = new MeshStandardMaterial({
      color: 0xc8d2e8,
      emissive: color,
      emissiveIntensity: 0.32,
      metalness: 0.06,
      roughness: 0.9,
    });
    const moon = new Mesh(_getSharedGeometry(
      'planet-natural-moon',
      function () { return new SphereGeometry(1, 8, 6); }
    ), moonMaterial);
    moon.scale.setScalar(radius * 0.24);
    moon.position.x = radius * 2.08;
    pivot.add(moon);
  }

  if (satelliteCount) {
    const coreMaterial = new MeshStandardMaterial({
      color: 0xd9f7ff,
      emissive: color,
      emissiveIntensity: 1.4,
      metalness: 0.66,
      roughness: 0.3,
    });
    const panelMaterial = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
    });
    for (let index = 0; index < satelliteCount; index += 1) {
      const arm = new Group();
      arm.rotation.y = index / satelliteCount * Math.PI * 2 + (_hash(system.id) % 31) * 0.03;
      const satellite = new Group();
      satellite.position.x = radius * (1.78 + index * 0.16);
      const core = new Mesh(_getSharedGeometry(
        'planet-satellite-core',
        function () { return new SphereGeometry(1, 7, 5); }
      ), coreMaterial);
      core.scale.setScalar(radius * 0.11);
      const panels = new Mesh(_getSharedGeometry(
        'planet-satellite-panels',
        function () { return new BoxGeometry(1, 1, 1); }
      ), panelMaterial);
      panels.scale.set(radius * 0.42, radius * 0.045, radius * 0.13);
      satellite.add(core, panels);
      arm.add(satellite);
      pivot.add(arm);
    }
  }

  return pivot;
}

function _updateBackdropTexture() {
  if (!_scene || !_camera) return;
  const quality = _getEffectiveQualityLevel();
  const key = [_currentGalaxyId, quality, _camera.aspect.toFixed(3)].join(':');
  if (_backgroundTextureKey === key) return;
  if (_backgroundTexture) _backgroundTexture.dispose();
  const backdrop = createGalaxyBackdropData(_currentGalaxyId, quality, _camera.aspect);
  const canvas = document.createElement('canvas');
  canvas.width = backdrop.width;
  canvas.height = backdrop.height;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(backdrop.width, backdrop.height);
  pixels.data.set(backdrop.data);
  context.putImageData(pixels, 0, 0);
  _backgroundTexture = new CanvasTexture(canvas);
  _backgroundTexture.colorSpace = SRGBColorSpace;
  _scene.background = _backgroundTexture;
  _backgroundTextureKey = key;
}

function _buildBackground() {
  if (!_backgroundRoot) return;
  _clearGroup(_backgroundRoot);
  const environment = getSceneEnvironment(_currentGalaxyId);
  _updateBackdropTexture();
  _scene.fog.color.set(environment.background);
  _renderer.setClearColor(environment.background, 1);
  const settings = _getQualitySettings();
  const rng = _createRng(3045);
  const starTexture = _getSharedStarTexture();
  const positions = new Float32Array(settings.backgroundStars * 3);
  const colors = new Float32Array(settings.backgroundStars * 3);

  for (let i = 0; i < settings.backgroundStars; i += 1) {
    const radius = 230 + rng() * 470;
    const theta = rng() * Math.PI * 2;
    const y = (rng() - 0.5) * 300;
    positions[i * 3] = Math.cos(theta) * radius;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(theta) * radius;
    const cool = rng();
    colors[i * 3] = 0.48 + cool * 0.42;
    colors[i * 3 + 1] = 0.68 + cool * 0.28;
    colors[i * 3 + 2] = 0.86 + cool * 0.14;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const material = new PointsMaterial({
    map: starTexture,
    size: _getEffectiveQualityLevel() === 'low' ? 1.15 : 1.42,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.84,
    alphaTest: 0.015,
    vertexColors: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const stars = new Points(geometry, material);
  stars.name = 'deepStarfield';
  stars.userData.rotationRate = 0.0000009;
  _backgroundRoot.add(stars);

  const nearStarCount = Math.max(36, Math.round(settings.backgroundStars * 0.12));
  const nearPositions = new Float32Array(nearStarCount * 3);
  const nearColors = new Float32Array(nearStarCount * 3);
  for (let index = 0; index < nearStarCount; index += 1) {
    const radius = 105 + rng() * 190;
    const theta = rng() * Math.PI * 2;
    nearPositions[index * 3] = Math.cos(theta) * radius;
    nearPositions[index * 3 + 1] = (rng() - 0.5) * 170;
    nearPositions[index * 3 + 2] = Math.sin(theta) * radius;
    const warm = rng() > 0.76;
    nearColors[index * 3] = warm ? 1 : 0.48 + rng() * 0.24;
    nearColors[index * 3 + 1] = warm ? 0.68 + rng() * 0.2 : 0.76 + rng() * 0.18;
    nearColors[index * 3 + 2] = warm ? 0.48 + rng() * 0.28 : 1;
  }
  const nearGeometry = new BufferGeometry();
  nearGeometry.setAttribute('position', new BufferAttribute(nearPositions, 3));
  nearGeometry.setAttribute('color', new BufferAttribute(nearColors, 3));
  const nearMaterial = new PointsMaterial({
    map: starTexture,
    size: _getEffectiveQualityLevel() === 'low' ? 1.8 : 2.45,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    alphaTest: 0.015,
    vertexColors: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const nearStars = new Points(nearGeometry, nearMaterial);
  nearStars.name = 'nearStarfield';
  nearStars.userData.rotationRate = -0.0000018;
  _backgroundRoot.add(nearStars);

  if (_getEffectiveQualityLevel() === 'high') {
    [
      { color: '#163c78', x: -180, y: 42, z: -220, width: 260, height: 160, phase: 0.4 },
      { color: '#542360', x: 210, y: -54, z: -180, width: 230, height: 150, phase: 1.8 },
      { color: '#1b594e', x: 15, y: 110, z: -310, width: 300, height: 170, phase: 3.2 },
    ].forEach(function (spec, index) {
      const nebulaMaterial = new SpriteMaterial({
        map: _createNebulaTexture(index % 2 ? environment.dust : environment.nebula, 47 + index),
        color: 0xffffff,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const nebula = new Sprite(nebulaMaterial);
      nebula.position.set(spec.x, spec.y, spec.z);
      nebula.scale.set(spec.width, spec.height, 1);
      nebula.renderOrder = -10;
      nebula.userData.baseOpacity = 0.36;
      nebula.userData.pulsePhase = spec.phase;
      nebula.userData.pulseSpeed = 0.00016;
      _backgroundRoot.add(nebula);
    });
  }

  const glintCount = _getEffectiveQualityLevel() === 'high'
    ? 10
    : (_getEffectiveQualityLevel() === 'medium' ? 4 : 2);
  for (let index = 0; index < glintCount; index += 1) {
    const color = index % 4 === 0 ? new Color(0xffd3a0) : new Color(0x9de6ff);
    const glintMaterial = new SpriteMaterial({
      map: starTexture,
      color,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const glint = new Sprite(glintMaterial);
    const theta = rng() * Math.PI * 2;
    const radius = 135 + rng() * 155;
    glint.position.set(Math.cos(theta) * radius, (rng() - 0.5) * 120, Math.sin(theta) * radius);
    const scale = 3.8 + rng() * 4.6;
    glint.scale.set(scale, scale, 1);
    glint.userData.baseOpacity = 0.42 + rng() * 0.22;
    glint.userData.pulsePhase = rng() * Math.PI * 2;
    glint.userData.pulseSpeed = 0.0011 + rng() * 0.0009;
    _backgroundRoot.add(glint);
  }

  const grid = new GridHelper(PLANET_SPAN_X * 1.74, 48, 0x226487, 0x0f2f48);
  grid.position.y = -18;
  grid.material.transparent = true;
  grid.material.opacity = 0.045;
  grid.material.depthWrite = false;
  _backgroundRoot.add(grid);
}

function _createStarTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;
  const glow = ctx.createRadialGradient(center, center, 0, center, center, center);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.08, 'rgba(235,248,255,0.98)');
  glow.addColorStop(0.24, 'rgba(130,210,255,0.52)');
  glow.addColorStop(1, 'rgba(80,150,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fillRect(center - 0.7, 4, 1.4, size - 8);
  ctx.fillRect(4, center - 0.7, size - 8, 1.4);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function _createHaloTexture(colorHex) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const color = new Color(colorHex);
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const gradient = ctx.createRadialGradient(64, 64, 24, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0)');
  gradient.addColorStop(0.62, 'rgba(' + r + ',' + g + ',' + b + ',0.08)');
  gradient.addColorStop(0.78, 'rgba(' + r + ',' + g + ',' + b + ',0.78)');
  gradient.addColorStop(0.84, 'rgba(' + r + ',' + g + ',' + b + ',0.12)');
  gradient.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function _layoutPlanetLabels() {
  if (!_canvas || !_camera) return;
  _planetRoot.updateMatrixWorld(true);
  _camera.updateMatrixWorld();
  const width = _canvas.clientWidth || 1280;
  const height = _canvas.clientHeight || 720;
  const safeInset = Math.min(8, width / 4);
  const narrow = width < 720;
  const occupied = [];
  const world = new Vector3();
  const view = new Vector3();
  const projected = new Vector3();
  const priority = entry => entry.id === _selectedPlanetId || entry.id === _hoveredPlanetId || entry.id === _focusPlanetId || _isRouteEndpoint(entry.id)
    ? 3 : entry.current ? 2 : entry.unlocked ? 1 : 0;
  const entries = _planetEntries.filter(entry => entry.label).sort((a, b) => priority(b) - priority(a));
  for (const entry of entries) {
    const hot = priority(entry) >= 2;
    const label = entry.label;
    label.visible = false;
    if (!hot && (!entry.unlocked || (narrow && !_stateRef?.merchant))) continue;
    label.getWorldPosition(world);
    view.copy(world).applyMatrix4(_camera.matrixWorldInverse);
    if (view.z >= 0) continue;
    projected.copy(world).project(_camera);
    if (projected.z < -1 || projected.z > 1) continue;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const preferredPixels = _stateRef?.merchant ? 32 : hot ? 28 : 24;
    const pixels = Math.min(preferredPixels, (width - safeInset * 2) / label.userData.labelAspect);
    const labelWidth = pixels * label.userData.labelAspect;
    const labelY = y + (label.center.y - 0.5) * pixels;
    const bounds = { left: x - labelWidth / 2, right: x + labelWidth / 2, top: labelY - pixels / 2, bottom: labelY + pixels / 2 };
    if (bounds.right < 0 || bounds.left > width || bounds.bottom < 0 || bounds.top > height) continue;
    // 在屏幕边缘只移动文字锚点，保持名称与右侧类型框完整，不改变镜头或星球位置。
    const labelX = Math.max(safeInset + labelWidth / 2, Math.min(width - safeInset - labelWidth / 2, x));
    label.center.x = 0.5 - (labelX - x) / labelWidth;
    bounds.left = labelX - labelWidth / 2;
    bounds.right = labelX + labelWidth / 2;
    if (!hot && occupied.some(box => bounds.left < box.right && bounds.right > box.left && bounds.top < box.bottom && bounds.bottom > box.top)) continue;
    const worldHeight = -view.z * 2 * Math.tan(_camera.fov * Math.PI / 360) * pixels / height / entry.group.scale.y;
    label.scale.set(worldHeight * label.userData.labelAspect, worldHeight, 1);
    label.visible = true;
    label.material.opacity = entry.unlocked ? (hot ? 1 : 0.86) : 0.55;
    occupied.push(bounds);
  }
}

function _getQualitySettings() {
  return QUALITY[_getEffectiveQualityLevel()] || QUALITY.medium;
}

function _clearGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  group.traverse(function (object) {
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach(function (material) {
      if (!material) return;
      materials.add(material);
      ['map', 'alphaMap', 'bumpMap', 'emissiveMap', 'roughnessMap', 'metalnessMap'].forEach(function (key) {
        if (material[key]) textures.add(material[key]);
      });
    });
  });
  while (group.children.length > 0) group.remove(group.children[0]);
  textures.forEach(function (texture) {
    if (!_persistentPlanetTextures.has(texture)) texture.dispose();
  });
  materials.forEach(function (material) { material.dispose(); });
  geometries.forEach(function (geometry) {
    if (!_persistentGeometries.has(geometry)) geometry.dispose();
  });
}

function _getSharedGeometry(key, factory) {
  if (_sharedGeometryCache.has(key)) return _sharedGeometryCache.get(key);
  const geometry = factory();
  _sharedGeometryCache.set(key, geometry);
  _persistentGeometries.add(geometry);
  return geometry;
}

function _getSharedPlanetSphereGeometry() {
  const quality = _getQualitySettings();
  const heightSegments = Math.max(8, Math.round(quality.planetSegments * 0.7));
  const key = 'planet-sphere:' + quality.planetSegments + ':' + heightSegments;
  return _getSharedGeometry(key, function () {
    return new SphereGeometry(1, quality.planetSegments, heightSegments);
  });
}

function _getSharedHaloTexture() {
  if (_sharedHaloTexture) return _sharedHaloTexture;
  _sharedHaloTexture = _createHaloTexture('#ffffff');
  _persistentPlanetTextures.add(_sharedHaloTexture);
  return _sharedHaloTexture;
}

function _getSharedStarTexture() {
  if (_sharedStarTexture) return _sharedStarTexture;
  _sharedStarTexture = _createStarTexture();
  _persistentPlanetTextures.add(_sharedStarTexture);
  return _sharedStarTexture;
}

function _createSunMaterial() {
  // 发光球体仍须有球面层次；不依赖行星灯光，不加阴面或硬质外圈。
  return new ShaderMaterial({
    name:'warm-stellar-surface',
    uniforms:{ centerColor:{value:new Color('#ffe0a2')}, edgeColor:{value:new Color('#da6d32')} },
    vertexShader:`
      varying vec3 localPosition;
      varying vec3 viewNormal;
      varying vec3 viewDirection;
      void main() {
        localPosition = position;
        viewNormal = normalMatrix * normal;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        viewDirection = -viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader:`
      uniform vec3 centerColor;
      uniform vec3 edgeColor;
      varying vec3 localPosition;
      varying vec3 viewNormal;
      varying vec3 viewDirection;
      float grainHash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float grain(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(grainHash(i), grainHash(i+vec3(1,0,0)), f.x),
              mix(grainHash(i+vec3(0,1,0)), grainHash(i+vec3(1,1,0)), f.x), f.y),
          mix(mix(grainHash(i+vec3(0,0,1)), grainHash(i+vec3(1,0,1)), f.x),
              mix(grainHash(i+vec3(0,1,1)), grainHash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        float facing = max(dot(normalize(viewNormal), normalize(viewDirection)), 0.0);
        float cells = grain(localPosition * 15.0) * 0.65 + grain(localPosition * 34.0) * 0.35;
        float convection = grain(localPosition * 4.5);
        float warmth = clamp(pow(facing, 1.4) + (cells - 0.5) * 0.15, 0.0, 1.0);
        vec3 surface = mix(edgeColor, centerColor, warmth) * (0.82 + cells * 0.28 + convection * 0.10);
        gl_FragColor = vec4(surface, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function _getSharedSunGlowTexture() {
  if (_sharedSunGlowTexture) return _sharedSunGlowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // 恒星是连续衰减的柔光；不复用表示选中状态的环形光晕。
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,.95)');
  gradient.addColorStop(.25, 'rgba(255,255,255,.75)');
  gradient.addColorStop(.36, 'rgba(255,255,255,.4)');
  gradient.addColorStop(.48, 'rgba(255,255,255,.14)');
  gradient.addColorStop(.72, 'rgba(255,255,255,.025)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  _sharedSunGlowTexture = new CanvasTexture(canvas);
  _sharedSunGlowTexture.colorSpace = SRGBColorSpace;
  _persistentPlanetTextures.add(_sharedSunGlowTexture);
  return _sharedSunGlowTexture;
}

function _hash(text) {
  let hash = 2166136261;
  const value = String(text || '');
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function _createRng(seed) {
  let value = seed >>> 0;
  return function () {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
