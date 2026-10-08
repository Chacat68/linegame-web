import * as Save from '../systems/save/SaveSystem.js';
import { downloadRawSave } from './SaveExportEffect.js';
import { loadSettings, saveSettings, applySettings } from '../core/SettingsCore.js';
import { showBlockingSurface, hideBlockingSurface, registerBlockingSurfaceDismiss } from './SurfaceManager.js';
import { GAME_NAME, GAME_VERSION } from '../data/constants.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function createMerchantTools({ getState, replaceState, renderer, onMessage }) {
  const modal = document.getElementById('settings-modal');
  const panel = modal.querySelector('.modal-box');
  let settings = loadSettings();
  let tab = 'display';
  let disposed = false;
  let confirmResolve = null;
  const importInputs = new Set();
  const release = registerBlockingSurfaceDismiss('settings-modal', { onDismiss: close });
  function status(message) { const element = document.getElementById('merchant-tools-status'); if (element) element.textContent = message; onMessage?.(message); }
  function draw() {
    panel.innerHTML = `<header class="merchant-tools-heading"><h2 id="merchant-tools-title">设置</h2><button type="button" class="ui-close-button" data-tool="close" aria-label="关闭设置">×</button></header>
      <nav class="merchant-tools-tabs" aria-label="设置分类">${[['display','画面与声音'],['saves','存档']].map(([id,name]) => `<button type="button" data-tool="tab" data-tab="${id}" aria-pressed="${id===tab}">${name}</button>`).join('')}</nav>
      <div class="merchant-tools-body">${tab === 'display' ? `<label>场景动效<select id="setting-motion"><option value="full">完整</option><option value="reduced">减少</option><option value="off">关闭</option></select></label><label><span>面板毛玻璃</span><input type="checkbox" id="setting-blur" ${settings.terminalBlur ? 'checked' : ''}></label><label><span>操作音效</span><input type="checkbox" id="setting-sound" ${settings.soundEffectsEnabled ? 'checked' : ''}></label><label>音效音量<input type="range" id="setting-volume" min="0" max="1" step="0.05" value="${settings.soundEffectsVolume}"></label>` : `${Save.listSlots().map(item => `<article class="merchant-save-slot"><div><strong>${item.slotId===0 ? '自动存档' : '手动存档 '+item.slotId}</strong><p>${item.isEmpty ? '空槽位' : item.isCorrupted ? escape(item.errorMessage) : `${escape(item.meta.companyName)} · ${Math.floor(item.meta.credits).toLocaleString('zh-CN')} CR`}</p>${item.meta ? `<small>${new Date(item.meta.timestampMs).toLocaleString('zh-CN')}</small>` : ''}</div><div class="merchant-save-actions">${item.slotId ? `<button type="button" data-tool="save" data-button-state="ready" data-slot="${item.slotId}">保存</button>` : ''}<button type="button" data-tool="load" data-button-state="${item.isEmpty || item.isCorrupted ? 'blocked' : 'ready'}" data-slot="${item.slotId}" ${item.isEmpty || item.isCorrupted ? 'disabled' : ''}>读取</button><button type="button" data-tool="export" ${item.isEmpty ? 'data-button-state="blocked"' : ''} data-slot="${item.slotId}" ${item.isEmpty ? 'disabled' : ''}>导出</button><button type="button" data-tool="import" data-slot="${item.slotId}">导入</button>${item.slotId ? `<button type="button" data-tool="delete" data-button-state="${item.isEmpty ? 'blocked' : 'danger'}" data-slot="${item.slotId}" ${item.isEmpty ? 'disabled' : ''}>删除</button>` : ''}</div></article>`).join('')}<button type="button" data-tool="restart" data-button-state="danger">重新开始</button>`}</div><p class="merchant-version">${escape(GAME_NAME)} ${GAME_VERSION}</p><p id="merchant-tools-status" role="status" aria-live="polite"></p>`;
    if (tab === 'display') document.getElementById('setting-motion').value = settings.motionLevel;
  }
  function answerConfirmation(accepted) {
    const resolve = confirmResolve;
    confirmResolve = null;
    if (!disposed) draw();
    resolve?.(accepted);
  }
  function close() {
    if (confirmResolve) answerConfirmation(false);
    hideBlockingSurface('settings-modal');
  }
  function confirmAction(text, state = 'ready') {
    return new Promise(resolve => {
      confirmResolve = resolve;
      panel.innerHTML = `<header class="merchant-tools-heading"><h2 id="merchant-tools-title">确认操作</h2></header><p class="merchant-confirm-message">${escape(text)}</p><div class="merchant-confirm-actions"><button type="button" data-tool="confirm-no">返回</button><button type="button" data-tool="confirm-yes" data-button-state="${state}">确认继续</button></div>`;
      panel.querySelector('[data-tool="confirm-no"]').focus();
    });
  }
  function open(nextTab = 'display') {
    if (confirmResolve) answerConfirmation(false);
    tab = nextTab === 'saves' ? 'saves' : 'display'; draw(); showBlockingSurface('settings-modal', { focusSelector: '[data-tool="close"]' });
  }
  async function click(event) {
    const button = event.target.closest?.('[data-tool]');
    if (!button || button.disabled || disposed) return;
    const action = button.dataset.tool, id = Number(button.dataset.slot);
    if (action === 'confirm-yes' || action === 'confirm-no') { answerConfirmation(action === 'confirm-yes'); return; }
    if (action === 'close') { close(); return; }
    if (action === 'tab') { tab = button.dataset.tab; draw(); panel.querySelector(`[data-tab="${tab}"]`)?.focus(); return; }
    try {
      if (action === 'save') {
        if (!Save.listSlots()[id].isEmpty && !await confirmAction('覆盖这个手动存档？')) return;
        const result = Save.saveGame(id, getState()); draw(); status(result.msg);
      }
      if (action === 'load') {
        if (!await confirmAction('读取此存档并替换当前运行进度？')) return;
        const result = Save.loadGame(id);
        if (result.ok) { replaceState(result.state); hideBlockingSurface('settings-modal'); }
        status(result.msg);
      }
      if (action === 'export') { const raw = Save.exportSave(id); if (raw) downloadRawSave(raw, id); }
      if (action === 'import') {
        if (!Save.listSlots()[id].isEmpty && !await confirmAction('导入文件将覆盖此槽位，原文件会先备份。继续？')) return;
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
        input.hidden = true;
        const removeInput = () => { input.remove(); importInputs.delete(input); };
        importInputs.add(input); document.body.append(input);
        input.addEventListener('cancel', removeInput, { once: true });
        input.addEventListener('change', async () => {
          try {
            const file = input.files?.[0]; if (!file || disposed) return;
            const raw = await file.text(); if (disposed) return;
            const result = Save.importSave(id, raw); draw(); status(result.msg);
          } catch { status('读取文件失败，请重试。'); }
          finally { removeInput(); }
        }, { once: true }); input.click();
      }
      if (action === 'delete' && await confirmAction('删除此手动存档？', 'danger')) { Save.deleteSlot(id); draw(); status('存档已删除。'); }
      if (action === 'restart' && await confirmAction('重新开始会删除自动存档，手动存档会保留。继续？', 'danger')) {
        // 先停止旧计时，再创建新会话；自动存档由新会话写入。
        replaceState(null); hideBlockingSurface('settings-modal');
      }
    } catch (error) { status('操作失败：' + error.message); }
  }
  function change() {
    if (tab !== 'display') return;
    settings = { motionLevel: document.getElementById('setting-motion').value, terminalBlur: document.getElementById('setting-blur').checked,
      soundEffectsEnabled: document.getElementById('setting-sound').checked, soundEffectsVolume: Number(document.getElementById('setting-volume').value) };
    applySettings(settings, renderer);
    try { saveSettings(settings); status('设置已保存。'); } catch { status('设置已应用，本地保存失败。'); }
  }
  modal.addEventListener('click', click); modal.addEventListener('change', change); modal.addEventListener('input', change);
  return { open, dispose() { disposed = true; for (const input of importInputs) input.remove(); importInputs.clear(); if (confirmResolve) answerConfirmation(false); hideBlockingSurface('settings-modal'); release(); modal.removeEventListener('click',click); modal.removeEventListener('change',change); modal.removeEventListener('input',change); } };
}
