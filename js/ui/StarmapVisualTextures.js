import * as THREE from 'three';

export function random(seed=19){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);

// 球面采样，首尾经线连续。噪声网格只创建一次，地表与云层共享采样。
function noiseField(seed){
  const rng=random(seed),size=32,data=Float32Array.from({length:size**3},rng);
  const at=(x,y,z)=>data[((x&31)*32+(y&31))*32+(z&31)];
  return(x,y,z)=>{
    const a=Math.floor(x),b=Math.floor(y),c=Math.floor(z),u=smooth(x-a),v=smooth(y-b),w=smooth(z-c);
    return mix(mix(mix(at(a,b,c),at(a+1,b,c),u),mix(at(a,b+1,c),at(a+1,b+1,c),u),v),
      mix(mix(at(a,b,c+1),at(a+1,b,c+1),u),mix(at(a,b+1,c+1),at(a+1,b+1,c+1),u),v),w);
  };
}

export function createSurfaceField(quality,seed=19){
  const width=quality==='detail'?1024:quality==='light'?384:768,height=width/2;
  const data=new Uint8Array(width*height*4),noise=noiseField(seed),cloud=noiseField(seed+149);
  for(let y=0;y<height;y++){
    const lat=(y/(height-1)-.5)*Math.PI,sy=Math.sin(lat),c=Math.cos(lat);
    for(let x=0;x<width;x++){
      const lon=x/(width-1)*Math.PI*2,sx=-Math.cos(lon)*c,sz=Math.sin(lon)*c;
      let n=0,d=0,frequency=2.7,amplitude=1;
      for(let i=0;i<5;i++){n+=noise(sx*frequency+17,sy*frequency+17,sz*frequency+17)*amplitude;d+=amplitude;frequency*=2.05;amplitude*=.5;}
      // 主大陆加细碎海岸；云层采用独立风场，避免云与陆地完全重合。
      const continent=noise(sx*1.5+7,sy*1.5+7,sz*1.5+7);
      const terrain=.60*(n/d)+.40*continent;
      const fine=noise(sx*42+13,sy*42+13,sz*42+13);
      const wind=lon+Math.sin(lat*5)*.17;
      const sx2=-Math.cos(wind)*c,sz2=Math.sin(wind)*c;
      const cloudValue=.7*cloud(sx2*5+11,sy*5+11,sz2*5+11)+.3*cloud(sx2*13+8,sy*13+8,sz2*13+8);
      const index=(y*width+x)*4;
      data[index]=Math.round(terrain*255);data[index+1]=Math.round(fine*255);data[index+2]=Math.round(cloudValue*255);data[index+3]=255;
    }
  }
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
  texture.colorSpace=THREE.NoColorSpace;texture.wrapS=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return {texture,width,height,data};
}

export function surfaceHeight(field,normal){
  const u=(Math.atan2(normal.z,-normal.x)/(Math.PI*2)+1)%1,v=Math.asin(normal.y)/Math.PI+.5;
  return field.data[(Math.min(field.height-1,Math.round(v*(field.height-1)))*field.width+Math.round(u*(field.width-1)))*4]/255;
}

export function createNebula(style,quality){
  const canvas=document.createElement('canvas');canvas.width=quality==='light'?384:768;canvas.height=canvas.width/2;
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,rng=random(57),noise=noiseField(57);
  const pixels=ctx.createImageData(w,h),strength=style==='miniature'?.30:style==='illustrated'?.55:1;
  // 静态分形星云一次生成、一张不透明贴图，不叠全屏透明层或后处理。
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=x/w,v=y/h;
    let n=0,a=.57,f=3;
    for(let octave=0;octave<4;octave++){n+=noise(u*f+8,v*f+14,6)*a;f*=2.2;a*=.49;}
    const distance=v-(.42+.14*Math.sin(u*5.1));
    const cloud=Math.max(0,n-.33)*Math.exp(-distance*distance*17)*strength;
    const warm=noise(u*2+1,v*2+1,10),grain=style==='illustrated'?(rng()-.5)*5:0;
    const i=(y*w+x)*4;
    pixels.data[i]=(style==='illustrated'?17:style==='miniature'?5:3)+cloud*(40+warm*31)+grain;
    pixels.data[i+1]=(style==='illustrated'?23:style==='miniature'?15:8)+cloud*46+grain;
    pixels.data[i+2]=(style==='illustrated'?37:style==='miniature'?27:19)+cloud*(82-warm*20)+grain;
    pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;return texture;
}

export function createRockRelief(quality){
  const size=quality==='light'?128:256,data=new Uint8Array(size*size),noise=noiseField(92);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size;
    data[y*size+x]=Math.round((noise(u*8,v*8,4)*.6+noise(u*34,v*34,4)*.4)*255);
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RedFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=true;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  return texture;
}

