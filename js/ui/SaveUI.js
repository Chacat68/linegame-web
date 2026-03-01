// js/ui/SaveUI.js — 存读档界面
// 依赖：systems/save/SaveSystem.js
// 导出：render

import * as Save from '../systems/save/SaveSystem.js';

/**
 * 渲染存读档面板
 * @param {Function} onSave   (slotId) => void
 * @param {Function} onLoad   (slotId) => void
 */
export function render(onSave, onLoad) {
  const container = document.getElementById('save-list');
  if (!container) return;

  const slots = Save.listSlots();
  let html = '<div class="save-header">💾 存档管理</div>';

  slots.forEach(function (slot) {
    const isAuto = slot.slotId === 0;
    const label  = isAuto ? '🔄 自动存档' : '📁 槽位 ' + slot.slotId;

    if (slot.isEmpty) {
      html += '<div class="save-slot empty-slot">' +
        '<div class="save-slot-header">' + label + '</div>' +
        '<div class="save-slot-info">— 空 —</div>' +
        (!isAuto ? '<button class="btn-action save-btn" data-slot="' + slot.slotId + '">保存</button>' : '') +
        '</div>';
    } else {
      const m    = slot.meta;
      const date = new Date(m.timestampMs);
      const timeStr = date.toLocaleDateString('zh-CN') + ' ' +
                      date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      html += '<div class="save-slot has-data">' +
        '<div class="save-slot-header">' + label + '</div>' +
        '<div class="save-slot-info">' +
          '<span>📅 ' + timeStr + '</span>' +
          '<span>💰 ' + (m.credits || 0).toLocaleString() + '</span>' +
          '<span>📆 第 ' + (m.day || 1) + ' 天</span>' +
        '</div>' +
        '<div class="save-slot-actions">' +
          '<button class="btn-action load-btn" data-slot="' + slot.slotId + '">读取</button>' +
          (!isAuto ? '<button class="btn-action save-btn" data-slot="' + slot.slotId + '">覆盖</button>' : '') +
          '<button class="btn-action del-btn" data-slot="' + slot.slotId + '">删除</button>' +
        '</div>' +
        '</div>';
    }
  });

  // 导出/导入按钮
  html += '<div class="save-export-row">' +
    '<button class="btn-action export-btn">📤 导出存档</button>' +
    '<button class="btn-action import-btn">📥 导入存档</button>' +
    '</div>';

  container.innerHTML = html;

  // 绑定事件
  container.querySelectorAll('.save-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      onSave(parseInt(btn.dataset.slot));
    });
  });
  container.querySelectorAll('.load-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      onLoad(parseInt(btn.dataset.slot));
    });
  });
  container.querySelectorAll('.del-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (confirm('确定删除此存档？')) {
        Save.deleteSlot(parseInt(btn.dataset.slot));
        render(onSave, onLoad);
      }
    });
  });

  // 导出
  container.querySelector('.export-btn').addEventListener('click', function () {
    const json = Save.exportSave(0); // 导出自动存档
    if (!json) { alert('没有可导出的存档。'); return; }
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'startrader_save_' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // 导入
  container.querySelector('.import-btn').addEventListener('click', function () {
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept = '.json';
    input.addEventListener('change', function () {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        const result = Save.importSave(1, reader.result);
        alert(result.msg);
        if (result.ok) render(onSave, onLoad);
      };
      reader.readAsText(file);
    });
    input.click();
  });
}
