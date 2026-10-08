import * as THREE from 'three';
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createShipAsset } from '/js/ui/ShipModelFactory.js';
import { createPlanetSurfaceData } from '/js/ui/PlanetSurfaceTexture.js';
import { createPlanetAtmosphere } from '/js/ui/PlanetAtmosphere.js';
import { createStarmapLandmark } from '/js/ui/StarmapLandmarks.js';
import { createSceneLighting } from '/js/ui/SceneLighting.js';

// Presentation coordinates only: this isolated study never imports or writes a save.
const map = document.querySelector('#map-container');
const labelLayer = document.querySelector('#labels');
const readout = document.querySelector('#metrics');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const cache = new Map();
const textureCache = new Map();
const geometries = (key, create) => { if (!cache.has(key)) cache.set(key, create()); return cache.get(key); };
const initialQuality=new URL(location.href).searchParams.get('quality')==='light'?'light':'balanced';
const state = { quality:initialQuality, selected:true, paused:motionPreference.matches, port:0, seconds:0 };
document.querySelector('#quality').value=initialQuality;
const renderer = new WebGLRenderer({ antialias:true, alpha:true, powerPreference:'low-power' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = false;
renderer.setClearColor(0x0b1424, 0);
renderer.domElement.id = 'starmap-three-canvas';
renderer.domElement.style.display = 'block';
map.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-8,8,5,-5,.1,100);
camera.position.set(0,0,20);
const lighting = createSceneLighting(renderer);
lighting.attach(scene);
lighting.group.children[0].intensity = .7;
lighting.key.intensity = 2.7;
scene.environmentIntensity = .23;
let content = new THREE.Group(); scene.add(content);
let routes, ports, ships, stars, activeCurve;
let width = 0, height = 0, mobile = false;

const portDefinitions = [
  { id:'sol_prime', name:'金穗农业星', subtitle:'农业', type:'agricultural', color:'#77bda5', radius:1.05 },
  { id:'mineral_belt', name:'黑金矿星', subtitle:'矿业', type:'mining', color:'#b9a185', radius:.86 },
  { id:'nebula_forge', name:'百炼工业星', subtitle:'工业', type:'industrial', color:'#bc927a', radius:.94 },
  { id:'aurora_depot', name:'聚宝原料星', subtitle:'原料', type:'mining', color:'#83bbb1', radius:.8 },
];
const labels = portDefinitions.map((definition,index) => {
  const button = document.createElement('button'); button.type='button';button.className='port-label';button.dataset.type=definition.type;
  button.innerHTML=`<strong>${definition.name}</strong><span class="port-type">${definition.subtitle}</span>`;
  button.addEventListener('click',()=>selectPort(index)); labelLayer.append(button); return button;
});

function textureFor(definition, quality, channel) {
  const key=`${definition.id}-${quality}`;
  if (!textureCache.has(key)) {
    const data=createPlanetSurfaceData(definition,definition.color,true,quality);
    const result={};
    for(const name of ['albedo','bump','clouds']) {
      const texture=new THREE.DataTexture(data[name],data.width,data.height,THREE.RGBAFormat);
      texture.colorSpace=name==='bump'?THREE.NoColorSpace:THREE.SRGBColorSpace;
      texture.wrapS=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps=true;texture.needsUpdate=true;result[name]=texture;
    }
    textureCache.set(key,result);
  }
  return textureCache.get(key)[channel];
}
function merge(parts) { const result=mergeGeometries(parts.map(part=>part.toNonIndexed()));parts.forEach(part=>part.dispose());return result; }
function surfaceAccents(definition, quality) {
  const group=new THREE.Group();
  if(definition.type==='agricultural') {
    // All sculpted cloud puffs become one opaque mesh and one draw call.
    const geo=geometries(`merged-clouds-${quality}`,()=> {
      const parts=[];
      for(const [x,y,z] of [[-.56,.54,.67],[.55,.14,.84],[-.28,-.52,.82]]) {
        for(let i=0;i<(quality==='low'?2:4);i++) {
          const p=new THREE.Vector3(x+(i-1.5)*.065,y+Math.sin(i*2)*.025,z).normalize().multiplyScalar(1.013);
          parts.push(new THREE.SphereGeometry(1,quality==='low'?6:10,quality==='low'?4:8).scale(.078+.014*(i%2),.045,.067).translate(p.x,p.y,p.z));
        }
      }
      return merge(parts);
    });
    group.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#d6e2d6',roughness:1,metalness:0})));
  }
  const blocks=geometries(`${definition.id}-buildings-${quality}`,()=>{
    const parts=[];const count=definition.type==='industrial'?(quality==='low'?5:11):3;
    for(let i=0;i<count;i++) {
      const normal=new THREE.Vector3(-.43+(i%4)*.2,.3+Math.floor(i/4)*.17,.85).normalize();
      const matrix=new THREE.Matrix4().compose(normal.clone().multiplyScalar(1.006),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal),new THREE.Vector3(1,1,1));
      parts.push(new THREE.BoxGeometry(.075+(i%3)*.01,.026+(i%2)*.014,.064).applyMatrix4(matrix));
    }
    return merge(parts);
  });
  group.add(new THREE.Mesh(blocks,new THREE.MeshStandardMaterial({color:definition.type==='industrial'?'#9b9b8c':'#cac6ad',roughness:.9,metalness:.08})));
  if(definition.type==='industrial') {
    const windowGeo=geometries(`factory-windows-${quality}`,()=>{
      const parts=[];
      for(let i=0;i<5;i++) {const p=new THREE.Vector3(-.41+i*.17,.29,.9).normalize().multiplyScalar(1.047);parts.push(new THREE.BoxGeometry(.04,.012,.012).translate(p.x,p.y,p.z));}
      return merge(parts);
    });
    group.add(new THREE.Mesh(windowGeo,new THREE.MeshBasicMaterial({color:'#e2b57d'})));
  }
  return group;
}

