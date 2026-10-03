import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    setupFiles: ['tests/setupLocalStorage.js'],
    // 限制几何与地表生成测试的文件并发，避免资源竞争。
    maxWorkers: 4,
  },
});
