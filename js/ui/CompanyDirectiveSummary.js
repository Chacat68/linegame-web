// js/ui/CompanyDirectiveSummary.js — 首屏公司指令按钮的轻量状态摘要

import { getCompanyDirectiveBoard } from '../systems/company/CompanyDirectiveSystem.js';
import { getTrackedDirectiveId } from '../core/CompanyDirectiveFocus.js';

export function renderCompanyDirectiveSummary(state, preparedBoard) {
  if (typeof document === 'undefined') return;
  var button = document.getElementById('company-directives-btn');
  if (!button) return;

  var board = preparedBoard || getCompanyDirectiveBoard(state || {});
  var trackedId = getTrackedDirectiveId();
  var tracked = (board.directives || []).find(function (directive) {
    return directive && directive.id === trackedId;
  }) || null;
  var claimableCount = Math.max(0, Number(board.claimableCount) || 0);
  var trackedActive = !!tracked && !tracked.completed;
  var trackedProgress = tracked ? Math.floor(Math.max(0, Math.min(1, tracked.progressRatio || 0)) * 100) : 0;

  button.classList.toggle('is-tracking', trackedActive && claimableCount === 0);
  button.classList.toggle('has-claimable', claimableCount > 0);
  if (claimableCount > 0) button.dataset.companyDirectiveBadge = String(claimableCount);
  else delete button.dataset.companyDirectiveBadge;

  var title = claimableCount > 0
    ? ('公司指令：' + claimableCount + ' 项奖励可领取')
    : (tracked ? ('公司指令：追踪 ' + tracked.title + ' · ' + trackedProgress + '%') : '公司指令');
  var ariaLabel = claimableCount > 0
    ? ('公司指令，' + claimableCount + ' 项奖励可领取')
    : (tracked ? ('公司指令，正在追踪' + tracked.title + '，进度 ' + trackedProgress + '%') : '公司指令');
  button.setAttribute('title', title);
  button.setAttribute('aria-label', ariaLabel);
}