function createPlanet(definition, quality) {
  const group=new THREE.Group();
  const geo=geometries(`sphere-${quality}`,()=>new THREE.SphereGeometry(1,quality==='low'?24:48,quality==='low'?16:32));
  const material=new THREE.MeshStandardMaterial({color:definition.type==='industrial'?'#8ca6ae':'#ffffff',map:textureFor(definition,quality,'albedo'),bumpMap:textureFor(definition,quality,'bump'),bumpScale:definition.type==='industrial'?.002:.018,roughness:.88,metalness:.02});
  group.add(new THREE.Mesh(geo,material));
  if(definition.type==='agricultural'&&quality!=='low') {
    const cloudMaterial=new THREE.MeshStandardMaterial({map:textureFor(definition,quality,'clouds'),transparent:true,opacity:.33,depthWrite:false,roughness:1});
    const cloudLayer=new THREE.Mesh(geo,cloudMaterial);cloudLayer.scale.setScalar(1.014);group.add(cloudLayer);
  }
  const atmosphere=new THREE.Mesh(geo,createPlanetAtmosphere(definition.type==='industrial'?'#b38760':'#77bdd0'));
  atmosphere.scale.setScalar(1.035);group.add(atmosphere);
  group.add(surfaceAccents(definition,quality));
  const station=createStarmapLandmark('station',quality,geometries,true);station.scale.setScalar(.30);station.position.set(.92,-.25,.72);station.rotation.x=.75;group.add(station);
  group.rotation.set(.08,-.25,.12);
  group.scale.setScalar(definition.radius);return group;
}
function createAsteroids(definition, quality) {
  const group=createStarmapLandmark('asteroids',quality,geometries,true);
  const rock=group.children.find(child=>child.name==='rock');
  rock.material.color.set(definition.id==='aurora_depot'?'#769591':'#988678');
  if(definition.id==='aurora_depot') {
    group.children.find(child=>child.name==='hull').visible=false;
    group.children.find(child=>child.name==='lights').visible=false;
    group.children.find(child=>child.name==='lights').material.color.set('#8cd1c1');
    group.children.find(child=>child.name==='lights').material.emissive.set('#8cd1c1');
    const warehouses=geometries(`aurora-warehouse-${quality}`,()=>{
      const parts=[new THREE.BoxGeometry(.91,.1,.42).translate(.13,.13,.4)];for(let i=0;i<4;i++)parts.push(new THREE.BoxGeometry(.20,.19,.24).translate(-.21+i*.21,.28,.4));return merge(parts);
    });
    group.add(new THREE.Mesh(warehouses,new THREE.MeshStandardMaterial({color:'#97b0a5',roughness:.9,metalness:.05})));
    const worklights=geometries('aurora-worklights',()=>merge([new THREE.BoxGeometry(.79,.025,.025).translate(.1,.34,.54),new THREE.BoxGeometry(.05,.10,.04).translate(.55,.24,.51)]));group.add(new THREE.Mesh(worklights,new THREE.MeshBasicMaterial({color:'#9fd6c5'})));
    // A single local rim plane, kept low-opacity behind the rocks.
    const haloGeo=geometries('aurora-halo',()=>new THREE.PlaneGeometry(3.4,2.2));
    const haloMat=new THREE.ShaderMaterial({uniforms:{},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.;float a=exp(-dot(p,p)*4.)*.08;gl_FragColor=vec4(.19,.49,.42,a);}',transparent:true,depthWrite:false});
    const halo=new THREE.Mesh(haloGeo,haloMat);halo.position.z=-.65;group.add(halo);
  }
  group.rotation.set(.16,-.07,.12);group.scale.setScalar(definition.radius*1.05);return group;
}
// Same original stellar surface art as RendererThreeStarmap._createSunMaterial.
function createSunMaterial() {
  return new THREE.ShaderMaterial({name:'warm-stellar-surface',uniforms:{centerColor:{value:new THREE.Color('#ffe0a2')},edgeColor:{value:new THREE.Color('#da6d32')}},vertexShader:`
    varying vec3 localPosition;
    varying vec3 viewNormal;
    varying vec3 viewDirection;
    void main(){localPosition=position;viewNormal=normalMatrix*normal;vec4 viewPosition=modelViewMatrix*vec4(position,1.0);viewDirection=-viewPosition.xyz;gl_Position=projectionMatrix*viewPosition;}
  `,fragmentShader:`
    uniform vec3 centerColor;uniform vec3 edgeColor;
    varying vec3 localPosition;varying vec3 viewNormal;varying vec3 viewDirection;
    float grainHash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float grain(vec3 p){
      vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(
        mix(mix(grainHash(i),grainHash(i+vec3(1,0,0)),f.x),mix(grainHash(i+vec3(0,1,0)),grainHash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(grainHash(i+vec3(0,0,1)),grainHash(i+vec3(1,0,1)),f.x),mix(grainHash(i+vec3(0,1,1)),grainHash(i+vec3(1,1,1)),f.x),f.y),f.z);
    }
    void main(){
      float facing=max(dot(normalize(viewNormal),normalize(viewDirection)),0.);
      float cells=grain(localPosition*15.)*.65+grain(localPosition*34.)*.35;
      float convection=grain(localPosition*4.5);
      float warmth=clamp(pow(facing,1.4)+(cells-.5)*.15,0.,1.);
      vec3 surface=mix(edgeColor,centerColor,warmth)*(.82+cells*.28+convection*.10);
      gl_FragColor=vec4(surface,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `});
}
function makeSun() {
  const material=new THREE.ShaderMaterial({uniforms:{},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float core=1.-smoothstep(.032,.066,r);float corona=exp(-r*20.)*.24;float halo=exp(-r*r*7.)*.24;gl_FragColor=vec4(vec3(1.,.68,.31),core+corona+halo);}`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const group=new THREE.Group();group.add(new THREE.Mesh(geometries('sun-plane',()=>new THREE.PlaneGeometry(5,5)),material));
  const sphere=new THREE.Mesh(geometries('sun-sphere',()=>new THREE.SphereGeometry(.75,32,20)),createSunMaterial());sphere.position.z=.08;group.add(sphere);return group;
}
function starField(quality) {
  const rng=seeded(217); const positions=[],sizes=[],colors=[];
  const count=quality==='low'?65:125;
  for(let i=0;i<count;i++) {
    positions.push((rng()-.5)*25,(rng()-.5)*13,-3);
    sizes.push(i%13===0?1.9:1.05+rng()*.65);
    const c=new THREE.Color(i%9===0?'#b6a180':'#8a9db6').multiplyScalar(.48+rng()*.43);colors.push(c.r,c.g,c.b);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('pointSize',new THREE.Float32BufferAttribute(sizes,1));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const material=new THREE.ShaderMaterial({uniforms:{pixelRatio:{value:1}},vertexColors:true,vertexShader:'uniform float pixelRatio;attribute float pointSize;varying vec3 vColor;void main(){vColor=color;gl_PointSize=pointSize*pixelRatio;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 vColor;void main(){float a=1.-smoothstep(.15,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(vColor,a);
    #include <colorspace_fragment>
  }`,transparent:true,depthWrite:false});
  const points=new THREE.Points(geometry,material);points.userData.normalized=positions.map((v,i)=>i%3===0?v/25:i%3===1?v/13:v);return points;
}
function seeded(seed) {return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}

