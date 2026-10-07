import * as THREE from 'three';
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSceneLighting } from '/js/ui/SceneLighting.js';
import { createWorld } from './realtime-world.mjs';
import { getLowPolyStarmapLayout } from '/js/ui/StarmapLayout.js';

const names={miniature:'微缩航运沙盘',cinematic:'低多边形星际航路',illustrated:'手绘星际商圈'};
const qualities={light:'轻量',balanced:'均衡',detail:'精细'};
const map=document.querySelector('#map-container'),layer=document.querySelector('#labels');
const readout=document.querySelector('#realtime-metrics'),status=document.querySelector('#realtime-status');
const modal=document.querySelector('#settings-modal'),motion=document.querySelector('#motion');
const preference=matchMedia('(prefers-reduced-motion: reduce)'),url=new URL(location.href);
const state={style:Object.hasOwn(names,url.searchParams.get('style'))?url.searchParams.get('style'):'cinematic',
  quality:Object.hasOwn(qualities,url.searchParams.get('quality'))?url.searchParams.get('quality'):'balanced',
  ships:[2,6,12].includes(Number(url.searchParams.get('ships')))?Number(url.searchParams.get('ships')):6,
  selected:0,paused:preference.matches,elapsed:0,ready:false,disposed:false,draws:0,builds:0,frameCPU:0,buildCPU:0};
