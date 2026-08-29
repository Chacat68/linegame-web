// js/ui/SaveWorkspacePresenter.js — 存档工作区纯视图投影

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatSaveSlotLabel(slot) {
  return slot && slot.slotId === 0 ? '自动存档' : '槽位 ' + Number(slot && slot.slotId);
}

export function formatSaveTime(timestampMs) {
  var date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleDateString('zh-CN') + ' ' +
    date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function _formatCredits(value) {
  var credits = Number(value || 0);
  return Number.isFinite(credits) ? credits.toLocaleString() : '0';
}

function _getSlotState(slot) {
  if (slot.isCorrupted) return 'corrupted';
  if (slot.isEmpty) return 'empty';
  return 'ready';
}

function _buildWorkspaceContext(slots) {
  var readySlots = slots.filter(function (slot) { return !slot.isEmpty && !slot.isCorrupted; });
  var emptyManualSlots = slots.filter(function (slot) { return slot.slotId > 0 && slot.isEmpty; });
  var corruptedSlots = slots.filter(function (slot) { return slot.isCorrupted; });
  var autoSlot = slots.find(function (slot) { return slot.slotId === 0; }) || null;
  var latestSlot = readySlots.slice().sort(function (left, right) {
    return ((right.meta && right.meta.timestampMs) || 0) - ((left.meta && left.meta.timestampMs) || 0);
  })[0] || null;
  var signalTone = corruptedSlots.length > 0
    ? 'danger'
    : (!autoSlot || autoSlot.isEmpty || autoSlot.isCorrupted ? 'warning' : 'ready');
  var focusTitle = '本地备份稳定';
  var focusBody = '自动存档与手动槽位可用于快速恢复。';
  var focusMeta = '备份状态';

  if (corruptedSlots.length > 0) {
    focusTitle = '发现异常槽位';
    focusBody = '异常槽位 ' + corruptedSlots.map(formatSaveSlotLabel).join('、') + '，读取前需覆盖或删除。';
    focusMeta = '风险提醒';
  } else if (!autoSlot || autoSlot.isEmpty || autoSlot.isCorrupted) {
    focusTitle = '自动备份缺失';
    focusBody = readySlots.length > 0
      ? '自动槽位不可用，迁移区已改用最近的有效手动槽位。'
      : '当前没有可用于导出的有效存档，请先写入手动槽位。';
    focusMeta = '导出状态';
  } else if (emptyManualSlots.length > 0) {
    focusTitle = '手动槽位可写入';
    focusBody = '空槽位 ' + emptyManualSlots.map(formatSaveSlotLabel).join('、') + ' 可用于保留重要进度。';
    focusMeta = '容量状态';
  }

  return {
    total: slots.length,
    readySlots: readySlots,
    emptyManual: emptyManualSlots.length,
    corrupted: corruptedSlots.length,
    autoReady: !!autoSlot && !autoSlot.isEmpty && !autoSlot.isCorrupted,
    latestSlot: latestSlot,
    latestMeta: latestSlot && latestSlot.meta ? latestSlot.meta : null,
    signalTone: signalTone,
    focusTitle: focusTitle,
    focusBody: focusBody,
    focusMeta: focusMeta,
  };
}

function _renderSafetyPanel(context) {
  var latestLabel = context.latestSlot && context.latestMeta
    ? (formatSaveSlotLabel(context.latestSlot) + ' · ' + formatSaveTime(context.latestMeta.timestampMs))
    : '暂无可读取存档';
  var latestDetail = context.latestMeta
    ? ('第 ' + (context.latestMeta.day || 1) + ' 天 · 资金 ' + _formatCredits(context.latestMeta.credits))
    : '等待自动或手动写入';
  var exportState = context.readySlots.length > 0 ? (context.readySlots.length + ' 个槽位可导出') : '暂无可导出槽位';

  return '<section class="save-safety-panel save-safety-panel--' + _escapeHtml(context.signalTone) + '" aria-label="存档安全状态">' +
    '<div class="save-safety-copy"><span>存档安全</span><strong>存档安全状态</strong><p>最近备份、异常槽位和迁移可用性集中在这里。</p></div>' +
    '<div class="save-safety-grid" role="list" aria-label="存档安全指标">' +
      '<div class="save-safety-cell" role="listitem"><span>最近备份</span><strong>' + _escapeHtml(latestLabel) + '</strong><small>' + _escapeHtml(latestDetail) + '</small></div>' +
      '<div class="save-safety-cell" role="listitem"><span>可读取</span><strong>' + context.readySlots.length + '/' + context.total + '</strong><small>' + _escapeHtml(exportState) + '</small></div>' +
      '<div class="save-safety-cell" role="listitem"><span>空手动槽</span><strong>' + context.emptyManual + '</strong><small>可保留重要进度</small></div>' +
      '<div class="save-safety-cell save-safety-cell--risk" role="listitem"><span>异常</span><strong>' + context.corrupted + '</strong><small>损坏槽位需要处理</small></div>' +
    '</div>' +
    '<div class="save-safety-focus" aria-label="存档处理状态"><div><span>存档状态</span><strong>' + _escapeHtml(context.focusTitle) + '</strong><small>' + _escapeHtml(context.focusBody) + '</small></div><span class="save-safety-focus-badge">' + _escapeHtml(context.focusMeta) + '</span></div>' +
  '</section>';
}

function _renderHealthStrip(slots) {
  var ready = slots.filter(function (slot) { return !slot.isEmpty && !slot.isCorrupted; }).length;
  var corrupted = slots.filter(function (slot) { return slot.isCorrupted; }).length;
  var manualReady = slots.filter(function (slot) { return slot.slotId > 0 && !slot.isEmpty && !slot.isCorrupted; }).length;
  return '<div class="save-health-strip" role="status" aria-live="polite">' +
    '<span class="save-health-chip"><strong>' + slots.length + '</strong><span>总槽位</span></span>' +
    '<span class="save-health-chip save-health-chip--ready"><strong>' + ready + '</strong><span>可读取</span></span>' +
    '<span class="save-health-chip"><strong>' + manualReady + '</strong><span>手动存档</span></span>' +
    '<span class="save-health-chip save-health-chip--alert"><strong>' + corrupted + '</strong><span>异常</span></span>' +
  '</div>';
}

function _renderSlotActions(actionHtml, label) {
  if (!actionHtml) {
    return '<div class="save-slot-actions save-slot-actions--muted" role="group" aria-label="' + _escapeHtml(label) + '操作"><span class="save-slot-hint">自动存档会在关键行动后写入。</span></div>';
  }
  return '<div class="save-slot-actions" role="group" aria-label="' + _escapeHtml(label) + '操作">' + actionHtml + '</div>';
}

function _renderSlot(slot) {
  var isAuto = slot.slotId === 0;
  var label = formatSaveSlotLabel(slot);
  var state = _getSlotState(slot);
  var badge = slot.isCorrupted ? '异常' : (isAuto ? '自动' : '手动');
  var noteId = 'save-slot-note-' + slot.slotId;
  var bodyHtml = '';
  var actionHtml = '';

  if (slot.isEmpty) {
    bodyHtml = '<div class="save-slot-info"><span class="save-meta-pill">空槽位</span><span class="save-meta-pill">等待写入</span></div><p id="' + noteId + '" class="save-slot-note">尚未写入本地数据。</p>';
    if (!isAuto) actionHtml = '<button type="button" class="btn-action save-btn" data-slot="' + slot.slotId + '" aria-label="保存到' + _escapeHtml(label) + '" aria-describedby="' + noteId + '">保存</button>';
  } else if (slot.isCorrupted) {
    bodyHtml = '<div class="save-slot-info"><span class="save-meta-pill save-meta-pill--alert">存档已损坏</span><span class="save-meta-pill">请删除或覆盖</span></div><p id="' + noteId + '" class="save-slot-note save-slot-note--alert">' + _escapeHtml(slot.errorMessage || '该槽位数据无法解析。') + '</p>';
    actionHtml = (!isAuto ? '<button type="button" class="btn-action save-btn" data-slot="' + slot.slotId + '" aria-label="覆盖' + _escapeHtml(label) + '" aria-describedby="' + noteId + '">覆盖</button>' : '') +
      '<button type="button" class="btn-action del-btn" data-slot="' + slot.slotId + '" aria-label="删除' + _escapeHtml(label) + '" aria-describedby="' + noteId + '">删除</button>';
  } else {
    var meta = slot.meta || {};
    bodyHtml = '<div class="save-slot-info"><span class="save-meta-pill">保存 ' + _escapeHtml(formatSaveTime(meta.timestampMs)) + '</span><span class="save-meta-pill">资金 ' + _escapeHtml(_formatCredits(meta.credits)) + '</span><span class="save-meta-pill">第 ' + _escapeHtml(meta.day || 1) + ' 天</span></div><p id="' + noteId + '" class="save-slot-note">本地槽位已就绪，可直接读取或覆盖。</p>';
    actionHtml = '<button type="button" class="btn-action load-btn" data-slot="' + slot.slotId + '" aria-label="读取' + _escapeHtml(label) + '" aria-describedby="' + noteId + '">读取</button>' +
      (!isAuto ? '<button type="button" class="btn-action save-btn" data-slot="' + slot.slotId + '" aria-label="覆盖' + _escapeHtml(label) + '" aria-describedby="' + noteId + '">覆盖</button>' : '') +
      '<button type="button" class="btn-action del-btn" data-slot="' + slot.slotId + '" aria-label="删除' + _escapeHtml(label) + '" aria-describedby="' + noteId + '">删除</button>';
  }

  var titleId = 'save-slot-title-' + slot.slotId;
  var stateLabel = state === 'ready' ? '可读取' : (state === 'corrupted' ? '存档异常' : '空槽位');
  return '<article class="save-slot save-slot--' + state + (isAuto ? ' save-slot--auto' : ' save-slot--manual') + '" role="listitem" tabindex="0" data-slot="' + slot.slotId + '" data-save-state="' + state + '" aria-label="' + _escapeHtml(label + '，' + stateLabel) + '" aria-labelledby="' + titleId + '" aria-describedby="' + noteId + '">' +
    '<div class="save-slot-header-row"><div><div class="save-slot-kicker">' + (isAuto ? 'AUTO BACKUP' : 'MANUAL SLOT') + '</div><div id="' + titleId + '" class="save-slot-header">' + _escapeHtml(label) + '</div></div><span class="save-slot-badge save-slot-badge--' + state + '">' + _escapeHtml(badge) + '</span></div>' +
    bodyHtml + _renderSlotActions(actionHtml, label) + '</article>';
}

function _renderExportOptions(slots, preferredSlotId) {
  if (!slots.length) return '<option value="" selected disabled>暂无有效存档</option>';
  return slots.map(function (slot) {
    return '<option value="' + slot.slotId + '"' + (slot.slotId === preferredSlotId ? ' selected' : '') + '>' + _escapeHtml(formatSaveSlotLabel(slot)) + '</option>';
  }).join('');
}

function _renderTransferBar(exportableSlots, preferredSlotId) {
  return '<section class="save-transfer-bar" role="region" aria-label="存档导入导出" aria-describedby="save-transfer-desc save-transfer-status">' +
    '<div class="save-transfer-copy"><div class="save-transfer-title">跨设备迁移</div><p id="save-transfer-desc">导出可选择任意有效槽位；导入只会写入选定的手动槽位。</p><div id="save-transfer-status" class="save-transfer-status" role="status" aria-live="polite"></div></div>' +
    '<div class="save-export-row">' +
      '<div class="save-transfer-control-group" role="group" aria-label="导出存档"><label class="save-export-source" for="save-export-slot-select"><span>导出来源</span><select id="save-export-slot-select" class="save-export-slot-select" aria-label="选择导出来源槽位">' + _renderExportOptions(exportableSlots, preferredSlotId) + '</select></label><button type="button" class="btn-action export-btn" aria-label="导出所选存档" aria-describedby="save-transfer-desc save-transfer-status"' + (exportableSlots.length ? '' : ' disabled aria-disabled="true"') + '>导出存档</button></div>' +
      '<div class="save-transfer-control-group" role="group" aria-label="导入存档"><label class="save-import-target" for="save-import-slot-select"><span>导入到</span><select id="save-import-slot-select" class="save-import-slot-select" aria-label="选择导入目标槽位"><option value="1">槽位 1</option><option value="2">槽位 2</option><option value="3">槽位 3</option></select></label><button type="button" class="btn-action import-btn" aria-label="导入存档文件" aria-describedby="save-transfer-desc save-transfer-status">导入存档</button></div>' +
    '</div>' +
  '</section>';
}

export function buildSaveWorkspaceView(request) {
  var slots = Array.isArray(request && request.slots) ? request.slots : [];
  var context = _buildWorkspaceContext(slots);
  var preferredSlotId = context.autoReady ? 0 : (context.latestSlot ? context.latestSlot.slotId : null);
  var html = '<div class="save-header-row"><div><div class="save-header">存档工作区</div><div class="save-header-subtitle">自动存档、手动槽位与跨设备导入导出都集中在这里。</div></div><div class="save-header-meta" aria-label="本地存档面板"><span>LOCAL</span><span>SAVE</span></div></div>' +
    _renderSafetyPanel(context) + _renderHealthStrip(slots) +
    '<div class="save-slot-grid" role="list" aria-label="本地存档槽位">' + slots.map(_renderSlot).join('') + '</div>' +
    _renderTransferBar(context.readySlots, preferredSlotId);
  return Object.freeze({
    html: html,
    initialStatus: context.readySlots.length ? '已选定导出来源；导入目标可在导入区单独调整。' : '当前没有可导出的有效存档。',
    initialTone: context.readySlots.length ? 'neutral' : 'error',
    preferredExportSlotId: preferredSlotId,
  });
}

export function buildSaveConfirmation(action, slot, fileName) {
  if (!slot) return null;
  var label = formatSaveSlotLabel(slot);
  var existing = slot.isCorrupted ? '损坏存档' : formatSaveTime(slot.meta && slot.meta.timestampMs);
  if (action === 'save') return Object.freeze({
    kicker: '覆盖存档', title: '覆盖' + label + '？', message: '该槽位中的现有进度会被当前公司状态替换。', confirmLabel: '确认覆盖', tone: 'warning',
    details: Object.freeze([{ label: '现有数据', value: existing, tone: 'danger' }, { label: '写入内容', value: '当前公司状态' }]),
  });
  if (action === 'load') return Object.freeze({
    kicker: '切换运行状态', title: '读取' + label + '？', message: '当前未保存的运行进度会被该槽位中的公司状态替换。', confirmLabel: '确认读取', tone: 'warning',
    details: Object.freeze([{ label: '目标存档', value: formatSaveTime(slot.meta && slot.meta.timestampMs) }, { label: '当前运行', value: '未保存变更将丢失', tone: 'danger' }]),
  });
  if (action === 'delete') return Object.freeze({
    kicker: '删除存档', title: '删除' + label + '？', message: '该槽位的数据会从本地设备永久移除。', confirmLabel: '确认删除',
    details: Object.freeze([{ label: '目标槽位', value: label }, { label: '恢复能力', value: '删除后不可恢复', tone: 'danger' }]),
  });
  if (action === 'import') return Object.freeze({
    kicker: '覆盖并导入', title: '导入到' + label + '？', message: '该槽位中的现有进度会被导入文件替换。', confirmLabel: '确认导入', tone: 'warning',
    details: Object.freeze([{ label: '现有数据', value: existing, tone: 'danger' }, { label: '写入内容', value: fileName || '所选存档文件' }]),
  });
  return null;
}
