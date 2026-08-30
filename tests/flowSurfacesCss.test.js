import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const STYLE_ENTRY = readFileSync('css/style.css', 'utf8');
const FLOW_OWNER = 'flow-surfaces.css';
const FLOW_PRIVATE_SELECTOR = /(?:#(?:event|dialogue)-|\.(?:event|dialogue)-|\.choice-(?:text|tooltip)\b)/;

function getRuntimeStyleFiles() {
  return Array.from(STYLE_ENTRY.matchAll(/@import url\("([^"]+)"\)/g), function (match) {
    return match[1];
  });
}

function getPrivateSelectorBranches(file) {
  var root = postcss.parse(readFileSync('css/' + file, 'utf8'), { from: file });
  var branches = [];
  root.walkRules(function (rule) {
    (rule.selectors || [rule.selector]).forEach(function (selector) {
      if (FLOW_PRIVATE_SELECTOR.test(selector)) branches.push(selector);
    });
  });
  return branches;
}

function findLastDeclarations(root, selector, mediaParams) {
  var declarations = null;
  root.walkRules(function (rule) {
    if (!(rule.selectors || []).includes(selector)) return;
    var parent = rule.parent;
    if (mediaParams && (!parent || parent.type !== 'atrule' || parent.params !== mediaParams)) return;
    declarations = Object.create(null);
    rule.walkDecls(function (decl) { declarations[decl.prop] = decl.value; });
  });
  return declarations;
}

describe('Flow Surface CSS ownership', function () {
  it('在全局壳层之后、Settings 与 Save Workspace 之前加载唯一 owner', function () {
    var shellIndex = STYLE_ENTRY.indexOf('@import url("global-shell-v2.css")');
    var flowIndex = STYLE_ENTRY.indexOf('@import url("flow-surfaces.css")');
    var settingsIndex = STYLE_ENTRY.indexOf('@import url("settings-workspace.css")');
    var saveIndex = STYLE_ENTRY.indexOf('@import url("save-workspace.css")');

    expect(flowIndex).toBeGreaterThan(shellIndex);
    expect(settingsIndex).toBeGreaterThan(flowIndex);
    expect(saveIndex).toBeGreaterThan(settingsIndex);
  });

  it('运行时事件、剧情与选择文案私有选择器只存在于 Flow owner', function () {
    getRuntimeStyleFiles().forEach(function (file) {
      var branches = getPrivateSelectorBranches(file);
      if (file === FLOW_OWNER) {
        expect(branches.length).toBeGreaterThan(150);
        return;
      }
      expect(branches, file).toEqual([]);
    });
  });

  it('owner 固化单滚动区、完整移动摘要、隐藏动作和 44px 触控契约', function () {
    var css = readFileSync('css/' + FLOW_OWNER, 'utf8');
    var root = postcss.parse(css, { from: FLOW_OWNER });
    var compactImpact = findLastDeclarations(root, '.event-impact-panel', '(max-width: 620px)');
    var compactBranch = findLastDeclarations(root, '.dialogue-branch-panel', '(max-width: 620px)');

    [
      '.modal > .event-modal-box',
      '.modal > .dialogue-modal-box',
      '.event-modal-box .stack-modal-scroll',
      'grid-auto-rows: max-content;',
      'scroll-padding-block: 12px;',
      '.dialogue-actions > button.hidden',
      '.dialogue-modal-box[data-dialogue-mode="choice"] .dialogue-actions',
      'min-height: var(--ui-control-lg, 44px);',
      'align-self: center;',
      'body[data-motion="reduced"] .dialogue-modal-box',
    ].forEach(function (anchor) {
      expect(css).toContain(anchor);
    });
    expect(compactImpact).toMatchObject({
      'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
      'overflow-x': 'hidden',
    });
    expect(compactBranch).toMatchObject({
      'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
      'overflow-x': 'hidden',
    });
    expect(css).not.toMatch(/@media \(max-width: 360px\)[\s\S]{0,240}\.(?:event-summary|dialogue-summary)/);
  });
});
