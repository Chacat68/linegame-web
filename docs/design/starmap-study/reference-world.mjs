import * as THREE from 'three';
import { random,createSurfaceField } from './realtime-textures.mjs';

const vertex=`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main(){
    vUv=uv;vNormal=normalize(normalMatrix*normal);
    vec4 p=modelViewMatrix*vec4(position,1.);vView=-p.xyz;
    gl_Position=projectionMatrix*p;
  }`;

function sizedTexture(image,maxWidth,colorSpace=THREE.NoColorSpace){
  const width=Math.min(image.naturalWidth,maxWidth),canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=Math.round(width*image.naturalHeight/image.naturalWidth);
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=colorSpace;
  texture.wrapS=THREE.RepeatWrapping;texture.anisotropy=2;return texture;
}

function planetMaterial(kind,maps){
  return new THREE.ShaderMaterial({uniforms:{
    day:{value:maps.earth},moon:{value:maps.moon},field:{value:maps.field},water:{value:maps.water},clouds:{value:maps.clouds},
    kind:{value:kind},key:{value:new THREE.Vector3(-.78,.54,.43).normalize()},time:{value:0},
  },vertexShader:vertex,fragmentShader:`
    uniform sampler2D day,moon,field,water,clouds;
    uniform float kind,time;uniform vec3 key;
    varying vec2 vUv;varying vec3 vNormal,vView;
    vec3 reliefNormal(vec3 n,float h,float strength){
      vec3 dx=dFdx(-vView),dy=dFdy(-vView);
      vec3 rx=cross(dy,n),ry=cross(n,dx);float determinant=dot(dx,rx);
      vec2 gradient=vec2(dFdx(h),dFdy(h));
      return normalize(abs(determinant)*n-sign(determinant)*strength*(gradient.x*rx+gradient.y*ry));
    }
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      vec4 f=texture2D(field,vUv);
      float rock=texture2D(moon,vUv+vec2(kind*.119,0.)).r;
      float ocean=texture2D(water,vUv).r;
      vec3 base;float height=rock*.70+f.r*.22+f.g*.08;float metal=0.;
      if(kind<.5){
        base=texture2D(day,vUv).rgb;
        base=mix(base,base*vec3(.50,.77,.92),ocean*.35);
        height=f.g*(1.-ocean)*.25;
      }else if(kind<1.5){
        base=mix(vec3(.075,.061,.048),vec3(.49,.34,.19),pow(rock,.80));
        base*=.82+f.g*.35;
      }else if(kind<2.5){
        float crust=smoothstep(.41,.60,f.r+sin(f.g*17.)*.024);
        base=mix(vec3(.025,.035,.044),vec3(.58,.235,.092),crust);
        base*=.68+rock*.68;metal=.12;
      }else{
        float ice=smoothstep(.46,.67,rock*.72+f.r*.28);
        float fractures=1.-smoothstep(.012,.043,abs(f.r-.50));
        base=mix(vec3(.012,.14,.135),vec3(.66,.78,.76),ice);
        base=mix(base,vec3(.017,.20,.18),fractures*.57);
        height=rock*.65+f.g*.10;metal=.19;
      }
      vec3 n=reliefNormal(normalize(vNormal),height,kind<.5?.003:kind<1.5?.009:.006);
      vec3 view=normalize(vView);float sunlight=dot(n,key);
      float diffuse=max(sunlight,0.);
      float lit=.018+pow(diffuse,.83)*1.55;
      vec3 color=base*lit;
      float spec=pow(max(dot(n,normalize(key+view)),0.),kind<.5?72.:38.);
      color+=vec3(.62,.75,.80)*spec*(kind<.5?ocean*.31:metal);
      if(kind<.5){
        float cloudShadow=texture2D(clouds,vUv+vec2(time*.0007+.004,.003)).r;
        color*=1.-cloudShadow*.15;
      }
      if(kind>1.5&&kind<2.5){
        vec2 grid=vUv*vec2(520.,260.);vec2 cell=floor(grid);
        float lights=step(.83,hash(cell))*step(.52,f.r)*step(.34,1.-f.g);
        vec2 center=fract(grid)-.5;float dotLight=exp(-dot(center,center)*30.);
        float night=1.-smoothstep(-.06,.32,sunlight);
        color+=vec3(2.7,.86,.18)*lights*dotLight*(.35+night)*1.5;
      }
      float rim=pow(1.-max(dot(n,view),0.),4.);
      vec3 rimTint=kind<.5?vec3(.08,.33,.55):kind>2.5?vec3(.08,.30,.29):vec3(.25,.12,.04);
      color+=rimTint*rim*(.08+diffuse*.17);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
}

function atmosphereMaterial(kind){
  return new THREE.ShaderMaterial({uniforms:{
    tint:{value:new THREE.Color(kind===0?'#5ab4fc':kind===3?'#8fd5d7':'#d99558')},
    intensity:{value:kind===1?.35:kind===0?1.6:.9},
    key:{value:new THREE.Vector3(-.78,.54,.43).normalize()},
  },vertexShader:vertex,fragmentShader:`
    uniform vec3 tint,key;uniform float intensity;
    varying vec3 vNormal,vView;
    void main(){
      vec3 n=normalize(vNormal);float rim=pow(1.-abs(dot(n,normalize(vView))),3.8);
      float light=.22+max(dot(n,key),0.)*1.25;
      gl_FragColor=vec4(tint*1.2,rim*light*intensity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
}

function cloudMaterial(map){
  return new THREE.ShaderMaterial({uniforms:{clouds:{value:map},texel:{value:new THREE.Vector2(1/map.image.width,1/map.image.height)},time:{value:0}},vertexShader:vertex,
    fragmentShader:`uniform sampler2D clouds;uniform vec2 texel;uniform float time;varying vec2 vUv;varying vec3 vNormal,vView;
      void main(){
        vec2 uv=vUv+vec2(time*.0007,0.);vec2 stepUV=texel*2.;
        float cloud=texture2D(clouds,uv).r*.4;
        cloud+=(texture2D(clouds,uv+vec2(stepUV.x,0.)).r+texture2D(clouds,uv-vec2(stepUV.x,0.)).r+texture2D(clouds,uv+vec2(0.,stepUV.y)).r+texture2D(clouds,uv-vec2(0.,stepUV.y)).r)*.15;
        cloud=smoothstep(.15,.85,cloud);
        cloud*=1.-smoothstep(.66,.91,abs(vUv.y*2.-1.))*.82;
        float light=.018+max(dot(normalize(vNormal),normalize(vec3(-.78,.54,.43))),0.)*1.6;
        vec3 tint=vec3(.89,.95,1.)*light;
        gl_FragColor=vec4(tint,cloud*.57);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,transparent:true,depthWrite:false});
}

export function createReferencePorts(quality,assets,owner){
  const {keepTexture,keepMaterial,keepGeometry,animated,builder}=owner;
  const light=quality==='light',detail=quality==='detail',rng=random(130);
  const size=light?512:detail?2048:1024;
  const maps={
    earth:keepTexture(sizedTexture(assets.earth,size*2,THREE.SRGBColorSpace)),
    moon:keepTexture(sizedTexture(assets.moon,size)),
    water:keepTexture(sizedTexture(assets.water,size)),
    clouds:keepTexture(sizedTexture(assets.clouds,size)),
    field:keepTexture(createSurfaceField(quality,137).texture),
  };
  const sphere=keepGeometry(new THREE.SphereGeometry(1,light?48:detail?96:72,light?32:detail?64:48));
  const rotating=[];

  function station(parent,kind){
    const b=builder();
    const center=kind===2?new THREE.Vector3(.87,.02,.83):kind===3?new THREE.Vector3(.83,-.13,.77):new THREE.Vector3(.88,-.16,.77);
    const frame=new THREE.Matrix4().compose(center,new THREE.Quaternion().setFromEuler(new THREE.Euler(.94,-.12,-.08)),new THREE.Vector3(1,1,1));
    const radius=kind===3?.27:.30;
    b.add('dark',new THREE.TorusGeometry(radius,.035,6,light?32:64),[0,0,0],[0,0,0],[1,1,1],frame);
    for(const z of [-.025,.04])b.add('brass',new THREE.TorusGeometry(radius+.014,.006,4,light?32:64),[0,0,z],[0,0,0],[1,1,1],frame);
    b.add('roof',new THREE.CylinderGeometry(.12,.16,.14,light?12:20),[0,0,.08],[Math.PI/2,0,0],[1,1,1],frame);
    b.add('dark',new THREE.CylinderGeometry(.09,.13,.065,light?12:20),[0,0,.18],[Math.PI/2,0,0],[1,1,1],frame);
    b.add('brass',new THREE.TorusGeometry(.112,.008,4,32),[0,0,.14],[0,0,0],[1,1,1],frame);
    const spokes=light?6:10;
    for(let i=0;i<spokes;i++){
      const a=i/spokes*Math.PI*2,x=Math.cos(a),y=Math.sin(a);
      b.beam('roof',[x*.10,y*.10,0],[x*radius,y*radius,0],.008,frame);
      b.box('light',[.038,.012,.018],[x*(radius+.02),y*(radius+.02),.063],[0,0,a],frame);
      b.box('window',[.027,.014,.014],[x*.14,y*.14,.166],[0,0,a],frame);
      if(i%2===0){
        b.box('roof',[.075,.034,.055],[x*(radius+.027),y*(radius+.027),.027],[0,0,a],frame);
        b.box('light',[.046,.009,.005],[x*(radius+.029),y*(radius+.029),.055],[0,0,a],frame);
      }
    }
    // 轨道桁架、泊位和散热板向外延伸，建筑保持金属空间站的尺度。
    b.box('dark',[.94,.055,.06],[.06,-.015,-.06],[0,0,0],frame);
    for(const x of [-.52,.50]){
      b.box('roof',[.23,.18,.018],[x,-.04,-.03],[0,0,.12],frame);
      for(let j=0;j<6;j++)b.box('brass',[.003,.16,.008],[x+(j-2.5)*.036,-.04,-.014],[0,0,.12],frame);
    }
    for(let i=0;i<3;i++){
      const x=.17+i*.19;
      b.box('dark',[.14,.085,.052],[x,-.21,.035],[0,0,0],frame);
      b.box('cream',[.135,.013,.054],[x,-.21,.076],[0,0,0],frame);
      b.box('window',[.085,.017,.008],[x,-.21,.093],[0,0,0],frame);
      b.beam('roof',[x,-.18,0],[x,-.085,-.02],.009,frame);
    }
    b.beam('roof',[0,0,.19],[0,0,.56],.012,frame);
    for(let j=0;j<3;j++){
      b.beam('roof',[-.075,0,.27+j*.09],[.075,0,.27+j*.09],.007,frame);
      b.box('light',[.021,.019,.016],[0,0,.31+j*.10],[0,0,0],frame);
    }
    if(kind===1){
      b.beam('roof',[.37,.05,-.01],[.37,.05,.70],.022,frame);
      for(let j=0;j<5;j++){
        b.box('brass',[.12,.010,.016],[.37,.05,.19+j*.10],[0,0,0],frame);
        b.beam('roof',[.31,.05,.17+j*.10],[.43,.05,.27+j*.10],.007,frame);
      }
    }
    if(kind===2){
      b.add('dark',new THREE.TorusGeometry(.62,.015,4,light?32:64,Math.PI*1.4),[-.60,-.035,-.22],[0,0,.20],[1,.64,1],frame);
      for(let i=0;i<7;i++)b.box('light',[.027,.012,.018],[-.60+Math.cos(i*.58)*.62,-.035+Math.sin(i*.58)*.40,-.19],[0,0,i*.58],frame);
      for(let i=0;i<3;i++){
        b.add('dark',new THREE.CylinderGeometry(.035,.050,.28+i*.04,8),[-.22+i*.12,.10,.16],[Math.PI/2,0,0],[1,1,1],frame);
        b.box('light',[.019,.018,.009],[-.22+i*.12,.1,.33+i*.02],[0,0,0],frame);
      }
    }
    b.finish(parent);
    return center.clone().add(new THREE.Vector3(.36,-.025,.35));
  }

  function world(kind){
    const group=new THREE.Group(),spin=new THREE.Group();group.add(spin);
    let geometry=sphere;
    if(kind===1){
      geometry=keepGeometry(sphere.clone());const p=geometry.attributes.position;
      const craters=Array.from({length:light?12:24},()=>({center:new THREE.Vector3((rng()-.5)*2,(rng()-.5)*2,(rng()-.5)*2).normalize(),radius:.065+rng()*.15,depth:.025+rng()*.03}));
      for(const [x,y,z] of [[-.28,.45,.85],[.20,.28,.94],[-.22,-.30,.9],[.52,-.34,.77]])craters.push({center:new THREE.Vector3(x,y,z).normalize(),radius:.19,depth:.062});
      for(let i=0;i<p.count;i++){
        const n=new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)).normalize();
        let height=1+.012*Math.sin(n.x*17+n.z*9)*Math.cos(n.y*21);
        for(const crater of craters){
          const d=n.distanceTo(crater.center)/crater.radius;
          if(d<1.4)height-=crater.depth*Math.exp(-d*d*4.)-crater.depth*.4*Math.exp(-Math.pow((d-.98)*8.,2.));
        }
        p.setXYZ(i,n.x*height,n.y*height,n.z*height);
      }
      geometry.computeVertexNormals();
    }
    const material=keepMaterial(planetMaterial(kind,maps));animated.push(material);
    const body=new THREE.Mesh(geometry,material);spin.add(body);
    spin.rotation.set(kind===0?-.24:0,kind===0?Math.PI+.48:kind*.51,.13);
    rotating.push({group:spin,phase:spin.rotation.y,speed:kind===0?.005:kind===1?.0025:.0035});
    const halo=new THREE.Mesh(sphere,keepMaterial(atmosphereMaterial(kind)));halo.scale.setScalar(kind===0?1.036:1.019);spin.add(halo);
    if(kind===0){
      const clouds=keepMaterial(cloudMaterial(maps.clouds));animated.push(clouds);
      const shell=new THREE.Mesh(sphere,clouds);shell.scale.setScalar(1.010);spin.add(shell);
    }
    if(kind===1||kind===3){
      const b=builder(),seed=random(kind===1?620:690);
      for(let i=0;i<(light?8:17);i++){
        const angle=i*2.399,r=1.13+seed()*.52,size=.035+seed()*.085;
        b.add(kind===1?(i%2?'rockDark':'rock'):(i%3?'jade':'jadeLight'),new THREE.IcosahedronGeometry(1,1),
          [Math.cos(angle)*r,Math.sin(angle)*r*.78,(seed()-.5)*1.1],[seed(),seed(),seed()],[size,size*.83,size*.92]);
      }
      b.finish(group);
    }
    const dock=station(group,kind);
    return{group,body,dock,radius:kind===0?1:kind===1?.81:kind===2?.96:.87};
  }
  const ports=[0,1,2,3].map(world);
  const sky=keepTexture(sizedTexture(assets.sky,light?1024:detail?2048:1536,THREE.SRGBColorSpace));
  sky.generateMipmaps=false;sky.minFilter=THREE.LinearFilter;
  return{ports,rotating,sky,skyAspect:assets.sky.naturalWidth/assets.sky.naturalHeight};
}
