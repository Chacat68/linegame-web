// js/main.js — 应用入口
// 依赖：core/GameApplication.js
// 说明：浏览器加载完毕后初始化游戏

import { init, shutdown } from './core/GameApplication.js';
import * as StartupLoader from './ui/StartupLoader.js';
import { deleteSlot, exportSave } from './systems/save/SaveSystem.js';
import { downloadRawSave } from './ui/SaveExportEffect.js';
import { schedulePreload } from './ui/StarmapRenderer.js';

const WORKSPACE_READY_TIMEOUT_MS = 20000;

let _starting = false;
let _startupGeneration = 0;

async function startGame(options) {
	if (_starting) return false;
	_starting = true;
	const generation = ++_startupGeneration;
	StartupLoader.start();
	try {
		StartupLoader.update(32, '正在恢复商队经营进度', 'RUNTIME STATE');
		const workspaceReadyPromise = init(null, options);
		StartupLoader.update(72, '正在连接经营工作区', 'WORKSPACE LINK');
		await _withTimeout(workspaceReadyPromise, WORKSPACE_READY_TIMEOUT_MS);
		if (generation !== _startupGeneration) return false;
		StartupLoader.update(92, '正在准备商队指挥台', 'DISPLAY SYNC');
		await StartupLoader.complete();
		if (generation !== _startupGeneration) return false;
		schedulePreload();
		return true;
	} catch (error) {
		if (generation !== _startupGeneration) return false;
		shutdown('startup-failed');
		StartupLoader.fail(error, {
			onRetry: function () { return startGame(); },
			onExport: function () { downloadRawSave(exportSave(0), 0); },
			onRestart: function () {
				deleteSlot(0);
				return startGame({ restoreAutosave: false, reason: 'recovery-new-game' });
			},
		});
		return false;
	} finally {
		if (generation === _startupGeneration) _starting = false;
	}
}

function stopGame(reason) {
	// 启动过渡可能晚于退出完成；失效旧回调，避免结束会话又开始预加载。
	_startupGeneration += 1;
	_starting = false;
	shutdown(reason);
}

window.addEventListener('load', function () { return startGame(); });

window.addEventListener('pagehide', function (event) {
	// bfcache 页面会在 pageshow 恢复同一 JS 实例，不能提前释放运行时。
	if (!event || event.persisted !== true) stopGame('pagehide');
});

if (import.meta.hot) {
	import.meta.hot.dispose(function () { stopGame('hot-module-reload'); });
}

function _withTimeout(promise, timeoutMs) {
	return new Promise(function (resolve, reject) {
		const timeoutId = setTimeout(function () {
			reject(new Error('Game workspace did not become ready within ' + timeoutMs + 'ms.'));
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
