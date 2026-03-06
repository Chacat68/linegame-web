// js/main.js — 应用入口
// 依赖：core/GameManager.js
// 说明：浏览器加载完毕后初始化游戏

import { init } from './core/GameManager.js';

window.addEventListener('load', function () {
	init();
	bindSettingsModalFallback();
});

function bindSettingsModalFallback() {
	if (document.body.dataset.settingsFallbackBound === 'true') return;
	document.body.dataset.settingsFallbackBound = 'true';

	document.addEventListener('click', function (event) {
		var modal = document.getElementById('settings-modal');
		if (!modal) return;

		var openBtn = event.target.closest('#settings-btn');
		if (openBtn) {
			var motionSelect = document.getElementById('settings-motion-level');
			var savedSettings = _readSavedSettings();
			if (motionSelect) motionSelect.value = savedSettings.motionLevel;
			_activateSettingsPanelFallback(modal, modal.dataset.activePanel || 'display');
			modal.classList.remove('hidden');
			modal.setAttribute('aria-hidden', 'false');
			return;
		}

		var tabBtn = event.target.closest('[data-settings-panel-target]');
		if (tabBtn && modal.contains(tabBtn)) {
			_activateSettingsPanelFallback(modal, tabBtn.dataset.settingsPanelTarget);
			return;
		}

		var closeBtn = event.target.closest('#settings-close-btn');
		if (closeBtn || event.target === modal) {
			modal.classList.add('hidden');
			modal.setAttribute('aria-hidden', 'true');
		}
	});

	document.addEventListener('keydown', function (event) {
		var modal = document.getElementById('settings-modal');
		if (!modal || modal.classList.contains('hidden')) return;
		if (event.key === 'Escape') {
			modal.classList.add('hidden');
			modal.setAttribute('aria-hidden', 'true');
		}
	});
}

function _readSavedSettings() {
	try {
		var raw = localStorage.getItem('linegame_settings');
		if (!raw) return { motionLevel: 'full' };
		var parsed = JSON.parse(raw);
		if (['full', 'reduced', 'off'].indexOf(parsed.motionLevel) === -1) {
			return { motionLevel: 'full' };
		}
		return parsed;
	} catch (_) {
		return { motionLevel: 'full' };
	}
}

function _activateSettingsPanelFallback(modal, panelId) {
	if (!modal) return;
	var targetId = panelId || 'display';
	modal.dataset.activePanel = targetId;
	var radio = document.getElementById('settings-tab-' + targetId);
	if (radio) radio.checked = true;

	modal.querySelectorAll('[data-settings-panel-target]').forEach(function (btn) {
		var isActive = btn.dataset.settingsPanelTarget === targetId;
		btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
	});
}
