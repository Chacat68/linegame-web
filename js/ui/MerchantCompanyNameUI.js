import { getRandomCompanyName } from '../data/companyNames.js';
import { showBlockingSurface, hideBlockingSurface, registerBlockingSurfaceDismiss } from './SurfaceManager.js';

export function createMerchantCompanyNameUI({ getState, persist, onMessage }) {
  const modal = document.getElementById('company-name-modal');
  const panel = modal.querySelector('.modal-box');
  panel.innerHTML = `<header class="merchant-tools-heading"><h2 id="merchant-company-title">修改公司名称</h2><button type="button" class="ui-close-button" data-company-action="close" aria-label="关闭公司改名">×</button></header>
    <p id="merchant-company-name-hint" class="merchant-company-name-hint">给你的星际生意起个名字，也可以随机换一个。</p>
    <form id="merchant-company-form">
      <label for="merchant-company-name">公司名称</label>
      <div class="merchant-company-name-field"><input id="merchant-company-name" name="companyName" maxlength="80" required autocomplete="off" aria-describedby="merchant-company-name-hint merchant-company-name-status"><button type="button" data-company-action="randomize" aria-label="随机公司名称">随机</button></div>
      <p id="merchant-company-name-status" role="status" aria-live="polite"></p>
      <div class="merchant-company-name-actions"><button type="button" data-company-action="close">取消</button><button type="submit" data-button-state="ready">保存名称</button></div>
    </form>`;
  const input = panel.querySelector('[name="companyName"]');
  const status = panel.querySelector('#merchant-company-name-status');
  let disposed = false;
  const release = registerBlockingSurfaceDismiss('company-name-modal', { onDismiss: close });

  function close() {
    hideBlockingSurface('company-name-modal');
    // 保存或经营刷新可能替换入口节点，关闭时获取当前入口恢复焦点。
    document.getElementById('company-name-display')?.focus({ preventScroll: true });
  }
  function open() {
    if (disposed) return;
    input.value = getState().companyName;
    input.setCustomValidity('');
    status.textContent = '';
    showBlockingSurface('company-name-modal', { focusSelector: '[name="companyName"]' });
    input.select();
  }
  function click(event) {
    if (disposed) return;
    const button = event.target.closest?.('[data-company-action]');
    if (!button || button.disabled) return;
    if (button.dataset.companyAction === 'close') close();
    if (button.dataset.companyAction === 'randomize') {
      input.value = getRandomCompanyName(input.value);
      input.setCustomValidity('');
      status.textContent = '已随机生成，保存后生效。';
    }
  }
  function change() {
    input.setCustomValidity('');
    status.textContent = '';
  }
  function submit(event) {
    if (disposed || event.target.id !== 'merchant-company-form') return;
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      input.setCustomValidity('请输入公司名称。');
      status.textContent = '请输入公司名称。';
      input.reportValidity();
      return;
    }
    getState().companyName = name;
    const result = persist();
    if (!result.ok) {
      status.textContent = `名称已更新，但未能保存到本地。${result.msg || ''}`;
      return;
    }
    close();
    onMessage?.('公司名称已保存。');
  }
  modal.addEventListener('click', click);
  modal.addEventListener('input', change);
  modal.addEventListener('submit', submit);
  return {
    open,
    dispose() {
      if (disposed) return;
      disposed = true;
      hideBlockingSurface('company-name-modal');
      release();
      modal.removeEventListener('click', click);
      modal.removeEventListener('input', change);
      modal.removeEventListener('submit', submit);
    },
  };
}
