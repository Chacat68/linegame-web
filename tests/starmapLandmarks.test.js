import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { createStarmapLandmark, createPlanetSurfaceDetails } from '../js/ui/StarmapLandmarks.js';
import { getLocationVisual, getSceneEnvironment } from '../js/data/sceneVisuals.js';

describe('地点视觉资产契约', () => {
  it('工业星球建筑沿法线贴地，最高点接近球面，不出现高烟囱或球形突点', () => {
    const geometries = new Map();
    const getGeometry = (key, create) => { if (!geometries.has(key)) geometries.set(key, create()); return geometries.get(key); };
    const group = createPlanetSurfaceDetails('industrial', 'high', getGeometry);
    group.children.forEach(building => {
      const up = new Vector3(0, 1, 0).applyQuaternion(building.quaternion);
      expect(up.dot(building.position.clone().normalize())).toBeCloseTo(1);
      const position = building.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const point = new Vector3().fromBufferAttribute(position, i).applyQuaternion(building.quaternion).add(building.position);
        expect(point.length()).toBeLessThan(1.04);
      }
    });
    new Set(group.children.map(mesh => mesh.material)).forEach(material => material.dispose());
    geometries.forEach(geometry => geometry.dispose());
  });
  it('价格变化不改变实体类别、视觉体量，未知地点与星系可回退', () => {
    const location = Object.freeze({ id: 'nebula_forge', prices: { food: 1 } });
    expect(getLocationVisual(location)).toEqual(getLocationVisual({ ...location, prices: { food: 9000 } }));
    expect(getLocationVisual({ id: 'future-location' }).bodyKind).toBe('planet');
    expect(getSceneEnvironment(null)).toEqual(getSceneEnvironment('milky_way'));
    expect(Object.isFrozen(getLocationVisual(location))).toBe(true);
  });

  for (const kind of ['station', 'asteroids']) {
    it(`${kind} 在低/高画质下具有有限几何与一致体量，重复创建复用几何`, () => {
      const cache = new Map();
      const getGeometry = (key, create) => {
        if (!cache.has(key)) cache.set(key, create());
        return cache.get(key);
      };
      const objects = ['low', 'high', 'high'].map(quality => createStarmapLandmark(kind, quality, getGeometry));
      objects.forEach(object => {
        const size = new Box3().setFromObject(object).getSize(new Vector3());
        expect(size.x).toBeGreaterThan(1);
        expect(size.z).toBeGreaterThan(1);
        expect(size.length()).toBeLessThan(5);
        object.children.forEach(mesh => {
          expect(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
          expect(mesh.geometry.attributes.normal.count).toBe(mesh.geometry.attributes.position.count);
        });
      });
      expect(objects[1].children[0].geometry).toBe(objects[2].children[0].geometry);
      // 材质属于各地点，锁定或释放一个地点不会影响另一地点。
      expect(objects[1].children[0].material).not.toBe(objects[2].children[0].material);
      objects.forEach(object => object.children.forEach(mesh => mesh.material.dispose()));
      cache.forEach(geometry => geometry.dispose());
    });
  }
});