function resetScene() {
  content.traverse(object=>{if(object.material){for(const material of(Array.isArray(object.material)?object.material:[object.material]))material.dispose();}if(object.geometry&&!Array.from(cache.values()).includes(object.geometry))object.geometry.dispose();});
  scene.remove(content);content=new THREE.Group();scene.add(content);
  const quality=state.quality==='light'?'low':'medium';
  // Retain only the selected texture tier; toggling quality must not retain two GPU sets.
  for(const [key,textures] of textureCache)if(!key.endsWith(`-${quality}`)){Object.values(textures).forEach(texture=>texture.dispose());textureCache.delete(key);}
  ports=portDefinitions.map(definition=>definition.type==='mining'?createAsteroids(definition,quality):createPlanet(definition,quality));
  for(const port of ports) content.add(port);
  stars=starField(quality);content.add(stars);
  const sun=makeSun();sun.name='warm-star';content.add(sun);
  ships=[createShipAsset('freighter'),createShipAsset('shuttle')];
  ships.forEach(ship=>{ship.rotation.x=.55;content.add(ship);ship.traverse(child=>{child.castShadow=false;child.receiveShadow=false;});});
  layout();
}
function screenPoint(x,y,z=0) {return new THREE.Vector3((x/width-.5)*(camera.right-camera.left),(.5-y/height)*10,z);}
function createCurve(from,to,bend=25) {
  const midpoint=from.clone().lerp(to,.5);midpoint.y+=bend/height*10;
  return new THREE.QuadraticBezierCurve3(from,midpoint,to);
}
function ribbon(curve,pixelWidth,color,opacity) {
  const n=52,vertices=[],indices=[],half=pixelWidth/height*5;
  for(let i=0;i<=n;i++) {
    const t=i/n,p=curve.getPoint(t),dir=curve.getTangent(t),normal=new THREE.Vector3(-dir.y,dir.x,0).multiplyScalar(half);
    vertices.push(p.x+normal.x,p.y+normal.y,-.45,p.x-normal.x,p.y-normal.y,-.45);
    if(i<n){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);
  return new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));
}
function layout() {
  width=map.clientWidth;height=map.clientHeight;mobile=width<700;
  const aspect=width/height;camera.left=-5*aspect;camera.right=5*aspect;camera.updateProjectionMatrix();
  const starPositions=stars.geometry.attributes.position;for(let i=0;i<starPositions.count;i++)starPositions.setXYZ(i,stars.userData.normalized[i*3]*(camera.right-camera.left),stars.userData.normalized[i*3+1]*10,-3);starPositions.needsUpdate=true;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,state.quality==='light'?1:mobile?1.25:1.5));renderer.setSize(width,height,false);
  stars.material.uniforms.pixelRatio.value=renderer.getPixelRatio();
  const points=mobile?[[.27,.23],[.73,.43],[.29,.58],[.70,.75]]:[[.36,.40],[.71,.36],[.60,.69],[.29,.71]];
  const scale=(mobile?110:145)/(2*portDefinitions[0].radius*height/10);
  ports.forEach((port,index)=>{
    port.position.copy(screenPoint(points[index][0]*width,points[index][1]*height));
    port.scale.setScalar(portDefinitions[index].radius*scale*(portDefinitions[index].type==='mining'?1.05:1));
    const radius=portDefinitions[index].radius*scale/10*height;
    const halfLabel=labels[index].offsetWidth/2;
    labels[index].style.left=`${Math.max(halfLabel+8,Math.min(width-halfLabel-8,points[index][0]*width))}px`;
    labels[index].style.top=`${points[index][1]*height-radius-38}px`;
  });
  const sun=content.getObjectByName('warm-star');sun.position.copy(screenPoint(width*(mobile?.76:.20),height*(mobile?.15:.25),-2));sun.scale.setScalar((mobile?48:66)/(2*.75*height/10));
  if(routes){content.remove(routes);routes.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});}
  routes=new THREE.Group();content.add(routes);
  const edges=[[0,1],[1,2],[2,3],[0,2]];
  edges.forEach(([a,b],index)=>{
    const curve=createCurve(ports[a].position,ports[b].position,index===0?(mobile?17:28):index===3?-25:16);
    const selected=index===0&&state.selected;
    routes.add(ribbon(curve,selected?1.7:.9,selected?'#d9bf91':'#59718c',selected?.83:.31));
    if(index===0)activeCurve=curve;
  });
  const shipScale=22/height*10/7;
  ships[0].scale.setScalar(shipScale);
  ships[1].scale.setScalar(17/height*10/5.0);
  updateShips();render();
}
function updateShips() {
  const t=.48+Math.sin(state.seconds*.12)*.07;
  ships[0].position.copy(activeCurve.getPoint(t));ships[0].position.z=.6;
  const tangent=activeCurve.getTangent(t);ships[0].rotation.z=Math.atan2(tangent.y,tangent.x);
  const curve=createCurve(ports[2].position,ports[3].position,16);
  ships[1].position.copy(curve.getPoint(.51));ships[1].position.z=.5;
  const d=curve.getTangent(.5);ships[1].rotation.z=Math.atan2(d.y,d.x);
}
function render() {
  renderer.render(scene,camera);
  const metrics={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,pixelRatio:renderer.getPixelRatio(),mode:state.quality,width,height};
  window.__starmapStudy={...metrics,animationPaused:state.paused||document.hidden,reducedMotion:motionPreference.matches,scope:'isolated study; two ships; no realtime save',readOnly:true};
  readout.textContent=`${state.quality==='light'?'轻量':'均衡'} · draw calls ${metrics.calls} · 三角形 ${metrics.triangles.toLocaleString()} · 纹理 ${metrics.textures} · DPR ${metrics.pixelRatio}`;
}
function selectPort(index) {
  state.port=index;
  labels.forEach((label,i)=>label.setAttribute('aria-pressed',String(i===index)));render();
}
document.querySelector('#quality').addEventListener('change',event=>{state.quality=event.target.value;resetScene();});
const motionButton=document.querySelector('#motion');
function updateMotionButton(){motionButton.textContent=state.paused?'恢复动画':'暂停动画';motionButton.setAttribute('aria-pressed',String(state.paused));}
motionButton.addEventListener('click',()=>{state.paused=!state.paused;updateMotionButton();if(!state.paused){lastFrame=performance.now();schedule();}render();});
motionPreference.addEventListener('change',event=>{state.paused=event.matches;updateMotionButton();if(!state.paused)schedule();render();});
const viewButton=document.querySelector('#view');
function updateViewButton(){viewButton.setAttribute('aria-pressed',String(state.selected));viewButton.textContent=state.selected?'强调航线':'显示全部航线';}
viewButton.addEventListener('click',()=>{state.selected=!state.selected;updateViewButton();layout();});
document.querySelector('#overview').addEventListener('click',()=>{state.selected=false;updateViewButton();layout();});
const settingsModal=document.querySelector('#settings-modal');
const closeSettings=document.querySelector('#close-demo-settings');
function closeDemoSettings(){settingsModal.classList.add('hidden');settingsModal.inert=true;settingsModal.setAttribute('aria-hidden','true');document.querySelector('#company-tools summary').focus();}
document.querySelector('#demo-settings').addEventListener('click',()=>{document.querySelector('#company-tools').open=false;settingsModal.classList.remove('hidden');settingsModal.inert=false;settingsModal.setAttribute('aria-hidden','false');closeSettings.focus();});
closeSettings.addEventListener('click',closeDemoSettings);
settingsModal.addEventListener('click',event=>{if(event.target===settingsModal)closeDemoSettings();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!settingsModal.inert)closeDemoSettings();});
new ResizeObserver(()=>layout()).observe(map);
const frameInterval=1000/30;
let animationId=0,lastFrame=performance.now();
function schedule(){if(!animationId&&!state.paused&&!document.hidden)animationId=requestAnimationFrame(animate);}
function animate(now){animationId=0;if(state.paused||document.hidden)return;const elapsed=now-lastFrame;if(elapsed>=frameInterval){const remainder=elapsed%frameInterval;state.seconds+=Math.min((elapsed-remainder)/1000,.1);lastFrame=now-remainder;updateShips();render();}schedule();}
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(animationId);animationId=0;}else{lastFrame=performance.now();schedule();render();}});
resetScene();selectPort(0);updateMotionButton();schedule();