export function createLightDisc(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
  const glow=ctx.createRadialGradient(64,64,0,64,64,64);
  glow.addColorStop(0,'rgba(255,248,220,1)');glow.addColorStop(.08,'rgba(255,235,176,.95)');glow.addColorStop(.22,'rgba(255,205,127,.35)');glow.addColorStop(1,'rgba(255,180,98,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(canvas);
}

export function createSimpleSpace(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#081423';ctx.fillRect(0,0,512,512);
  const haze=ctx.createRadialGradient(235,240,24,235,240,380);
  haze.addColorStop(0,'rgba(27,46,65,.32)');haze.addColorStop(1,'rgba(2,8,17,.55)');
  ctx.fillStyle=haze;ctx.fillRect(0,0,512,512);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;return texture;
}

const vertex=`varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
  void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);vView=-p.xyz;gl_Position=projectionMatrix*p;}`;

export function createWorldMaterial(field,style,industrial=false){
  return new THREE.ShaderMaterial({
    uniforms:{field:{value:field.texture},longitudeOffset:{value:0},kind:{value:industrial?1:0},style:{value:style==='miniature'?0:style==='cinematic'?1:2},
      sea:{value:new THREE.Color(style==='miniature'?'#328ebb':style==='illustrated'?'#397b89':'#155575')},
      shallow:{value:new THREE.Color('#69bbc0')},land:{value:new THREE.Color(style==='miniature'?'#91b959':style==='illustrated'?'#86a576':'#708b56')},
      mountain:{value:new THREE.Color('#c5bb87')},copper:{value:new THREE.Color(style==='illustrated'?'#cc9d77':'#c57c54')},
      key:{value:new THREE.Vector3(-.65,.72,.85).normalize()},time:{value:0}},
    vertexShader:vertex,
    fragmentShader:`
      uniform sampler2D field;uniform float longitudeOffset;uniform float kind;uniform float style;uniform float time;
      uniform vec3 sea;uniform vec3 shallow;uniform vec3 land;uniform vec3 mountain;uniform vec3 copper;uniform vec3 key;
      varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
      void main(){
        vec4 f=texture2D(field,vUv+vec2(longitudeOffset,0.));float height=f.r;float coast=smoothstep(.455,.495,height);float landMask=smoothstep(.489,.504,height);
        vec3 terrain=mix(land,mountain,smoothstep(.54,.72,height));
        terrain*=.89+f.g*.20;
        vec3 albedo=mix(mix(sea,shallow,coast*.63),terrain,landMask);
        float polar=smoothstep(.90,.99,abs(vUv.y*2.-1.));albedo=mix(albedo,vec3(.75,.86,.84),polar*.85);
        if(kind>.5){albedo=copper*(.70+f.r*.42+f.g*.12);float district=step(.62,f.g)*step(.45,f.r);albedo=mix(albedo,albedo*.55,district*.24);}
        vec3 normal=normalize(vNormal);float diffuse=max(dot(normal,key),0.);
        float ambient=style<.5?.48:style>1.5?.50:.32;
        float lit=ambient+diffuse*(style<.5?.85:.90);
        if(style>1.5){lit=floor(lit*4.+.45)/4.;float brush=sin(vUv.x*520.+sin(vUv.y*190.)*2.)*sin(vUv.y*480.);albedo*=.97+brush*.045;}
        vec3 color=albedo*lit;
        if(style>.5&&style<1.5&&kind<.5){float spec=pow(max(dot(normal,normalize(key+normalize(vView))),0.),58.);color+=vec3(.5,.65,.7)*spec*.48*(1.-landMask);}
        float rim=pow(1.-max(dot(normal,normalize(vView)),0.),4.);if(kind<.5)color+=vec3(.04,.18,.25)*rim*.22;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function createCloudMaterial(field){
  return new THREE.ShaderMaterial({uniforms:{field:{value:field.texture},time:{value:0}},vertexShader:vertex,
    fragmentShader:`uniform sampler2D field;uniform float time;varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
    void main(){float c=texture2D(field,vUv+vec2(time*.0006,0.)).b;float a=smoothstep(.56,.70,c)*.65;
      vec3 tint=vec3(.87,.90,.87)*(.65+max(dot(normalize(vNormal),normalize(vec3(-.65,.72,.85))),0.)*.65);
      gl_FragColor=vec4(tint,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,transparent:true,depthWrite:false});
}

export function createSunMaterial(cinematic=false){
  return new THREE.ShaderMaterial({uniforms:{time:{value:0},cinematic:{value:cinematic?1:0}},vertexShader:vertex,
    fragmentShader:`uniform float time,cinematic;varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
    void main(){float cells=.5+.5*sin(vUv.x*130.+sin(vUv.y*95.)*3.+time*.08)*sin(vUv.y*110.);
    float facing=max(dot(normalize(vNormal),normalize(vView)),0.);vec3 color=mix(vec3(.82,.22,.025),vec3(1.,.80,.39),pow(facing,.6));
    color*=.88+cells*.28;
    if(cinematic>.5){float lava=.5+.5*sin(vUv.x*28.+sin(vUv.y*19.+time*.035)*2.8)*sin(vUv.y*31.+sin(vUv.x*16.)*2.);color=mix(vec3(1.5,.48,.04),vec3(3.1,1.6,.34),lava*.42+facing*.35);color+=vec3(1.2,.75,.12)*pow(1.-facing,6.);}
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});
}
