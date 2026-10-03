// 只在球体轮廓处显示大气，避免透明实心球把地表整体染亮。
import { AdditiveBlending, BackSide, Color, ShaderMaterial } from 'three';

export function createPlanetAtmosphere(color) {
  return new ShaderMaterial({
    uniforms: { tint: { value: new Color(color) } },
    vertexShader: `
      varying vec3 surfaceNormal;
      varying vec3 viewDirection;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        surfaceNormal = normalize(normalMatrix * normal);
        viewDirection = -viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 tint;
      varying vec3 surfaceNormal;
      varying vec3 viewDirection;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(surfaceNormal), normalize(viewDirection))), 3.0);
        gl_FragColor = vec4(tint, rim * 0.48);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}
