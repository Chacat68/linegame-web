// 同型舰体共享几何和材质；容量独立于航次阶段，返航不会重复创建模型。
import * as THREE from 'three';
import { createShipAsset } from './ShipModelFactory.js';

export function createStarmapFleet({ style='cinematic', shipTypes=['freighter','shuttle'], capacity=12 }={}) {
  const root=new THREE.Group(),geometries=new Set(),materials=new Set(),textures=new Set();
  root.name='merchant-flight-fleet';
  const keepMaterial=m=>{materials.add(m);return m;};
  const paint=style==='illustrated',lowPoly=style==='cinematic';
  let steps=null;
  if(paint){
    steps=new THREE.DataTexture(new Uint8Array([86,148,204,255]),4,1,THREE.RedFormat);
    steps.minFilter=steps.magFilter=THREE.NearestFilter;steps.needsUpdate=true;textures.add(steps);
  }
  const shipSets=shipTypes.map(type=>{
    const prototype=createShipAsset(type),meshes=[];
    const size=new THREE.Box3().setFromObject(prototype).getSize(new THREE.Vector3());
    prototype.traverse(object=>{
      if(!object.isMesh)return;
      geometries.add(object.geometry);keepMaterial(object.material);
      if(lowPoly)object.material.flatShading=true;
      if(paint)object.material=keepMaterial(new THREE.MeshToonMaterial({color:object.material.color,emissive:object.material.emissive||'#000000',gradientMap:steps}));
      const mesh=new THREE.InstancedMesh(object.geometry,object.material,capacity);
      mesh.name=object.name;
      mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(mesh);meshes.push(mesh);
    });
    return{type,meshes,length:type==='freighter'?7.6:type==='shuttle'?5:size.x};
  });
  const engineGeo=new THREE.PlaneGeometry(1,1);geometries.add(engineGeo);
  const engines=new THREE.InstancedMesh(engineGeo,keepMaterial(new THREE.ShaderMaterial({
    uniforms:{tint:{value:new THREE.Color(lowPoly?'#ffca75':style==='miniature'?'#ffe1a0':'#a6dcf2')},cinematic:{value:lowPoly?1:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 tint;uniform float cinematic;varying vec2 vUv;void main(){float width=exp(-pow((vUv.y-.5)*4.,2.));if(cinematic>.5)width=exp(-pow((vUv.y-.28)*11.5,2.))+exp(-pow((vUv.y-.72)*11.5,2.));float a=pow(vUv.x,.8)*width*smoothstep(0.,.15,vUv.x);vec3 color=cinematic>.5?mix(tint*vec3(1.5,.50,.08),tint*3.,smoothstep(.50,.92,vUv.x)):tint;gl_FragColor=vec4(color,a*(cinematic>.5?.95:.6));\n#include <colorspace_fragment>\n}`,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  })),capacity);
  engines.count=0;engines.frustumCulled=false;engines.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(engines);
  engines.name='merchant-flight-engines';
  let disposed=false;
  return{root,shipSets,engines,capacity,
    dispose(){
      if(disposed)return;disposed=true;root.removeFromParent();
      root.traverse(object=>{if(object.isInstancedMesh)object.dispose();});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    },
  };
}