let width=0,height=0,world=null,routeMesh=null,curves=[],generation=0,raf=0,lastFrame=0,lastReadout=0;
const frameInterval=1000/30,drawTimes=[],cpuTimes=[],pan=new THREE.Vector2();
const renderer=new WebGLRenderer({antialias:true,alpha:false,powerPreference:'default'});
renderer.domElement.id='starmap-three-canvas';renderer.domElement.style.display='block';
renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','三维星图，可拖动平移，滚轮或双指缩放，Shift 加拖动或 R 转动港口，方向键平移，0 恢复全景');
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=false;
map.prepend(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-8,8,5,-5,.1,100);
camera.position.set(0,0,20);
const lighting=createSceneLighting(renderer);lighting.attach(scene);
const defaultKeyPosition=lighting.key.position.clone();
const routeMaterial=new THREE.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,
  vertexShader:'attribute float alpha;attribute float across;varying vec3 tint;varying float opacity;varying float edge;void main(){tint=color;opacity=alpha;edge=across;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec3 tint;varying float opacity;varying float edge;void main(){gl_FragColor=vec4(tint,opacity*(1.-smoothstep(.72,1.,abs(edge))));
  #include <colorspace_fragment>
  }`});
const portNames=[['太阳主星','agricultural','农业'],['矿石带','mining','矿业'],['星云工厂','industrial','工业'],['极光原料港','mining','原料']];
const labels=portNames.map(([name,type,badge],index)=>{
  const button=document.createElement('button');button.className='port-label';button.type='button';button.dataset.type=type;
  button.innerHTML=`<strong>${name}</strong><span class="port-type">${badge}</span>`;
  button.addEventListener('click',()=>selectPort(index));layer.append(button);return button;
});
const corners=Array.from({length:8},()=>new THREE.Vector3()),projected=new THREE.Vector3(),box=new THREE.Box3();
const temp=new THREE.Vector3(),direction=new THREE.Vector3(),shipPosition=new THREE.Vector3(),tail=new THREE.Vector3(),engineScale=new THREE.Vector3(),engineQuaternion=new THREE.Quaternion();
const instanceMatrix=new THREE.Matrix4(),shipQuaternion=new THREE.Quaternion(),tilt=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.56),scale=new THREE.Vector3();
const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();

function screenPoint(x,y,z=0){return new THREE.Vector3((x/width-.5)*(camera.right-camera.left),(.5-y/height)*10,z);}
function updateURL(){const u=new URL(location.href);u.searchParams.set('style',state.style);u.searchParams.set('quality',state.quality);u.searchParams.set('ships',state.ships);history.replaceState(null,'',u);}
function updateMotion(){motion.textContent=state.paused?'恢复动画':'暂停动画';motion.setAttribute('aria-pressed',String(state.paused));}
function blocked(){return state.disposed||document.hidden||!modal.inert||state.paused||!state.ready;}
function schedule(){if(!raf&&!blocked())raf=requestAnimationFrame(animate);}
function stop(){if(raf)cancelAnimationFrame(raf);raf=0;}
function invalidate(){if(state.ready){render();schedule();}}

function metrics(){
  const info=renderer.info,now=performance.now();
  while(drawTimes.length&&drawTimes[0]<now-2000)drawTimes.shift();
  const span=drawTimes.length>1?drawTimes.at(-1)-drawTimes[0]:0;
  const intervals=drawTimes.slice(1).map((time,i)=>time-drawTimes[i]);
  const p95=values=>values.length?Number([...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1].toFixed(2)):0;
  return {style:state.style,quality:state.quality,ships:state.ships,ready:state.ready,
    calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,
    fps:span>0?Number(((drawTimes.length-1)*1000/span).toFixed(1)):0,frameCPUms:Number(state.frameCPU.toFixed(2)),
    frameSamples:drawTimes.length,drawIntervalP95ms:p95(intervals),frameCPUP95ms:p95(cpuTimes),buildCPUms:Number(state.buildCPU.toFixed(1)),
    dpr:renderer.getPixelRatio(),width,height,zoom:Number(camera.zoom.toFixed(2)),pan:[Number(pan.x.toFixed(2)),Number(pan.y.toFixed(2))],
    selected:state.selected,paused:state.paused,overlayOpen:!modal.inert,draws:state.draws,builds:state.builds,
    elapsed:Number(state.elapsed.toFixed(3)),engine:'Three.js '+THREE.REVISION,source:state.style==='cinematic'?'实时低多边形模型、程序化色场与简洁背景':'实时几何体与程序化材质',
    bodyGeometry:world?.ports.map(port=>port.body?.geometry.type||'组合矿体'),
    modelAngle:world?Number(world.ports[state.selected].group.rotation.y.toFixed(3)):0,
    viewTilt:world?world.ports[state.selected].group.rotation.toArray().slice(0,3).map(n=>Number(n.toFixed(3))):[],
    portScalePx:world?world.ports.map(p=>Number((p.group.scale.x*height/10).toFixed(1))):[],
    sunRadiusPx:world?Number((world.sun.scale.x*.42*height/10).toFixed(1)):0,
    starCount:world?.stars.geometry.attributes.position.count,
    scope:'独立四港演示航次，不连接玩家存档；CPU 时间不等于 GPU 完成时间'};
}
function updateReadout(force=false){
  const now=performance.now();if(!force&&now-lastReadout<500)return;lastReadout=now;
  const data=metrics();readout.textContent=`${names[state.style]} · ${qualities[state.quality]} · ${state.ships} 艘船\n${data.calls} draw calls · ${data.triangles.toLocaleString()} 三角形\n几何 ${data.geometries} · 纹理 ${data.textures} · DPR ${data.dpr} · ${data.fps} 帧/秒\nCPU 更新与提交 ${data.frameCPUms} ms（不包含 GPU 完成耗时）`;
  // 可读诊断放在演示 DOM 内，方便自动验证暂停、切换和资源生命周期。
  map.dataset.metrics=JSON.stringify(data);map.dataset.ready=String(state.ready);
}
function render(sampleAnimation=false){
  if(!world||state.disposed)return;
  const begin=performance.now();updateShips();
  for(const material of world.animated)if(material.uniforms.time)material.uniforms.time.value=state.elapsed;
  for(const spin of world.rotating)spin.group.rotation.y=spin.phase+state.elapsed*spin.speed;
  renderer.render(scene,camera);state.frameCPU=performance.now()-begin;state.draws++;
  if(sampleAnimation&&!blocked()){drawTimes.push(performance.now());cpuTimes.push(state.frameCPU);if(cpuTimes.length>60)cpuTimes.shift();}
  updateReadout();
}
function animate(now){
  raf=0;if(blocked())return;
  const elapsed=now-lastFrame;
  if(elapsed>=frameInterval){const remainder=elapsed%frameInterval;state.elapsed+=Math.min((elapsed-remainder)/1000,.15);lastFrame=now-remainder;render(true);}
  schedule();
}

function positionLabels(){
  if(!world)return;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const navTop=document.querySelector('#status-bar').getBoundingClientRect().top;
  const reserved=[];
  world.ports.forEach((port,index)=>{
    box.setFromObject(port.group);let top=Infinity;
    corners.forEach((corner,i)=>{
      corner.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).project(camera);
      top=Math.min(top,(1-corner.y)*height/2);
    });
    projected.copy(port.group.position).project(camera);
    const cx=(projected.x+1)*width/2,cy=(1-projected.y)*height/2;
    labels[index].hidden=cx< -80||cx>width+80||cy<40||cy>height+80;
    const half=labels[index].offsetWidth/2;
    const x=Math.max(half+8,Math.min(width-half-8,cx));
    let y=Math.max(52,Math.min(navTop-42,top-34));
    // 标题碰撞只在镜头或布局变化时处理，不按帧重复计算。
    for(const old of reserved)if(Math.abs(x-old.x)<half+old.half+8&&Math.abs(y-old.y)<34)y=old.y+35;
    y=Math.min(navTop-42,y);reserved.push({x,y,half});
    labels[index].style.left=`${x}px`;labels[index].style.top=`${y}px`;
  });
}
function ribbon(curve,color,opacity,pixels){
  const positions=[],colors=[],alphas=[],across=[],indices=[],segments=qualitySegments(),half=pixels/height*5;
  for(let i=0;i<=segments;i++){
    curve.getPoint(i/segments,temp);curve.getTangent(i/segments,direction);
    const nx=-direction.y*half,ny=direction.x*half;
    positions.push(temp.x+nx,temp.y+ny,-.9,temp.x-nx,temp.y-ny,-.9);
    for(let j=0;j<2;j++){colors.push(color.r,color.g,color.b);alphas.push(opacity);across.push(j===0?-1:1);}
    if(i<segments){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setAttribute('alpha',new THREE.Float32BufferAttribute(alphas,1));g.setAttribute('across',new THREE.Float32BufferAttribute(across,1));g.setIndex(indices);
  const flat=g.toNonIndexed();g.dispose();return flat;
}
function qualitySegments(){return state.quality==='light'?32:64;}
function buildRoutes(){
  if(routeMesh){scene.remove(routeMesh);routeMesh.geometry.dispose();}
  const edges=[[0,1],[1,2],[2,3],[3,0],[0,2]],parts=[];
  curves=edges.map(([a,b],index)=>{
    const start=world.ports[a].group.localToWorld(world.ports[a].dock.clone()),end=world.ports[b].group.localToWorld(world.ports[b].dock.clone());
    start.z=end.z=.8;
    const middle=start.clone().lerp(end,.5);middle.y+=state.style==='cinematic'?(index===0?.85:index===4?-.65:index===2?-.65:index===3?-.48:.35):(index===0?.45:index===4?-.28:.12);
    const curve=new THREE.QuadraticBezierCurve3(start,middle,end),active=a===state.selected||b===state.selected;
    const cinematic=state.style==='cinematic',c=new THREE.Color(cinematic?'#e9bb71':active?'#d9c396':'#577b95');
    if(active||cinematic)parts.push(ribbon(curve,c,cinematic?.13:.10,5));
    parts.push(ribbon(curve,c,cinematic?(active?.92:.70):(active?.87:.28),cinematic?1.3:active?1.8:1));return curve;
  });
  const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());routeMesh=new THREE.Mesh(geometry,routeMaterial);scene.add(routeMesh);
  if(world.routeMarkers){
    const positions=world.routeMarkers.geometry.attributes.position;
    curves.forEach((curve,i)=>{for(const [j,t] of [.32,.68].entries()){curve.getPoint(t,temp);positions.setXYZ(i*2+j,temp.x,temp.y,-.82);}});
    positions.needsUpdate=true;world.routeMarkers.material.uniforms.pixelRatio.value=renderer.getPixelRatio();
  }
}
function updateShips(){
  if(!world||!curves.length)return;
  const counts=[Math.ceil(state.ships/2),Math.floor(state.ships/2)];
  world.shipSets.forEach((set,typeIndex)=>{
    const count=counts[typeIndex];set.meshes.forEach(mesh=>mesh.count=count);
    for(let i=0;i<count;i++){
      const shipId=i*2+typeIndex,curve=curves[shipId%curves.length],reverse=shipId%3===1;
      let progress=(state.elapsed*(typeIndex===0?.036:.048)+.18+shipId*.167)%1;
      if(reverse)progress=1-progress;
      curve.getPoint(progress,shipPosition);shipPosition.z=1.15;
      curve.getTangent(progress,direction);if(reverse)direction.negate();
      const angle=Math.atan2(direction.y,direction.x);
      shipQuaternion.setFromAxisAngle(Z_AXIS,angle).multiply(tilt);
      const pixels=width<700?(typeIndex?23:29):state.style==='cinematic'?(typeIndex?35:45):(typeIndex?29:38),s=pixels/height*10/set.length;
      scale.setScalar(s);instanceMatrix.compose(shipPosition,shipQuaternion,scale);
      for(const mesh of set.meshes)mesh.setMatrixAt(i,instanceMatrix);
      const cinematic=state.style==='cinematic';
      tail.copy(shipPosition).addScaledVector(direction,-pixels/height*(cinematic?9.0:5.8));
      tail.z=1.10;engineQuaternion.setFromAxisAngle(Z_AXIS,angle);engineScale.set(pixels/height*(cinematic?9.0:4.8),pixels/height*(cinematic?2.2:1.4),1);
      instanceMatrix.compose(tail,engineQuaternion,engineScale);world.engines.setMatrixAt(shipId,instanceMatrix);
    }
    set.meshes.forEach(mesh=>mesh.instanceMatrix.needsUpdate=true);
  });
  world.engines.count=state.ships;world.engines.instanceMatrix.needsUpdate=true;
}
const Z_AXIS=new THREE.Vector3(0,0,1);
function updateSelection(){
  const selected=world.ports[state.selected];world.selection.position.copy(selected.group.position);world.selection.position.z=1.8;
  world.selection.scale.setScalar(selected.group.scale.x);
  labels.forEach((label,i)=>label.setAttribute('aria-pressed',String(i===state.selected)));
}
function selectPort(index){state.selected=index;if(!world)return;updateSelection();buildRoutes();invalidate();updateReadout(true);}

function resize(){
  width=map.clientWidth;height=map.clientHeight;if(!width||!height)return;
  const aspect=width/height;camera.left=-5*aspect;camera.right=5*aspect;camera.updateProjectionMatrix();
  const cap=state.quality==='light'?1:state.quality==='detail'?(width<700?1.5:2):(width<700?1.25:1.5);
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,cap,Math.sqrt(3_200_000/(width*height))));renderer.setSize(width,height,false);
  if(world){
    const mobile=width<700,cinematic=state.style==='cinematic';
    const layout=cinematic?getLowPolyStarmapLayout(width,height):null;
    const points=mobile?[[.29,.24],[.74,.43],[.28,.60],[.73,.77]]:[[.35,.37],[.77,.35],[.66,.71],[.22,.73]];
    const radius=(layout?.planetRadius||(mobile?54:Math.min(116,width*.088)))/height*10;
    world.ports.forEach((port,i)=>{const point=layout?.ports.get(port.id)||{x:points[i][0]*width,y:points[i][1]*height};port.group.position.copy(screenPoint(point.x,point.y));port.group.scale.setScalar(radius*port.radius);});
    const sun=layout?.sun||{x:width*(mobile?.76:.15),y:height*(mobile?.13:.20),radius:mobile?20:37};
    world.sun.position.copy(screenPoint(sun.x,sun.y,-2));world.sun.scale.setScalar(sun.radius/height*10/.42);
    positionBackground();
    const p=world.stars.geometry.attributes.position,n=world.stars.userData.normalized;
    for(let i=0;i<p.count;i++)p.setXYZ(i,n[i*3]*(camera.right-camera.left),n[i*3+1]*10,n[i*3+2]);p.needsUpdate=true;
    world.starMaterial.uniforms.pixelRatio.value=renderer.getPixelRatio();
    scene.updateMatrixWorld(true);updateSelection();buildRoutes();positionLabels();invalidate();updateReadout(true);
  }
}
async function rebuild(){
  const token=++generation;state.ready=false;stop();status.textContent='正在准备场景…';map.dataset.ready='false';
  await new Promise(resolve=>requestAnimationFrame(resolve));
  if(token!==generation||state.disposed)return;
  try{
    if(world){world.dispose();world=null;}
    const begin=performance.now();world=createWorld(state.style,state.quality);state.buildCPU=performance.now()-begin;scene.add(world.root);
    world.ports.forEach(port=>port.group.userData.initialRotation=port.group.rotation.clone());
    lighting.group.children[0].intensity=state.style==='cinematic'?1.12:1.05;
    lighting.key.intensity=state.style==='cinematic'?3.7:3.5;
    lighting.key.position.copy(state.style==='cinematic'?new THREE.Vector3(-7,9,10):defaultKeyPosition);
    scene.environmentIntensity=state.style==='cinematic'?.48:.32;
    renderer.toneMappingExposure=state.style==='illustrated'?1.13:1.10;
    state.ready=true;state.builds++;drawTimes.length=0;cpuTimes.length=0;pan.set(0,0);camera.zoom=1;camera.position.set(0,0,20);
    status.textContent=`${names[state.style]} · 拖动平移，滚轮或双指缩放；Shift + 拖动查看港口的三维角度，R 转动所选港口，全景按钮恢复视角。`;
    resize();updateURL();lastFrame=performance.now();schedule();updateReadout(true);
  }catch(error){state.ready=false;status.textContent='场景初始化失败：'+error.message;console.error(error);}
}
function positionBackground(){
  if(!world)return;
  world.background.position.set(pan.x,pan.y,-8);
  world.background.scale.set((camera.right-camera.left)/camera.zoom,10/camera.zoom,1);
  const texture=world.background.material.map,aspect=world.background.userData.aspect;
  if(aspect){
    const viewportAspect=width/height;
    texture.repeat.set(Math.min(1,viewportAspect/aspect),Math.min(1,aspect/viewportAspect));
    texture.offset.set((1-texture.repeat.x)*(width<700?.68:.5),(1-texture.repeat.y)*.5);
  }
}
function updateCamera(){camera.position.x=pan.x;camera.position.y=pan.y;camera.updateProjectionMatrix();positionBackground();positionLabels();invalidate();updateReadout(true);}
function overview(){pan.set(0,0);camera.zoom=1;if(world){world.ports.forEach(port=>port.group.rotation.copy(port.group.userData.initialRotation));scene.updateMatrixWorld(true);buildRoutes();}updateCamera();}
document.querySelector('#overview').addEventListener('click',overview);
const pointers=new Map();let gesture=null;
renderer.domElement.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;renderer.domElement.setPointerCapture(event.pointerId);pointers.set(event.pointerId,[event.clientX,event.clientY]);
  gesture={start:[event.clientX,event.clientY],pan:pan.clone(),zoom:camera.zoom,moved:false,rotate:event.shiftKey,rotation:world?.ports[state.selected].group.rotation.clone()};
  if(pointers.size===2){const [a,b]=[...pointers.values()];gesture.distance=Math.hypot(a[0]-b[0],a[1]-b[1]);}
});
renderer.domElement.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId)||!gesture)return;pointers.set(event.pointerId,[event.clientX,event.clientY]);
  const dx=event.clientX-gesture.start[0],dy=event.clientY-gesture.start[1];
  if(Math.hypot(dx,dy)>5)gesture.moved=true;
  if(pointers.size===2&&gesture.distance){const [a,b]=[...pointers.values()];camera.zoom=THREE.MathUtils.clamp(gesture.zoom*Math.hypot(a[0]-b[0],a[1]-b[1])/gesture.distance,.72,2.2);gesture.moved=true;}
  else if(gesture.rotate&&world){const port=world.ports[state.selected];port.group.rotation.x=gesture.rotation.x+dy*.006;port.group.rotation.y=gesture.rotation.y+dx*.006;scene.updateMatrixWorld(true);buildRoutes();}
  else{pan.x=THREE.MathUtils.clamp(gesture.pan.x-dx/height*10/camera.zoom,-8,8);pan.y=THREE.MathUtils.clamp(gesture.pan.y+dy/height*10/camera.zoom,-5,5);}
  updateCamera();
});
renderer.domElement.addEventListener('pointerup',event=>{
  if(gesture&&!gesture.moved&&state.ready){
    const rect=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
    raycaster.setFromCamera(mouse,camera);const hits=raycaster.intersectObjects(world.ports.map(p=>p.group),true);
    if(hits.length){let node=hits[0].object;while(node&&!world.ports.some(p=>p.group===node))node=node.parent;const index=world.ports.findIndex(p=>p.group===node);if(index>=0)selectPort(index);}
  }
  pointers.delete(event.pointerId);gesture=null;
});
renderer.domElement.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);gesture=null;});
renderer.domElement.addEventListener('wheel',event=>{event.preventDefault();camera.zoom=THREE.MathUtils.clamp(camera.zoom*Math.exp(-event.deltaY*.0012),.72,2.2);updateCamera();},{passive:false});
renderer.domElement.addEventListener('keydown',event=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','0',' '].includes(event.key))event.preventDefault();
  if(event.key==='0'){overview();return;}
  if(event.key.toLowerCase()==='r'&&world){world.ports[state.selected].group.rotation.y+=Math.PI/10;scene.updateMatrixWorld(true);buildRoutes();updateCamera();return;}
  if(event.key===' '){motion.click();return;}
  if(event.key==='ArrowLeft')pan.x-=.35;if(event.key==='ArrowRight')pan.x+=.35;
  if(event.key==='ArrowUp')pan.y+=.35;if(event.key==='ArrowDown')pan.y-=.35;
  if(event.key==='+'||event.key==='=')camera.zoom=Math.min(2.2,camera.zoom*1.1);
  if(event.key==='-')camera.zoom=Math.max(.72,camera.zoom/1.1);updateCamera();
});

const styleSelect=document.querySelector('#art-style'),qualitySelect=document.querySelector('#quality'),shipsSelect=document.querySelector('#fleet-size');
styleSelect.value=state.style;qualitySelect.value=state.quality;shipsSelect.value=String(state.ships);
styleSelect.addEventListener('change',()=>{state.style=styleSelect.value;rebuild();});
qualitySelect.addEventListener('change',()=>{state.quality=qualitySelect.value;rebuild();});
shipsSelect.addEventListener('change',()=>{state.ships=Number(shipsSelect.value);updateURL();invalidate();updateReadout(true);});
motion.addEventListener('click',()=>{state.paused=!state.paused;updateMotion();if(state.paused)stop();else{lastFrame=performance.now();schedule();}updateReadout(true);});
preference.addEventListener('change',event=>{state.paused=event.matches;updateMotion();stop();lastFrame=performance.now();schedule();updateReadout(true);});
const closeButton=document.querySelector('#close-demo-settings');
function closeModal(){modal.classList.add('hidden');modal.inert=true;modal.setAttribute('aria-hidden','true');lastFrame=performance.now();schedule();document.querySelector('#company-tools summary').focus();updateReadout(true);}
document.querySelector('#demo-settings').addEventListener('click',()=>{document.querySelector('#company-tools').open=false;stop();modal.classList.remove('hidden');modal.inert=false;modal.setAttribute('aria-hidden','false');closeButton.focus();updateReadout(true);});
closeButton.addEventListener('click',closeModal);
modal.addEventListener('click',event=>{if(event.target===modal)closeModal();});
modal.addEventListener('keydown',event=>{
  if(event.key==='Escape'){closeModal();return;}
  if(event.key==='Tab'){
    const controls=[...modal.querySelectorAll('button,select,a[href]')];const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
document.addEventListener('visibilitychange',()=>{stop();lastFrame=performance.now();schedule();updateReadout(true);});
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(map);
window.addEventListener('pagehide',event=>{stop();if(event.persisted)return;state.disposed=true;generation++;resizeObserver.disconnect();world?.dispose();routeMesh?.geometry.dispose();routeMaterial.dispose();lighting.dispose(scene);renderer.dispose();});
window.addEventListener('pageshow',()=>{lastFrame=performance.now();schedule();});
updateMotion();resize();rebuild();
