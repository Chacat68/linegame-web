import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const STYLE_ENTRY = readFileSync('css/style.css', 'utf8');
const SETTINGS_OWNER = 'settings-workspace.css';
const SAVE_OWNER = 'save-workspace.css';
const SETTINGS_PRIVATE_SELECTOR = /(?:#settings-|\.settings-)/;
const SAVE_PRIVATE_SELECTOR = /(?:\.save-|#save-list\b|\.settings-save-shell\b|\.(?:load|import|export|del)-btn\b)/;
const RETIRED_SETTINGS_SELECTOR = /\.(?:setting-row|settings-actions|settings-body|settings-card|settings-header|settings-modal-actions|settings-modal-body|settings-modal-header|settings-section|settings-storage-card|settings-storage-head)\b/;

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
      if (SETTINGS_PRIVATE_SELECTOR.test(selector)) branches.push(selector);
    });
  });
  return branches;
}

describe('Settings Workspace CSS ownership', function () {
  it('在全局壳层之后、Save Workspace 之前加载唯一设置 owner', function () {
    var shellIndex = STYLE_ENTRY.indexOf('@import url("global-shell-v2.css")');
    var settingsIndex = STYLE_ENTRY.indexOf('@import url("settings-workspace.css")');
    var saveIndex = STYLE_ENTRY.indexOf('@import url("save-workspace.css")');

    expect(settingsIndex).toBeGreaterThan(shellIndex);
    expect(saveIndex).toBeGreaterThan(settingsIndex);
  });

  it('运行时设置私有选择器只存在于设置 owner 或 Save 子组件 owner', function () {
    getRuntimeStyleFiles().forEach(function (file) {
      var branches = getPrivateSelectorBranches(file);
      if (file === SETTINGS_OWNER) {
        expect(branches.length).toBeGreaterThan(0);
        return;
      }
      if (file === SAVE_OWNER) {
        branches.forEach(function (selector) {
          expect(selector, file + ': ' + selector).toMatch(SAVE_PRIVATE_SELECTOR);
        });
        return;
      }
      expect(branches, file).toEqual([]);
    });
  });

  it('owner 覆盖弹层、分页、延迟状态、焦点和紧凑摘要契约且不保留退役类', function () {
    var css = readFileSync('css/' + SETTINGS_OWNER, 'utf8');
    [
      '#settings-modal .settings-modal-box',
      '.settings-nav-item[aria-selected="true"]',
      '#settings-modal[data-deferred-feature-state] .settings-layout',
      '.settings-panel-page:focus-visible',
      '.settings-toggle:focus-visible',
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
      'min-height: var(--ui-control-lg);',
    ].forEach(function (anchor) {
      expect(css).toContain(anchor);
    });
    expect(css).not.toMatch(/\.settings-overview-strip\s*\{[^}]*grid-template-columns:\s*1fr;/);
    expect(css).not.toMatch(RETIRED_SETTINGS_SELECTOR);
  });
});
