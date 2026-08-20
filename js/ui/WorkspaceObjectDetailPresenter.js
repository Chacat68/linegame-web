// js/ui/WorkspaceObjectDetailPresenter.js — 工作区对象 L4 通用纯视图投影
//
// 任务、科技、派系、成就和探索报告仍由各自领域 UI 负责选择数据；
// 本模块只把已归一化的事实投影为同一套 L4 信息结构。

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  var label = String(entry.label == null ? '' : entry.label).trim();
  var value = String(entry.value == null ? '' : entry.value).trim();
  if (!label || !value) return null;
  return {
    label: label,
    value: value,
    detail: String(entry.detail == null ? '' : entry.detail).trim(),
  };
}

function _normalizeEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map(_normalizeEntry).filter(Boolean);
}

function _renderHero(model) {
  return '<div class="workspace-context-hero"><span aria-hidden="true">' +
    _escapeHtml(model.icon || '📚') + '</span><div><small>' +
    _escapeHtml(model.eyebrow || model.kindLabel || '档案对象') + '</small><h3>' +
    _escapeHtml(model.title) + '</h3></div></div>';
}

function _renderMetrics(metrics) {
  if (!metrics.length) return '';
  return '<div class="workspace-context-metrics" role="list">' + metrics.map(function (metric) {
    return '<span role="listitem"><small>' + _escapeHtml(metric.label) + '</small><strong>' +
      _escapeHtml(metric.value) + '</strong></span>';
  }).join('') + '</div>';
}

function _renderTags(tags) {
  var normalized = (Array.isArray(tags) ? tags : []).map(function (tag) {
    return String(tag == null ? '' : tag).trim();
  }).filter(Boolean);
  if (!normalized.length) return '';
  return '<div class="workspace-context-tags" aria-label="对象标签">' + normalized.map(function (tag) {
    return '<span>' + _escapeHtml(tag) + '</span>';
  }).join('') + '</div>';
}

function _renderFacts(facts, ariaLabel) {
  if (!facts.length) return '';
  return '<div class="workspace-detail-entity-grid workspace-detail-object-grid" role="list" aria-label="' +
    _escapeHtml(ariaLabel) + '">' + facts.map(function (fact) {
      return '<article role="listitem"><small>' + _escapeHtml(fact.label) + '</small><strong>' +
        _escapeHtml(fact.value) + '</strong>' +
        (fact.detail ? '<span>' + _escapeHtml(fact.detail) + '</span>' : '') + '</article>';
    }).join('') + '</div>';
}

export function buildWorkspaceObjectDetailView(input) {
  var source = input || {};
  var id = String(source.id == null ? '' : source.id).trim();
  var title = String(source.title == null ? '' : source.title).trim();
  var kind = String(source.kind == null ? '' : source.kind).trim();
  if (!id || !title || !kind) return null;

  var model = {
    id: id,
    kind: kind,
    kindLabel: String(source.kindLabel == null ? '档案' : source.kindLabel).trim() || '档案',
    eyebrow: String(source.eyebrow == null ? '' : source.eyebrow).trim(),
    icon: String(source.icon == null ? '📚' : source.icon),
    title: title,
    description: String(source.description == null ? '暂无档案说明。' : source.description),
    metrics: _normalizeEntries(source.metrics),
    facts: _normalizeEntries(source.facts),
    tags: source.tags,
    note: String(source.note == null ? '该详情只陈述档案事实；领域动作仍在档案工作区内确认。' : source.note),
  };
  var detailLabel = String(source.detailLabel == null ? model.kindLabel + '详情' : source.detailLabel).trim();

  return {
    title: model.title + ' · ' + detailLabel,
    html: '<section class="workspace-detail-section workspace-detail-section--object" data-workspace-object-detail="' +
      _escapeHtml(model.id) + '" data-workspace-object-kind="' + _escapeHtml(model.kind) + '">' +
      '<div class="workspace-detail-intro">' + _renderHero(model) +
        '<p>' + _escapeHtml(model.description) + '</p></div>' +
      _renderMetrics(model.metrics) +
      _renderTags(model.tags) +
      _renderFacts(model.facts, model.title + model.kindLabel + '事实') +
      '<p class="workspace-detail-note">' + _escapeHtml(model.note) + '</p>' +
    '</section>',
  };
}
