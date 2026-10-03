import { describe,expect,it } from 'vitest';
import { ConeGeometry,Matrix4,Texture,Vector3 } from 'three';
import { createShipAsset } from '../js/ui/ShipModelFactory.js';
import { createFlightShip,updateFlightShip } from '../js/ui/ShipFlightVisual.js';

describe('共用舰体与喷口',()=>{
  for(const [type,count] of [['shuttle',2],['freighter',2],['clipper',3],['galleon',6]]) {
    it(type+' 的喷焰从真实喷口向后延伸，实例材质互不影响',()=>{
      const model=createShipAsset(type);
      expect(model.userData.engineSockets).toHaveLength(count);
      expect(model.children.length).toBeLessThanOrEqual(8);
      const plume=new ConeGeometry(1,1,8,1,true),halo=new Texture();
      const first=createFlightShip(model,plume,halo),second=createFlightShip(model,plume,halo);
      updateFlightShip(first,{opacity:1,engine:1},1000,true);
      expect(first.userData.plumes.count).toBe(count);
      const matrix=new Matrix4(),position=new Vector3();
      model.userData.engineSockets.forEach((socket,index)=>{
        first.userData.plumes.getMatrixAt(index,matrix);
        position.setFromMatrixPosition(matrix);
        expect(position.x).toBeCloseTo(-socket.position[2]);
        expect(position.y).toBeCloseTo(socket.position[1]);
        expect(position.z).toBeLessThan(socket.position[0]);
      });
      expect(first.children[0].children[0].geometry).toBe(model.children[0].geometry);
      expect(first.userData.hullMaterials[0]).not.toBe(second.userData.hullMaterials[0]);
      updateFlightShip(first,{opacity:0,engine:0},2000,true);
      expect(first.visible).toBe(false);
      expect(second.userData.hullMaterials[0].opacity).toBe(1);
      updateFlightShip(first,{opacity:1,engine:1},2500,false);
      expect(first.visible).toBe(true);
      expect(first.userData.plumes.visible).toBe(false);
      expect(first.userData.glow.material.opacity).toBe(0);
      for(const ship of [first,second]) {
        ship.userData.plumes.dispose();
        ship.traverse(object=>object.material?.dispose());
      }
      model.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
      plume.dispose();halo.dispose();
    });
  }
});
