import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    setupFiles: ['tests/setupLocalStorage.js'],
    // 余额仿真与应用组合根测试均为 CPU 密集型；限制文件并发，避免按机器
    // 逻辑核数放大资源竞争并触发与业务断言无关的超时。
    maxWorkers: 4,
  },
});
