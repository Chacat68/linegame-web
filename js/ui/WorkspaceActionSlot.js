// js/ui/WorkspaceActionSlot.js — L3/L4 内局部操作槽的纯 HTML 契约
//
// Action Guide 是唯一全局行动权威；本模块只描述当前工作区对象的局部操作。

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _attributeName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_:\-.]/g, '');
}

function _classes(values) {
  return (Array.isArray(values) ? values : [values]).filter(Boolean).flatMap(function (value) {
    return String(value).trim().split(/\s+/);
  }).map(function (value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '');
  }).filter(Boolean).join(' ');
}

function _buildAttributes(attributes) {
  return Object.entries(attributes || {}).map(function (entry) {
    var name = _attributeName(entry[0]);
    if (!name || entry[1] == null || entry[1] === false) return '';
    if (entry[1] === true) return ' ' + name;
    return ' ' + name + '="' + _escapeHtml(entry[1]) + '"';
  }).join('');
}

function _buildAction(action) {
  if (!action || !action.id || !action.label) return '';
  var disabled = action.disabled ? ' disabled aria-disabled="true"' : '';
  var title = action.title ? ' title="' + _escapeHtml(action.title) + '"' : '';
  var variant = action.variant ? ' workspace-action-slot__action--' + _classes(action.variant) : '';
  var className = 'workspace-action-slot__action' + variant;
  var extraClasses = _classes(action.className);
  if (extraClasses) className += ' ' + extraClasses;
  return '<button class="' + className + '" type="button" data-workspace-action-id="' +
    _escapeHtml(action.id) + '"' + _buildAttributes(action.attributes) + disabled + title + '>' +
    _escapeHtml(action.label) + '</button>';
}

export function buildWorkspaceActionSlot(options) {
  var opts = options || {};
  var workspaceId = String(opts.workspaceId || '').trim();
  var actions = (Array.isArray(opts.actions) ? opts.actions : []).map(_buildAction).filter(Boolean);
  if (!workspaceId || actions.length === 0) return '';
  var contextType = String(opts.contextType || '').trim();
  var contextId = String(opts.contextId || '').trim();
  var label = String(opts.label || '局部操作').trim();
  var classes = 'workspace-action-slot';
  var extraClasses = _classes(opts.className);
  if (extraClasses) classes += ' ' + extraClasses;
  var actionClasses = 'workspace-action-slot__actions';
  var extraActionClasses = _classes(opts.actionsClassName);
  if (extraActionClasses) actionClasses += ' ' + extraActionClasses;
  var noteClasses = 'workspace-action-slot__note';
  var extraNoteClasses = _classes(opts.noteClassName);
  if (extraNoteClasses) noteClasses += ' ' + extraNoteClasses;
  var note = opts.note
    ? '<p class="' + noteClasses + '">' + _escapeHtml(opts.note) + '</p>'
    : '';

  return '<section class="' + classes + '" data-workspace-action-slot data-action-scope="local"' +
    ' data-workspace-id="' + _escapeHtml(workspaceId) + '"' +
    (contextType ? ' data-context-type="' + _escapeHtml(contextType) + '"' : '') +
    (contextId ? ' data-context-id="' + _escapeHtml(contextId) + '"' : '') +
    ' aria-label="' + _escapeHtml(label) + '">' +
      '<div class="' + actionClasses + '">' + actions.join('') + '</div>' +
      note +
    '</section>';
}
