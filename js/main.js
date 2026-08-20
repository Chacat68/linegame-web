// js/main.js — 应用入口
// 依赖：core/GameApplication.js
// 说明：浏览器加载完毕后初始化游戏

import { init, shutdown } from './core/GameApplication.js';
import { bindBlockingSurfaceDismiss, hideBlockingSurface, showBlockingSurface } from './ui/SurfaceManager.js';
import { exportUsageDataFile } from './core/UsageDataExportEffect.js';
import * as StartupLoader from './ui/StartupLoader.js';

const SCENE_READY_TIMEOUT_MS = 20000;

window.addEventListener('load', async function () {
	StartupLoader.start();
	try {
		StartupLoader.update(32, '正在同步贸易与航行数据', 'RUNTIME STATE');
		const sceneReadyPromise = init();
		bindSettingsModalFallback();
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

function bindSettingsModalFallback() {
	if (document.body.dataset.settingsFallbackBound === 'true') return;
	var settingsBtn = document.getElementById('settings-btn');
	if (settingsBtn && (
		settingsBtn.dataset.settingsBound === 'true' ||
		settingsBtn.dataset.settingsLoaderBound === 'true'
	)) return;
	document.body.dataset.settingsFallbackBound = 'true';
	bindBlockingSurfaceDismiss('settings-modal');

	document.addEventListener('click', function (event) {
		var modal = document.getElementById('settings-modal');
		if (!modal) return;

		var openBtn = event.target.closest('#settings-btn');
		if (openBtn) {
			var motionSelect = document.getElementById('settings-motion-level');
			var secretRoutesToggle = document.getElementById('settings-secret-routes-visible');
			var difficultySelect = document.getElementById('settings-difficulty-level');
			var timeScaleSelect = document.getElementById('settings-time-scale');
			var soundEffectsToggle = document.getElementById('settings-sfx-enabled');
			var soundEffectsVolume = document.getElementById('settings-sfx-volume');
			var soundEffectsVolumeValue = document.getElementById('settings-sfx-volume-value');
			var savedSettings = _readSavedSettings();
			if (motionSelect) motionSelect.value = savedSettings.motionLevel;
			if (secretRoutesToggle) secretRoutesToggle.checked = savedSettings.secretRoutesVisible !== false;
			if (difficultySelect) difficultySelect.value = savedSettings.difficulty;
			if (timeScaleSelect) timeScaleSelect.value = String(savedSettings.realtimeDayDurationMs);
			if (soundEffectsToggle) soundEffectsToggle.checked = savedSettings.soundEffectsEnabled !== false;
			if (soundEffectsVolume) soundEffectsVolume.value = String(savedSettings.soundEffectsVolume);
			if (soundEffectsVolumeValue) soundEffectsVolumeValue.textContent = Math.round(savedSettings.soundEffectsVolume * 100) + '%';
			_activateSettingsPanelFallback(modal, modal.dataset.activePanel || 'display');
			showBlockingSurface('settings-modal', {
				focusSelector: '[data-settings-panel-target][aria-selected="true"]',
			});
			return;
		}

		var tabBtn = event.target.closest('[data-settings-panel-target]');
		if (tabBtn && modal.contains(tabBtn)) {
			_activateSettingsPanelFallback(modal, tabBtn.dataset.settingsPanelTarget);
			return;
		}

		var exportUsageDataBtn = event.target.closest('#settings-export-usage-data-btn');
		if (exportUsageDataBtn) {
			_exportUsageDataFallback();
			return;
		}

		var closeBtn = event.target.closest('#settings-close-btn');
		if (closeBtn) {
			hideBlockingSurface('settings-modal');
		}
	});
}

function _readSavedSettings() {
	try {
		var raw = localStorage.getItem('linegame_settings');
		if (!raw) {
			return {
				motionLevel: 'full',
				difficulty: 'normal',
				secretRoutesVisible: true,
				realtimeDayDurationMs: 60000,
				soundEffectsEnabled: true,
				soundEffectsVolume: 0.35,
			};
		}
		var parsed = JSON.parse(raw);
		return {
			motionLevel: ['full', 'reduced', 'off'].indexOf(parsed.motionLevel) === -1 ? 'full' : parsed.motionLevel,
			difficulty: ['easy', 'normal', 'hard'].indexOf(parsed.difficulty) === -1 ? 'normal' : parsed.difficulty,
			secretRoutesVisible: parsed.secretRoutesVisible !== false,
			realtimeDayDurationMs: [30000, 60000, 180000].indexOf(parsed.realtimeDayDurationMs) === -1 ? 60000 : parsed.realtimeDayDurationMs,
			soundEffectsEnabled: parsed.soundEffectsEnabled !== false,
			soundEffectsVolume: _normalizeSoundEffectsVolumeFallback(parsed.soundEffectsVolume),
		};
	} catch (_) {
		return {
			motionLevel: 'full',
			difficulty: 'normal',
			secretRoutesVisible: true,
			realtimeDayDurationMs: 60000,
			soundEffectsEnabled: true,
			soundEffectsVolume: 0.35,
		};
	}
}

function _normalizeSoundEffectsVolumeFallback(value) {
	var numericValue = Number(value);
	if (!Number.isFinite(numericValue)) return 0.35;
	return Math.max(0, Math.min(1, numericValue));
}

function _activateSettingsPanelFallback(modal, panelId) {
	if (!modal) return;
	var targetId = panelId || 'display';
	modal.dataset.activePanel = targetId;
	var radio = document.getElementById('settings-tab-' + targetId);
	if (radio) radio.checked = true;

	var titleEl = document.getElementById('settings-page-title');
	if (titleEl) {
		var titles = { display: '显示设置', game: '游戏设置', data: '数据管理' };
		titleEl.textContent = titles[targetId] || '设置';
	}

	modal.querySelectorAll('[data-settings-panel-target]').forEach(function (btn) {
		var isActive = btn.dataset.settingsPanelTarget === targetId;
		btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
		btn.setAttribute('tabindex', isActive ? '0' : '-1');
	});

	modal.querySelectorAll('[data-settings-panel]').forEach(function (panel) {
		var isActive = panel.dataset.settingsPanel === targetId;
		panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
		panel.setAttribute('tabindex', isActive ? '0' : '-1');
	});
}

function _exportUsageDataFallback() {
	exportUsageDataFile(null);
}
