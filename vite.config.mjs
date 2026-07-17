import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const threeCoreEntry = fileURLToPath(
  new URL('./node_modules/three/src/Three.Core.js', import.meta.url)
);

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      // Keep addon imports (notably OrbitControls) on Three's tree-shakable
      // source graph instead of pulling the pre-bundled monolithic entry.
      { find: /^three$/, replacement: threeCoreEntry },
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.endsWith('/js/ui/Renderer2DStarmap.js')) {
            return 'starmap-fallback-2d';
          }
          if (normalizedId.includes('/node_modules/three/examples/jsm/controls/')) {
            return 'three-controls';
          }
          if (
            normalizedId.endsWith('/three/src/renderers/WebGLRenderTarget.js')
            || normalizedId.endsWith('/three/src/renderers/webxr/WebXRController.js')
            || normalizedId.endsWith('/three/src/renderers/shaders/UniformsUtils.js')
            || normalizedId.endsWith('/three/src/renderers/shaders/ShaderChunk/default_vertex.glsl.js')
            || normalizedId.endsWith('/three/src/renderers/shaders/ShaderChunk/default_fragment.glsl.js')
          ) {
            return 'three-core';
          }
          if (normalizedId.includes('/node_modules/three/src/renderers/')) {
            return 'three-webgl';
          }
          if (normalizedId.includes('/node_modules/three/src/')) {
            return 'three-core';
          }
        },
      },
    },
  },
});
