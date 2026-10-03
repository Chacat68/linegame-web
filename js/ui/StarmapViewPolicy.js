import { MOUSE, TOUCH } from 'three';

// 窗口宽度不代表设备能力；小窗口同样需要清晰的星球与航线。
export function resolveStarmapQuality({ memory = 8, width = 1280 } = {}) {
  if (memory <= 3) return 'low';
  return memory <= 4 || width <= 1100 ? 'medium' : 'high';
}

export function getStarmapPixelRatio(quality, rawDpr, width, height) {
  const limit = quality === 'low' ? 1.25 : quality === 'high' ? 2 : 1.75;
  const budget = quality === 'low' ? 2500000 : 6000000;
  return Math.max(1, Math.min(rawDpr || 1, limit, Math.sqrt(budget / Math.max(1, width * height))));
}

export function configureStarmapControls(controls) {
  controls.enableRotate = false;
  controls.enableZoom = false;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.mouseButtons.LEFT = MOUSE.PAN;
  controls.mouseButtons.RIGHT = MOUSE.PAN;
  controls.touches.ONE = TOUCH.PAN;
  controls.touches.TWO = TOUCH.DOLLY_PAN;
  if (controls.object && controls.target) {
    const distance = controls.object.position.distanceTo(controls.target);
    controls.minDistance = controls.maxDistance = distance;
  }
}

export function panStarmapCameraTo(camera, controls, position) {
  const dx = position.x - controls.target.x;
  const dz = position.z - controls.target.z;
  camera.position.x += dx;
  camera.position.z += dz;
  controls.target.x += dx;
  controls.target.z += dz;
  controls.update();
}
