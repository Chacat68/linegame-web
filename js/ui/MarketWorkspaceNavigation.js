// js/ui/MarketWorkspaceNavigation.js — 商业终端一级/二级菜单与可访问性交互 owner
// 依赖注入 workspace session 和商品聚焦效果；不读取领域状态，也不执行交易 command。

const MARKET_WORKSPACE_TABS = [
  { id: 'spot', label: '交易', hint: '买卖与补给', stage: '01' },
  { id: 'capital', label: '资金', hint: '贷款与投资', stage: '03' },
  { id: 'operations', label: '贸易站', hint: '建站与经营', stage: '04' },
];

const MARKET_SUBWORKSPACE_TABS = {
  spot: [
    { id: 'trade', label: '交易', hint: '执行买卖与补给' },
    { id: 'intel', label: '行情', hint: '价格与地点信息' },
    { id: 'black', label: '黑市', hint: '特殊市场与风险' },
  ],
  capital: [
    { id: 'local', label: '贷款与投资', hint: '管理本地资金' },
  ],
  operations: [
    { id: 'local', label: '本地', hint: '当前地点经营' },
    { id: 'network', label: '总览', hint: '全部贸易站' },
    { id: 'stations', label: '批量管理', hint: '候选与已建站点' },
  ],
};

function _hasDocument() {
  return typeof document !== 'undefined';
}

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function handleMarketRovingControlKeydown(event, currentButton, buttons, onActivate) {
  var key = event && event.key;
  if (key !== 'ArrowRight' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') {
    return false;
  }

  var enabledButtons = Array.prototype.slice.call(buttons || []).filter(function (button) {
    return button && !button.disabled && button.dataset.marketLocked !== 'true';
  });
  if (enabledButtons.length === 0) return false;

  var currentIndex = enabledButtons.indexOf(currentButton);
  if (currentIndex < 0) currentIndex = 0;
  var nextIndex = currentIndex;
  if (key === 'ArrowRight' || key === 'ArrowDown') nextIndex = (currentIndex + 1) % enabledButtons.length;
  else if (key === 'ArrowLeft' || key === 'ArrowUp') nextIndex = (currentIndex - 1 + enabledButtons.length) % enabledButtons.length;
  else if (key === 'Home') nextIndex = 0;
  else if (key === 'End') nextIndex = enabledButtons.length - 1;

  if (typeof event.preventDefault === 'function') event.preventDefault();
  var nextButton = enabledButtons[nextIndex];
  onActivate(nextButton);
  if (typeof nextButton.focus === 'function') nextButton.focus();
  return true;
}

