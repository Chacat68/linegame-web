// js/main.js — 应用入口
// 依赖：core/GameApplication.js
// 说明：浏览器加载完毕后初始化游戏

import { init, shutdown } from './core/GameApplication.js';
import * as StartupLoader from './ui/StartupLoader.js';

const SCENE_READY_TIMEOUT_MS = 20000;

window.addEventListener('load', async function () {
	StartupLoader.start();
	try {
		StartupLoader.update(32, '正在同步贸易与航行数据', 'RUNTIME STATE');
		const sceneReadyPromise = init();
		StartupLoader.update(72, '正在生成星图场景', 'STARMAP RENDER');
		await _withTimeout(sceneReadyPromise, SCENE_READY_TIMEOUT_MS);
		StartupLoader.update(92, '正在校准舰桥显示', 'DISPLAY SYNC');
		await StartupLoader.complete();
	} catch (error) {
		StartupLoader.fail(error);
	}
});

window.addEventListener('pagehide', function (event) {
	// bfcache 页面会在 pageshow 恢复同一 JS 实例，不能提前释放运行时。
	if (!event || event.persisted !== true) shutdown('pagehide');
});

if (import.meta.hot) {
	import.meta.hot.dispose(function () { shutdown('hot-module-reload'); });
}

function _withTimeout(promise, timeoutMs) {
	return new Promise(function (resolve, reject) {
		const timeoutId = setTimeout(function () {
			reject(new Error('Starmap scene did not become ready within ' + timeoutMs + 'ms.'));
		}, timeoutMs);
		Promise.resolve(promise).then(function (value) {
			clearTimeout(timeoutId);
			resolve(value);
		}, function (error) {
			clearTimeout(timeoutId);
			reject(error);
		});
	});
}
