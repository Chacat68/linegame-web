// 航行沿用机库舰体，喷口由建模源定位；所有喷焰合为一次实例化绘制。
import { AdditiveBlending, Box3, Group, InstancedMesh, MeshBasicMaterial, Object3D, Sprite, SpriteMaterial, Vector3 } from 'three';

export function createFlightShip(prototype, plumeGeometry, haloTexture) {
  const ship = new Group();
  ship.name = 'flight-ship-' + prototype.name;
  const body = prototype.clone(true);
  const hullMaterials = [];
  body.traverse(object => {
    if (!object.isMesh) return;
    object.material = object.material.clone();
    object.material.transparent = true;
    hullMaterials.push(object.material);
  });
  body.rotation.y = -Math.PI/2;
  ship.add(body);
  const sockets = prototype.userData.engineSockets;
  const plumeMaterial = new MeshBasicMaterial({color:'#9ee7f2',transparent:true,depthWrite:false,blending:AdditiveBlending});
  const plumes = new InstancedMesh(plumeGeometry,plumeMaterial,sockets.length);
  plumes.frustumCulled = false;
  ship.add(plumes);
  const glow = new Sprite(new SpriteMaterial({map:haloTexture,color:'#87d7e7',transparent:true,depthWrite:false,blending:AdditiveBlending}));
  const center = sockets.reduce((result,socket) => result + socket.position[0],0)/sockets.length;
  glow.position.set(0,.6,center);
  ship.add(glow);
  const size = new Box3().setFromObject(body).getSize(new Vector3());
  ship.userData = {hullMaterials,plumes,glow,sockets,bodyLength:Math.max(size.x,size.y,size.z),transform:new Object3D(),baseScale:prototype.name==='galleon'?.84:.78};
  return ship;
}

export function updateFlightShip(ship,visual,time,fullMotion,screenScale=0) {
  ship.visible = visual.opacity > .01;
  ship.scale.setScalar(Math.max(ship.userData.baseScale,screenScale));
  const {hullMaterials,plumes,glow,sockets,transform} = ship.userData;
  for (const material of hullMaterials) {
    material.opacity = visual.opacity;
    material.depthWrite = visual.opacity > .98;
  }
  plumes.visible = fullMotion && visual.engine > .01;
  plumes.material.opacity = visual.engine * .7;
  sockets.forEach((socket,index) => {
    const length = .35 + visual.engine * 2.1 + (fullMotion ? Math.sin(time*.006+index)*.06 : 0);
    transform.position.set(-socket.position[2],socket.position[1],socket.position[0]-length/2);
    transform.rotation.set(-Math.PI/2,0,0);
    transform.scale.set(socket.radius*.75,length,socket.radius*.75);
    transform.updateMatrix();
    plumes.setMatrixAt(index,transform.matrix);
  });
  plumes.instanceMatrix.needsUpdate = true;
  glow.material.opacity = fullMotion ? visual.engine*.2 : 0;
  glow.scale.setScalar(2.2 + visual.engine*.7);
}