export function createMarketWorkspaceNavigation(options) {
  var opts = options || {};
  var session = opts.session;
  var revealMarketGoodFocus = typeof opts.revealMarketGoodFocus === 'function'
    ? opts.revealMarketGoodFocus
    : function () { return false; };
  var clearMarketGuideFocus = typeof opts.clearMarketGuideFocus === 'function'
    ? opts.clearMarketGuideFocus
    : function () {};

  function isWorkspaceUnlocked(workspaceId, progression) {
    if (!progression || !progression.workspace || !progression.workspace[workspaceId]) return true;
    return progression.workspace[workspaceId].unlocked !== false;
  }

  function getFirstUnlockedWorkspace(progression) {
    var first = MARKET_WORKSPACE_TABS.find(function (entry) {
      return isWorkspaceUnlocked(entry.id, progression);
    });
    return first ? first.id : 'spot';
  }

  function getSubworkspaceTabs(workspaceId, progression) {
    var tabs = MARKET_SUBWORKSPACE_TABS[workspaceId] || [];
    return tabs.map(function (entry) {
      var workspaceAccess = progression && progression.subworkspace ? progression.subworkspace[workspaceId] : null;
      var access = workspaceAccess ? workspaceAccess[entry.id] : null;
      return Object.assign({}, entry, {
        unlocked: !access || access.unlocked !== false,
        stateLabel: access && access.stateLabel ? access.stateLabel : '已开放',
        unlockLabel: access && access.unlockLabel ? access.unlockLabel : '',
        lockDetail: access && access.lockDetail ? access.lockDetail : '',
      });
    });
  }

  function ensureSubworkspaceState(workspaceId, progression) {
    var tabs = getSubworkspaceTabs(workspaceId, progression);
    if (tabs.length === 0) return '';
    var activeTab = session.getSubworkspace(workspaceId);
    if (!tabs.some(function (entry) { return entry.id === activeTab && entry.unlocked !== false; })) {
      var firstUnlocked = tabs.find(function (entry) { return entry.unlocked !== false; });
      activeTab = (firstUnlocked || tabs[0]).id;
      session.setSubworkspace(workspaceId, activeTab);
    }
    return activeTab;
  }

  function ensureWorkspaceState(progression) {
    var activeWorkspace = session.getWorkspace();
    if (!MARKET_WORKSPACE_TABS.some(function (entry) { return entry.id === activeWorkspace; })) {
      activeWorkspace = session.setWorkspace('spot');
    }
    if (!isWorkspaceUnlocked(activeWorkspace, progression)) {
      activeWorkspace = session.setWorkspace(getFirstUnlockedWorkspace(progression));
    }
    ensureSubworkspaceState(activeWorkspace, progression);
    return activeWorkspace;
  }

  function normalizeFocus(focus, progression) {
    if (!focus || typeof focus !== 'object') return null;

    var workspaceId = typeof focus.workspaceId === 'string' ? focus.workspaceId : '';
    if (!MARKET_WORKSPACE_TABS.some(function (entry) { return entry.id === workspaceId; })) return null;
    if (!isWorkspaceUnlocked(workspaceId, progression)) {
      workspaceId = getFirstUnlockedWorkspace(progression);
    }

    var subworkspaceTabs = getSubworkspaceTabs(workspaceId, progression);
    var subworkspaceId = typeof focus.subworkspaceId === 'string' ? focus.subworkspaceId : '';
    if (subworkspaceTabs.length > 0 && !subworkspaceTabs.some(function (entry) { return entry.id === subworkspaceId && entry.unlocked !== false; })) {
      var firstUnlocked = subworkspaceTabs.find(function (entry) { return entry.unlocked !== false; });
      subworkspaceId = (firstUnlocked || subworkspaceTabs[0]).id;
    }

    return {
      workspaceId: workspaceId,
      subworkspaceId: subworkspaceTabs.length > 0 ? subworkspaceId : '',
      goodId: typeof focus.goodId === 'string' ? focus.goodId.trim() : '',
      tradeAction: typeof focus.tradeAction === 'string' ? focus.tradeAction.trim() : '',
    };
  }

  function applySubworkspaceTabState(container, workspaceId, progression) {
    if (!container || !workspaceId) return;

    var activeTab = ensureSubworkspaceState(workspaceId, progression);
    container.querySelectorAll('[data-market-subworkspace-tab="' + workspaceId + '"]').forEach(function (entry) {
      var isActive = entry.dataset.marketSubworkspaceId === activeTab;
      entry.classList.toggle('active', isActive);
      entry.setAttribute('aria-selected', isActive ? 'true' : 'false');
      entry.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    container.querySelectorAll('[data-market-subworkspace-pane="' + workspaceId + '"]').forEach(function (pane) {
      var isActive = pane.dataset.marketSubworkspaceId === activeTab;
      pane.classList.toggle('hidden', !isActive);
      pane.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      pane.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  function applyWorkspaceTabState(progression) {
    if (!_hasDocument()) return;

    if (progression) ensureWorkspaceState(progression);
    var activeWorkspace = session.getWorkspace();
    var tabs = document.getElementById('market-workspace-tabs');
    var paneMap = {
      spot: document.getElementById('market-spot-pane'),
      capital: document.getElementById('market-capital-pane'),
      operations: document.getElementById('market-operations-pane'),
    };

    if (tabs) {
      tabs.querySelectorAll('[data-market-workspace-tab]').forEach(function (button) {
        var isActive = button.dataset.marketWorkspaceTab === activeWorkspace;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        button.setAttribute('tabindex', isActive ? '0' : '-1');
      });
    }

    Object.keys(paneMap).forEach(function (key) {
      if (!paneMap[key]) return;
      var isActive = key === activeWorkspace;
      paneMap[key].classList.toggle('hidden', !isActive);
      paneMap[key].setAttribute('aria-labelledby', 'market-workspace-tab-' + key);
      paneMap[key].setAttribute('aria-hidden', isActive ? 'false' : 'true');
      paneMap[key].setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  function setFocus(focus) {
    var progression = session.getProgression();
    var normalized = normalizeFocus(focus, progression);
    if (!normalized) return false;

    session.setWorkspace(normalized.workspaceId);
    if (normalized.subworkspaceId) {
      session.setSubworkspace(normalized.workspaceId, normalized.subworkspaceId);
    }

    if (_hasDocument()) {
      applyWorkspaceTabState(progression);
      applySubworkspaceTabState(
        document.getElementById('market-' + normalized.workspaceId + '-pane'),
        normalized.workspaceId,
        progression
      );
      if (normalized.goodId) {
        revealMarketGoodFocus(normalized.goodId, { tradeAction: normalized.tradeAction });
      } else {
        clearMarketGuideFocus();
      }
    }

    return true;
  }

  function getActiveFocus() {
    var workspaceId = session.getWorkspace() || 'spot';
    var subworkspaceId = session.getSubworkspace(workspaceId);
    return {
      workspaceId: workspaceId,
      subworkspaceId: subworkspaceId,
      marketMode: subworkspaceId === 'black' ? 'black' : 'open',
    };
  }

  function getWorkspaceTabs(progression) {
    return MARKET_WORKSPACE_TABS.map(function (entry) {
      var access = progression && progression.workspace ? progression.workspace[entry.id] : null;
      return Object.assign({}, entry, {
        unlocked: !access || access.unlocked !== false,
        stateLabel: access && access.stateLabel ? access.stateLabel : '已开放',
        unlockLabel: access && access.unlockLabel ? access.unlockLabel : '',
        lockDetail: access && access.lockDetail ? access.lockDetail : '',
      });
    });
  }

  function renderWorkspaceTabs(progression) {
    if (!_hasDocument()) return;
    var tabs = document.getElementById('market-workspace-tabs');
    if (!tabs) return;

    ensureWorkspaceState(progression);
    var activeWorkspace = session.getWorkspace();
    tabs.innerHTML = getWorkspaceTabs(progression).map(function (entry) {
      var locked = entry.unlocked === false;
      var active = entry.id === activeWorkspace;
      var tabId = 'market-workspace-tab-' + entry.id;
      var paneId = 'market-' + entry.id + '-pane';
      return '<button id="' + tabId + '" class="market-workspace-tab' + (active ? ' active' : '') + (locked ? ' is-locked' : '') + '" type="button" role="tab" aria-controls="' + paneId + '" aria-selected="' + (active ? 'true' : 'false') + '" tabindex="' + (active ? '0' : '-1') + '" data-market-workspace-tab="' + entry.id + '" data-market-locked="' + (locked ? 'true' : 'false') + '"' + (locked ? ' disabled aria-disabled="true"' : '') + '>' +
        '<span class="market-workspace-tab-stage">' + entry.stage + '</span>' +
        '<span class="market-workspace-tab-copy">' +
          '<span class="market-workspace-tab-label">' + entry.label + '</span>' +
          '<span class="market-workspace-tab-hint">' + entry.hint + '</span>' +
        '</span>' +
        '<span class="market-workspace-tab-state">' + (locked ? entry.unlockLabel : entry.stateLabel) + '</span>' +
      '</button>';
    }).join('');

    var workspaceButtons = tabs.querySelectorAll('[data-market-workspace-tab]');
    function activateWorkspace(button) {
      if (button.disabled || button.dataset.marketLocked === 'true') return;
      var workspaceId = session.setWorkspace(button.dataset.marketWorkspaceTab || 'spot');
      ensureSubworkspaceState(workspaceId, progression);
      applyWorkspaceTabState(progression);
    }

    workspaceButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        activateWorkspace(button);
      });
      button.addEventListener('keydown', function (event) {
        handleMarketRovingControlKeydown(event, button, workspaceButtons, activateWorkspace);
      });
    });

    applyWorkspaceTabState(progression);
  }

  function renderLockedPane(entry) {
    return '<section class="market-locked-pane">' +
      '<div class="market-locked-pane-mark">LOCK</div>' +
      '<div class="market-locked-pane-copy">' +
        '<div class="market-locked-pane-title">' + _escapeHtml(entry.label) + ' 暂未开放</div>' +
        '<div class="market-locked-pane-text">为了让市场体验按顺序展开，这个功能会在完成前置进度后加入终端。</div>' +
        '<div class="market-locked-pane-condition">' + _escapeHtml(entry.unlockLabel || '继续推进贸易路线') + '</div>' +
        (entry.lockDetail ? '<div class="market-locked-pane-path">' + _escapeHtml(entry.lockDetail) + '</div>' : '') +
      '</div>' +
    '</section>';
  }

  function renderSubworkspace(workspaceId, sections, progression) {
    var tabs = getSubworkspaceTabs(workspaceId, progression);
    if (tabs.length === 0) return '';

    var activeTab = ensureSubworkspaceState(workspaceId, progression);

    return '<div class="market-subworkspace" data-market-subworkspace="' + workspaceId + '">' +
      '<div class="market-subworkspace-tabs" role="tablist" aria-label="' + workspaceId + ' 二级菜单">' +
        tabs.map(function (entry) {
          var locked = entry.unlocked === false;
          var active = entry.id === activeTab;
          var tabId = 'market-subworkspace-tab-' + workspaceId + '-' + entry.id;
          var paneId = 'market-subworkspace-pane-' + workspaceId + '-' + entry.id;
          return '<button id="' + tabId + '" class="market-subworkspace-tab' + (active ? ' active' : '') + (locked ? ' is-locked' : '') + '" type="button" role="tab" aria-controls="' + paneId + '" aria-selected="' + (active ? 'true' : 'false') + '" tabindex="' + (active ? '0' : '-1') + '" data-market-subworkspace-tab="' + workspaceId + '" data-market-subworkspace-id="' + entry.id + '" data-market-locked="' + (locked ? 'true' : 'false') + '"' + (locked ? ' disabled aria-disabled="true"' : '') + '>' +
            '<span class="market-subworkspace-tab-label">' + entry.label + '</span>' +
            '<span class="market-subworkspace-tab-hint">' + entry.hint + '</span>' +
            '<span class="market-subworkspace-tab-state">' + (locked ? entry.unlockLabel : entry.stateLabel) + '</span>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="market-subworkspace-panes">' +
        tabs.map(function (entry) {
          var active = entry.id === activeTab;
          return '<div id="market-subworkspace-pane-' + workspaceId + '-' + entry.id + '" class="market-subworkspace-pane' + (active ? '' : ' hidden') + '" role="tabpanel" aria-labelledby="market-subworkspace-tab-' + workspaceId + '-' + entry.id + '" aria-hidden="' + (active ? 'false' : 'true') + '" tabindex="' + (active ? '0' : '-1') + '" data-market-subworkspace-pane="' + workspaceId + '" data-market-subworkspace-id="' + entry.id + '">' +
            (entry.unlocked === false ? renderLockedPane(entry) : (sections[entry.id] || '<div class="market-finance-empty">该分区暂无可用内容。</div>')) +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  function bindSubworkspaceTabs(container, progression) {
    if (!container) return;

    var subworkspaceButtons = container.querySelectorAll('[data-market-subworkspace-tab]');
    function activateSubworkspace(button) {
      if (button.disabled || button.dataset.marketLocked === 'true') return;
      var workspaceId = button.dataset.marketSubworkspaceTab;
      var tabId = button.dataset.marketSubworkspaceId;
      if (!workspaceId || !tabId) return;
      session.setSubworkspace(workspaceId, tabId);
      applySubworkspaceTabState(container, workspaceId, progression);
    }

    subworkspaceButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        activateSubworkspace(button);
      });
      button.addEventListener('keydown', function (event) {
        var workspaceId = button.dataset.marketSubworkspaceTab;
        var workspaceButtons = Array.prototype.slice.call(subworkspaceButtons).filter(function (entry) {
          return entry.dataset.marketSubworkspaceTab === workspaceId;
        });
        handleMarketRovingControlKeydown(event, button, workspaceButtons, activateSubworkspace);
      });
    });
  }

  return Object.freeze({
    applyWorkspaceTabState: applyWorkspaceTabState,
    bindSubworkspaceTabs: bindSubworkspaceTabs,
    ensureWorkspaceState: ensureWorkspaceState,
    getActiveFocus: getActiveFocus,
    renderSubworkspace: renderSubworkspace,
    renderWorkspaceTabs: renderWorkspaceTabs,
    setFocus: setFocus,
  });
}
