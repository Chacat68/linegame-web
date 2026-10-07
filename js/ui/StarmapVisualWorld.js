import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createPlanetAtmosphere } from './PlanetAtmosphere.js';
import { createStarmapFleet } from './StarmapFleet.js';
import { random,createSurfaceField,surfaceHeight,createWorldMaterial,createCloudMaterial,createNebula,createSimpleSpace,createLightDisc,createSunMaterial } from './StarmapVisualTextures.js';

const Z=new THREE.Vector3(0,0,1),Y=new THREE.Vector3(0,1,0);
const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion();

// 每个版本拥有自己的资源集合；同型船只共享原型，不按船数重复建模。
export function createWorld(style,quality,options={}){
  const opened=new Set(options.portIds||['sol_prime','mineral_belt','nebula_forge','aurora_depot']);
  const surfaceOnly=new Set(options.surfaceOnlyPorts||[]);
  const root=new THREE.Group(),materials=new Set(),textures=new Set(),geometries=new Set(),animated=[];
  root.name='merchant-low-poly-world';
  const detail=quality==='detail',light=quality==='light',paint=style==='illustrated',lowPoly=style==='cinematic';
  const keepMaterial=m=>{materials.add(m);return m;};
  const keepTexture=t=>{textures.add(t);return t;};
  const keepGeometry=g=>{geometries.add(g);return g;};
  const palette=new Map();
  const colors={cream:'#e6dac0',roof:'#b6b7ae',dark:'#344553',brass:'#c49c53',orange:'#bc7844',
    window:'#90cbd0',light:'#ffe5a5',cloud:'#f5f1df',leaf:'#638751',field:'#a6b66b',furrow:'#707c48',
    rock:'#b39575',rockDark:'#817665',jade:'#83bfb6',jadeLight:'#b0d7c6'};
  if(style==='miniature')Object.assign(colors,{cream:'#f1dfc2',roof:'#83b5b1',rock:'#b9a18b',rockDark:'#978878',jade:'#82c5ba',brass:'#dfb260'});
  if(lowPoly)Object.assign(colors,{cream:'#e9dfc6',roof:'#5e798b',dark:'#334250',brass:'#e5ad4c',light:'#ffdb8c',window:'#8cd4dc',rock:'#aa8050',rockDark:'#796244',jade:'#72b7a8',jadeLight:'#b9dac4',amber:'#edb24f',amberLight:'#f6d27e',field:'#a7bd66',leaf:'#598147'});
  if(paint)Object.assign(colors,{cream:'#e8d3aa',rock:'#c9a477',jade:'#8fbbaf',roof:'#96a9a2'});
  const steps=keepTexture(new THREE.DataTexture(new Uint8Array([86,148,204,255]),4,1,THREE.RedFormat));
  steps.minFilter=steps.magFilter=THREE.NearestFilter;steps.needsUpdate=true;
  function material(key){
    if(palette.has(key))return palette.get(key);
    const options={color:colors[key],roughness:lowPoly?.62:.72,metalness:['brass','dark','roof','cream'].includes(key)?(lowPoly?.30:.28):.05,flatShading:lowPoly};
    if(key==='light'){options.emissive=colors.light;options.emissiveIntensity=style==='cinematic'?1.6:.65;}
    if(key==='window'){options.emissive='#5b9fa5';options.emissiveIntensity=.16;options.roughness=.2;}
    if(lowPoly&&['jade','jadeLight','amber','amberLight'].includes(key)){options.roughness=.34;options.metalness=.14;}
    if(paint){delete options.roughness;delete options.metalness;delete options.flatShading;}
    const m=keepMaterial(style==='cinematic'&&key==='light'?new THREE.MeshBasicMaterial({color:colors.light,toneMapped:false}):paint?new THREE.MeshToonMaterial({...options,gradientMap:steps}):new THREE.MeshStandardMaterial(options));
    if(paint){
      // 物体空间的交叉笔触随模型移动；不依赖屏幕全屏滤镜。
      m.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 vStrokePosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvStrokePosition=position;');
        shader.fragmentShader='varying vec3 vStrokePosition;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float stroke=sin(vStrokePosition.x*194.+vStrokePosition.y*27.+sin(vStrokePosition.z*55.)*2.);
          float crossStroke=sin(vStrokePosition.y*153.-vStrokePosition.z*71.);
          diffuseColor.rgb*=.96+stroke*.045+crossStroke*.025;`);
      };
      m.customProgramCacheKey=()=> 'illustrated-strokes-v1';
    }
    m.name=`${style}-${key}`;palette.set(key,m);return m;
  }
  const outline=keepMaterial(new THREE.MeshBasicMaterial({color:'#263942',side:THREE.BackSide,transparent:true,opacity:.72}));
  const presentation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.58,-.40,0)),inversePresentation=presentation.clone().invert();

  // 港口静态部件按材质合并；增加建筑细节不会按零件数量增加 draw calls。
  function builder(){
    const parts=new Map();
    function add(key,geometry,pos=[0,0,0],rotation=[0,0,0],scale=[1,1,1],frame=null){
      quaternion.setFromEuler(new THREE.Euler(...rotation));matrix.compose(new THREE.Vector3(...pos),quaternion,new THREE.Vector3(...scale));
      if(frame)matrix.premultiply(frame);
      geometry.applyMatrix4(matrix);
      const copy=geometry.index?geometry.toNonIndexed():geometry; if(copy!==geometry)geometry.dispose();
      if(!parts.has(key))parts.set(key,[]);parts.get(key).push(copy);
    }
    function box(key,size,pos,rotation=[0,0,0],frame=null,rounded=false){
      add(key,rounded&&style==='miniature'?new RoundedBoxGeometry(...size,1,Math.min(...size)*.14):new THREE.BoxGeometry(...size),pos,rotation,[1,1,1],frame);
    }
    function beam(key,from,to,radius=.018,frame=null){
      const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),d=b.clone().sub(a),q=new THREE.Quaternion().setFromUnitVectors(Y,d.clone().normalize());
      const transform=new THREE.Matrix4().compose(a.add(b).multiplyScalar(.5),q,new THREE.Vector3(1,1,1));
      if(frame)transform.premultiply(frame);
      const g=new THREE.CylinderGeometry(radius,radius,d.length(),light?5:8).applyMatrix4(transform);
      add(key,g);
    }
    function finish(parent){
      for(const [key,list] of parts){
        const geometry=keepGeometry(mergeGeometries(list));list.forEach(g=>g.dispose());
        const mesh=new THREE.Mesh(geometry,material(key));parent.add(mesh);
        if(paint&&['cream','roof','rock','jade'].includes(key)){
          const edge=new THREE.Mesh(geometry,outline);edge.scale.setScalar(1.009);parent.add(edge);
        }
      }
    }
    return{add,box,beam,finish};
  }
  function normalAt(x,y){return new THREE.Vector3(x,y,Math.sqrt(Math.max(.01,1-x*x-y*y))).normalize();}
  function sphereFrame(normal,radius=1.006){return new THREE.Matrix4().compose(normal.clone().multiplyScalar(radius),new THREE.Quaternion().setFromUnitVectors(Y,normal),new THREE.Vector3(1,1,1));}
  // 先在展示视角中选上半球，再转换到模型坐标，建筑沿表面法线向外生长。
  function topSurfaceFrame(x,y,radius,scale=1){
    return sphereFrame(normalAt(x,y).applyQuaternion(inversePresentation),radius).scale(new THREE.Vector3(scale,scale,scale));
  }
  function crystalGeometry(radius,height){
    return new THREE.LatheGeometry([
      new THREE.Vector2(0,-height*.5),new THREE.Vector2(radius*.78,-height*.33),
      new THREE.Vector2(radius,height*.05),new THREE.Vector2(radius*.70,height*.30),new THREE.Vector2(0,height*.5),
    ],5);
  }

  function warehouse(b,frame=null,offset=[0,0,0],scale=1){
    const [x,y,z]=offset,s=scale;
    b.box('cream',[.44*s,.22*s,.34*s],[x,y+.11*s,z],[0,0,0],frame,true);
    b.box('roof',[.47*s,.035*s,.38*s],[x,y+.238*s,z],[0,0,0],frame,true);
    for(let i=0;i<4;i++)b.box('brass',[.018*s,.018*s,.38*s],[x+(i-1.5)*.11*s,y+.265*s,z],[0,0,0],frame);
    b.box('window',[.14*s,.08*s,.008*s],[x,y+.15*s,z+.175*s],[0,0,0],frame);
    b.box('dark',[.105*s,.14*s,.010*s],[x+.135*s,y+.073*s,z+.176*s],[0,0,0],frame);
    b.box('light',[.045*s,.025*s,.014*s],[x-.19*s,y+.18*s,z+.181*s],[0,0,0],frame);
  }
  function crane(b,frame=null,x=0,y=0,z=0,size=1){
    const s=size;
    for(const dz of [-.08,.08]){
      b.beam('brass',[x-.045*s,y,z+dz*s],[x-.045*s,y+.45*s,z+dz*s],.016*s,frame);
      b.beam('brass',[x+.045*s,y,z+dz*s],[x+.045*s,y+.45*s,z+dz*s],.016*s,frame);
      b.beam('dark',[x-.045*s,y,z+dz*s],[x+.045*s,y+.42*s,z+dz*s],.009*s,frame);
    }
    b.beam('brass',[x-.12*s,y+.44*s,z],[x+.46*s,y+.44*s,z],.025*s,frame);
    b.beam('dark',[x,y+.61*s,z],[x+.43*s,y+.45*s,z],.01*s,frame);
    b.beam('dark',[x+.43*s,y+.44*s,z],[x+.43*s,y+.18*s,z],.008*s,frame);
    b.box('orange',[.07*s,.10*s,.07*s],[x+.43*s,y+.13*s,z],[0,0,0],frame);
    b.box('cream',[.10*s,.09*s,.12*s],[x-.05*s,y+.46*s,z],[0,0,0],frame);
  }
  function station(b,center=[.91,-.30,.75],size=.85,surface=null){
    const frame=new THREE.Matrix4().compose(new THREE.Vector3(...center),new THREE.Quaternion().setFromEuler(new THREE.Euler(lowPoly?-Math.PI/2:.75,.05,-.10)),new THREE.Vector3(size,size,size));
    if(surface)frame.premultiply(surface);
    b.add('brass',new THREE.TorusGeometry(.30,.035,light?4:6,light?24:48),[0,0,0],[0,0,0],[1,1,1],frame);
    b.add('dark',new THREE.TorusGeometry(.24,.018,4,light?24:48),[0,0,-.018],[0,0,0],[1,1,1],frame);
    b.box('cream',[.42,.10,.10],[0,0,.02],[0,0,0],frame,true);
    b.box('cream',[.10,.43,.07],[0,0,.035],[0,0,0],frame,true);
    b.add('roof',new THREE.CylinderGeometry(.085,.11,.21,12),[0,0,.11],[Math.PI/2,0,0],[1,1,1],frame);
    b.box('window',[.12,.07,.01],[0,.02,.235],[0,0,0],frame);
    for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
      b.box('cream',[.12,.10,.09],[Math.cos(a)*.30,Math.sin(a)*.30,.02],[0,0,a],frame,true);
      b.box('light',[.045,.025,.03],[Math.cos(a)*.35,Math.sin(a)*.35,.075],[0,0,a],frame);
    }
    b.box('dark',[.48,.06,.07],[-.50,-.04,-.04],[0,0,-.2],frame);
    if(lowPoly){
      b.add('cream',new THREE.CylinderGeometry(.11,.14,.24,12),[.13,.08,.24],[Math.PI/2,0,0],[1,1,1],frame);
      b.add('brass',new THREE.ConeGeometry(.12,.09,8),[.13,.08,.41],[Math.PI/2,0,0],[1,1,1],frame);
      b.box('window',[.13,.025,.05],[.13,.18,.27],[0,0,0],frame);
      b.add('cream',new THREE.CylinderGeometry(.055,.065,.42,8),[-.12,-.02,.29],[Math.PI/2,0,0],[1,1,1],frame);
      b.add('brass',new THREE.ConeGeometry(.075,.09,8),[-.12,-.02,.54],[Math.PI/2,0,0],[1,1,1],frame);
      b.box('light',[.032,.025,.025],[-.12,-.02,.59],[0,0,0],frame);
      b.box('cream',[.47,.04,.19],[.34,-.28,.03],[0,0,0],frame);
      for(let i=0;i<5;i++)b.box('light',[.025,.025,.016],[.12+i*.11,-.38,.055],[0,0,0],frame);
    }
    return frame;
  }
  // 低多边形地表只需小型色场，不加载上一版的写实贴图和星云图。
  const fieldQuality=lowPoly?(detail?'balanced':'light'):quality;
  const earthField=opened.has('sol_prime')?createSurfaceField(fieldQuality,19):null,copperField=opened.has('nebula_forge')?createSurfaceField(fieldQuality,107):null;
  if(earthField)keepTexture(earthField.texture);if(copperField)keepTexture(copperField.texture);
  const sphere=keepGeometry(lowPoly?new THREE.IcosahedronGeometry(1,light?3:detail?7:5):new THREE.SphereGeometry(1,light?32:detail?96:64,light?24:detail?64:48));
  const ports=[];
  function makePlanet(industrial){
    const group=new THREE.Group(),body=keepMaterial(createWorldMaterial(industrial?copperField:earthField,lowPoly?'miniature':style,industrial));
    if(lowPoly){
      // Icosahedron 的经线原点不同于 SphereGeometry，色场与农田采样需保持一致。
      body.uniforms.longitudeOffset.value=.5;
      body.uniforms.sea.value.set('#2476a0');body.uniforms.shallow.value.set('#54b6b9');
      body.uniforms.land.value.set('#65953c');body.uniforms.mountain.value.set('#a7b95a');
      body.uniforms.copper.value.set('#ca7541');
    }
    let ground=sphere;
    if(lowPoly){
      ground=keepGeometry(sphere.clone());const p=ground.attributes.position,n=new THREE.Vector3();
      for(let i=0;i<p.count;i++){
        n.fromBufferAttribute(p,i).normalize();
        const rise=industrial?.020*Math.sin(n.x*14+n.z*7)*Math.cos(n.y*11):Math.max(0,surfaceHeight(earthField,n)-.49)*.34;
        p.setXYZ(i,n.x*(1+rise),n.y*(1+rise),n.z*(1+rise));
      }
      ground.computeVertexNormals();
    }
    const globe=new THREE.Mesh(ground,body);group.add(globe);animated.push(body);
    const atmosphere=keepMaterial(createPlanetAtmosphere(industrial?'#d79e71':'#72bcd0'));
    const halo=new THREE.Mesh(sphere,atmosphere);halo.scale.setScalar(1.024);group.add(halo);
    if(paint){const edge=new THREE.Mesh(sphere,outline);edge.scale.setScalar(1.012);group.add(edge);}
    if(surfaceOnly.has(industrial?'nebula_forge':'sol_prime')){
      group.rotation.set(.06,0,-.07);
      return{group,body:globe,dock:new THREE.Vector3(0,0,1),radius:industrial?.94:1};
    }
    const b=builder(),dock=new THREE.Vector3(.97,-.23,.85);
    if(!industrial){
      if(style==='miniature'||lowPoly){
        const rng=random(14);
        for(let i=0;i<(light?5:11);i++){
          const sites=[[-.46,.65],[.67,.46],[-.77,.24],[-.61,-.35],[.42,-.60]];
          const n=lowPoly?normalAt(...sites[i%sites.length]).applyQuaternion(inversePresentation):normalAt((rng()-.5)*1.3,(rng()-.5)*1.25),frame=sphereFrame(n,1.018);
          if(lowPoly&&i>=sites.length)continue;
          for(let j=0;j<3;j++)b.add('cloud',lowPoly?new THREE.IcosahedronGeometry(1,2):new THREE.SphereGeometry(1,light?8:12,light?6:8),[(j-1)*.070,.06+(j===1?.04:0),j===1?-.01:.025],[0,0,0],[j===1?.13:.10,j===1?.095:.06,.085],frame);
        }
      }else{
        const cloudMat=keepMaterial(createCloudMaterial(earthField));animated.push(cloudMat);
        const cloud=new THREE.Mesh(sphere,cloudMat);cloud.scale.setScalar(1.021);group.add(cloud);
      }
      // 农田只放在大陆上；分组的田垄、树冠与房舍仍按材质合并。
      const rng=random(70);let farms=0;
      for(let i=0;i<(lowPoly?150:80)&&farms<(lowPoly?(light?6:14):(light?4:10));i++){
        const n=normalAt((rng()-.5)*1.25,(rng()-.5)*1.1);
        if(lowPoly)n.applyQuaternion(inversePresentation);
        if(surfaceHeight(earthField,n)<.515)continue;
        const frame=sphereFrame(n,1.015);
        b.box(farms%2?'field':'leaf',[.16,.009,.13],[0,0,0],[0,farms*.3,0],frame);
        for(let j=0;j<4;j++)b.box('furrow',[.145,.010,.006],[0,.01,(j-1.5)*.028],[0,farms*.3,0],frame);
        if(farms<3)warehouse(b,frame,[.05,.015,-.10],.36);
        if(style==='miniature'||lowPoly)for(let j=0;j<(lowPoly?3:2);j++){
          b.add('leaf',new THREE.ConeGeometry(lowPoly?.040:.024,lowPoly?.12:.075,6),[-.11+j*.054,lowPoly?.065:.034,.055],[0,0,0],[1,1,1],frame);
        }
        farms++;
      }
      if(lowPoly){
        const portFrame=station(b,[0,0,0],1,topSurfaceFrame(.06,.84,1.025));
        dock.set(.55,-.28,.065).applyMatrix4(portFrame);
      }else station(b);
    }else{
      const normals=[[.02,.64],[.42,.39],[-.40,.30],[-.22,-.14],[.37,-.25]];
      normals.slice(0,light?3:5).forEach(([x,y],index)=>{
        const frame=sphereFrame(normalAt(x,y),1.025);
        b.box('dark',[.42,.035,.36],[0,0,0],[0,0,0],frame,true);
        warehouse(b,frame,[-.085,.025,.03],.55);
        b.add('roof',new THREE.CylinderGeometry(.065,.065,.24,light?8:12),[.135,.13,-.04],[0,0,0],[1,1,1],frame);
        b.add('cream',new THREE.SphereGeometry(.065,10,6),[.135,.25,-.04],[0,0,0],[1,.30,1],frame);
        b.add('dark',new THREE.CylinderGeometry(.024,.034,.32,8),[-.08,.26,-.115],[0,0,0],[1,1,1],frame);
        b.add('brass',new THREE.TorusGeometry(.028,.008,4,12),[-.08,.40,-.115],[Math.PI/2,0,0],[1,1,1],frame);
        for(let j=0;j<4;j++)b.box('light',[.021,.018,.007],[-.17+j*.045,.11,.13],[0,0,0],frame);
        b.beam('brass',[-.22,.12,-.17],[.24,.12,-.17],.012,frame);
        if(index===0)crane(b,frame,.18,.02,.11,.45);
      });
      if(lowPoly){
        const portFrame=station(b,[0,0,0],.90,topSurfaceFrame(.32,.84,1.025));
        dock.set(.55,-.28,.065).applyMatrix4(portFrame);
      }else station(b,[.95,-.24,.66],.95);
      if(lowPoly){
        const factory=topSurfaceFrame(-.20,.84,1.025,.72);
        b.box('dark',[.78,.06,.50],[0,.02,0],[0,0,0],factory);
        warehouse(b,factory,[-.10,.05,.08],.85);
        for(const [i,x,z,h] of [[0,-.24,-.12,.60],[1,.03,-.15,.91],[2,.25,-.10,.72]]){
          b.add('cream',new THREE.CylinderGeometry(.055,.078,.19,8),[x,.17,z],[0,0,0],[1,1,1],factory);
          b.add('dark',new THREE.CylinderGeometry(.026,.038,h,8),[x,.22+h/2,z],[0,0,0],[1,1,1],factory);
          b.add('brass',new THREE.TorusGeometry(.031,.008,4,10),[x,.20+h,z],[Math.PI/2,0,0],[1,1,1],factory);
          b.box('light',[.018,.045,.024],[x,.24+h*.65,z+.038],[0,0,0],factory);
          if(i===0)b.beam('brass',[x-.13,.22,z],[x+.08,.22+h,z],.009,factory);
        }
        crane(b,factory,.28,.02,.16,.58);
      }
    }
    b.finish(group);group.rotation.set(.06,0,-.07);return {group,body:globe,dock,radius:industrial?.94:1};
  }
  function makeMine(){
    const group=new THREE.Group(),b=builder(),rng=random(34);
    const rock=new THREE.IcosahedronGeometry(1,light?1:2);
    const p=rock.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),warp=1+.065*Math.sin(x*12+y*9+z*5)+.035*Math.cos(z*18-y*13);
      p.setXYZ(i,x*warp*1.08,y*warp*.90,z*warp*.78);
    }
    rock.computeVertexNormals();b.add('rock',rock);
    if(lowPoly){
      for(const [i,x,y,z,h] of [[0,-.65,.15,.58,1.05],[1,.60,.08,.40,.88],[2,-.26,-.27,.83,.95],[3,.18,-.40,.70,.80],[4,-.45,.62,.16,.77],[5,.70,-.24,-.01,.70]]){
        b.add(i%2?'amberLight':'amber',crystalGeometry(.32,h),[x,y,z],[.15,0,(i-2)*.19],[1,1,1]);
      }
    }
    for(let i=0;i<(light?4:9);i++){
      const a=i*2.399,r=1.15+rng()*.25,s=.09+rng()*.14;
      b.add(i%2?'rockDark':'rock',new THREE.DodecahedronGeometry(1),[Math.cos(a)*r,Math.sin(a)*r*.60,.1-rng()*.4],[rng(),rng(),rng()],[s,s*.8,s]);
    }
    if(surfaceOnly.has('mineral_belt')){b.finish(group);return{group,dock:new THREE.Vector3(0,0,1),radius:lowPoly?.88:.93};}
    const f=lowPoly?topSurfaceFrame(.08,.84,.94,.82):new THREE.Matrix4().makeTranslation(.42,.19,.72);
    b.box('dark',[.79,.055,.57],[0,0,0],[0,0,0],f,true);
    warehouse(b,f,[-.15,.03,.01],.60);
    // 钻塔的梁、斜撑和钻头构成独特轮廓。
    for(const x of [.13,.38])for(const z of [-.18,.07]){
      b.beam('brass',[x,.02,z],[x*.75+.04,.91,z*.55],.025,f);
      for(let j=0;j<3;j++)b.beam('dark',[x,.05+j*.26,z],[x===.13?.38:.13,.28+j*.26,z],.012,f);
    }
    for(const y of [.30,.57,.87])b.box('dark',[.28,.03,.24],[.24,y,-.055],[0,0,0],f);
    b.add('brass',new THREE.CylinderGeometry(.018,.055,.70,8),[.24,.40,-.04],[0,0,0],[1,1,1],f);
    b.box('light',[.095,.06,.08],[.22,.97,-.08],[0,0,0],f);
    crane(b,f,.31,.03,.25,.65);
    b.box('cream',[.56,.045,.18],[.50,-.05,.19],[0,0,-.12],f,true);
    for(let i=0;i<4;i++)b.box('light',[.025,.015,.025],[.25+i*.14,-.02,.27],[0,0,0],f);
    const dock=lowPoly?new THREE.Vector3(.76,-.025,.27).applyMatrix4(f):new THREE.Vector3(1.10,.08,.84);
    b.finish(group);group.rotation.set(.10,-.20,.08);return{group,dock,radius:lowPoly?.88:.93};
  }
  function makeDepot(){
    const group=new THREE.Group(),b=builder(),rng=random(83);
    b.add('jade',new THREE.DodecahedronGeometry(.70,1),[0,-.20,0],[.12,.1,.15],[1.35,.75,1]);
    for(let i=0;i<(light?7:13);i++){
      const a=i*2.399,r=i===0?0:.35+rng()*.58,height=.75+rng()*.82;
      const radius=(lowPoly?.25:.18)+rng()*.14;
      b.add(i%3?'jade':'jadeLight',lowPoly?crystalGeometry(radius,height):new THREE.CylinderGeometry(0,radius,height,5,1),
        [Math.cos(a)*r,-.14+height*.22,Math.sin(a)*r*.58],[.15+rng()*.2,0,(rng()-.5)*.60],[1,1,1]);
    }
    for(let i=0;i<4;i++)b.add('jadeLight',new THREE.DodecahedronGeometry(.12),[(i-1.5)*.65,-.48+(i%2)*.19,.12],[i*.4,.5,.3]);
    if(surfaceOnly.has('aurora_depot')){b.finish(group);return{group,dock:new THREE.Vector3(0,0,1),radius:.83};}
    const f=lowPoly?topSurfaceFrame(.08,.84,1.02,.86):new THREE.Matrix4().compose(new THREE.Vector3(0,-.30,.70),new THREE.Quaternion().setFromEuler(new THREE.Euler(.18,0,-.07)),new THREE.Vector3(1,1,1));
    b.box('dark',[1.20,.07,.69],[0,0,0],[0,0,0],f,true);
    warehouse(b,f,[-.26,.035,-.07],.90);warehouse(b,f,[.25,.035,-.09],.76);
    b.box('cream',[.73,.025,.23],[.49,-.015,.26],[0,0,0],f,true);
    for(let i=0;i<4;i++){
      b.box(i%2?'jade':'orange',[.105,.10,.10],[-.42+i*.18,.08,.24],[0,0,0],f,true);
      b.box('light',[.028,.015,.018],[-.49+i*.31,.06,.37],[0,0,0],f);
    }
    crane(b,f,.42,.04,.02,.57);b.finish(group);group.rotation.set(.03,-.1,-.04);
    return{group,dock:lowPoly?new THREE.Vector3(.83,.015,.26).applyMatrix4(f):new THREE.Vector3(.83,-.27,.91),radius:.83};
  }
  for(const [id,make] of [['sol_prime',()=>makePlanet(false)],['mineral_belt',makeMine],['nebula_forge',()=>makePlanet(true)],['aurora_depot',makeDepot]]){
    if(!opened.has(id))continue;const port=make();port.id=id;port.group.name='system_'+id;ports.push(port);
  }
  ports.forEach(port=>{if(lowPoly)port.group.rotation.set(.58,-.40,0);root.add(port.group);});

  const sun=new THREE.Group(),sunMaterial=keepMaterial(createSunMaterial(style==='cinematic'));animated.push(sunMaterial);
  sun.name='merchant-sun';
  const sunGeometry=keepGeometry(lowPoly?new THREE.IcosahedronGeometry(.42,2):new THREE.SphereGeometry(.42,light?24:48,light?16:32));
  if(lowPoly)sunGeometry.computeVertexNormals();
  sun.add(new THREE.Mesh(sunGeometry,sunMaterial));
  const lightDisc=keepTexture(createLightDisc());
  const sunGlow=new THREE.Sprite(keepMaterial(new THREE.SpriteMaterial({map:lightDisc,color:'#ffbf69',blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:style==='cinematic'?.95:style==='miniature'?.46:.65,toneMapped:false})));
  sunGlow.scale.setScalar(style==='cinematic'?3.5:2.5);sunGlow.position.z=-.1;sun.add(sunGlow);root.add(sun);

  const background=new THREE.Mesh(keepGeometry(new THREE.PlaneGeometry(1,1)),keepMaterial(new THREE.MeshBasicMaterial({map:keepTexture(lowPoly?createSimpleSpace():createNebula(style,quality)),depthWrite:false,toneMapped:!lowPoly})));
  background.userData.aspect=0;
  background.position.z=-8;background.renderOrder=-10;root.add(background);
  const count=lowPoly?(light?80:detail?180:120):(light?220:detail?1000:600),rng=random(111),positions=[],sizes=[],starColors=[];
  for(let i=0;i<count;i++){
    positions.push(rng()-.5,rng()-.5,-6-rng());sizes.push(lowPoly?(i%31===0?3.5:1.0+rng()*.9):(i%61===0?2.8:i%13===0?1.6:.55+rng()*.65));
    const color=new THREE.Color(i%11===0?'#dcc199':'#b3c6dc').multiplyScalar(lowPoly?.68+rng()*.50:.25+rng()*.55);starColors.push(color.r,color.g,color.b);
  }
  const starGeo=keepGeometry(new THREE.BufferGeometry());starGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));starGeo.setAttribute('size',new THREE.Float32BufferAttribute(sizes,1));starGeo.setAttribute('color',new THREE.Float32BufferAttribute(starColors,3));
  const starMaterial=keepMaterial(new THREE.ShaderMaterial({uniforms:{pixelRatio:{value:1}},vertexColors:true,
    vertexShader:'attribute float size;uniform float pixelRatio;varying vec3 tint;void main(){tint=color;gl_PointSize=size*pixelRatio;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 tint;void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(tint,a);#include <colorspace_fragment>}`.replace('#include','\n#include'),
    transparent:true,depthWrite:false}));
  const stars=new THREE.Points(starGeo,starMaterial);stars.userData.normalized=positions;root.add(stars);
  let routeMarkers=null;
  if(lowPoly&&options.routeMarkers!==false){
    const g=keepGeometry(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(30),3));
    const m=keepMaterial(new THREE.ShaderMaterial({uniforms:{pixelRatio:{value:1}},vertexShader:'uniform float pixelRatio;void main(){gl_PointSize=12.*pixelRatio;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`void main(){float r=length(gl_PointCoord-.5);float core=1.-smoothstep(.10,.22,r);float alpha=(core*.85+exp(-r*r*24.)*.5)*(1.-smoothstep(.42,.50,r));gl_FragColor=vec4(mix(vec3(1.,.51,.09),vec3(1.,.92,.62),core),alpha);}`,transparent:true,depthWrite:false}));
    routeMarkers=new THREE.Points(g,m);routeMarkers.frustumCulled=false;root.add(routeMarkers);
  }

  const fleet=createStarmapFleet({style,shipTypes:options.shipTypes||['freighter','shuttle'],capacity:options.shipCapacity||12});
  root.add(fleet.root);const {shipSets,engines}=fleet;

  const selection=new THREE.Group(),selectionMat=keepMaterial(new THREE.MeshBasicMaterial({color:'#e7c899',transparent:true,opacity:.6,depthWrite:false}));
  const arc=keepGeometry(new THREE.TorusGeometry(1.23,.008,4,64,Math.PI*.28));
  for(const rotation of [.35,3.5]){const mesh=new THREE.Mesh(arc,selectionMat);mesh.rotation.z=rotation;selection.add(mesh);}
  selection.position.z=1.8;root.add(selection);
  return{
    root,ports,sun,background,stars,starMaterial,shipSets,engines,routeMarkers,selection,animated,rotating:[],
    dispose(){root.removeFromParent();fleet.dispose();root.traverse(object=>{if(object.isInstancedMesh)object.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());},
  };
}
