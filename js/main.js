// js/main.js — 应用入口
// 依赖：core/GameManager.js
// 说明：浏览器加载完毕后初始化游戏

import { init } from './core/GameManager.js';

window.addEventListener('load', init);
