import { describe, expect, it, vi } from 'vitest';
import { createMarketWorkspaceSession } from '../js/ui/MarketWorkspaceSession.js';
import {
  createMarketWorkspaceNavigation,
  handleMarketRovingControlKeydown,
} from '../js/ui/MarketWorkspaceNavigation.js';

function createProgression() {
  return {
    workspace: {
      spot: { unlocked: true },
      capital: { unlocked: false },
      operations: { unlocked: true },
    },
    subworkspace: {
      spot: {
        trade: { unlocked: true },
        intel: { unlocked: true },
        black: { unlocked: false },
      },
      capital: {
        local: { unlocked: false, unlockLabel: '<公司 Lv.2>', lockDetail: '贷款 & 投资' },
      },
      operations: {
        local: { unlocked: true },
        network: { unlocked: false },
        stations: { unlocked: true },
      },
    },
  };
}

describe('MarketWorkspaceNavigation', function () {
  it('锁定的一级和二级入口会回退到首个可用工作区', function () {
    var session = createMarketWorkspaceSession();
    var progression = createProgression();
    var navigation = createMarketWorkspaceNavigation({ session: session });
    session.setProgression(progression);
    session.setWorkspace('capital');

    expect(navigation.ensureWorkspaceState(progression)).toBe('spot');
    expect(session.getWorkspace()).toBe('spot');

    session.setWorkspace('operations');
    session.setSubworkspace('operations', 'network');
    expect(navigation.ensureWorkspaceState(progression)).toBe('operations');
    expect(session.getSubworkspace('operations')).toBe('local');

    expect(navigation.setFocus({ workspaceId: 'capital', subworkspaceId: 'local' })).toBe(true);
    expect(navigation.getActiveFocus()).toEqual({
      workspaceId: 'spot',
      subworkspaceId: 'trade',
      marketMode: 'open',
    });
  });

  it('二级菜单生成稳定 tabpanel 语义并转义锁定说明', function () {
    var session = createMarketWorkspaceSession();
    var progression = createProgression();
    var navigation = createMarketWorkspaceNavigation({ session: session });

    var html = navigation.renderSubworkspace('capital', { local: '<p>不应显示</p>' }, progression);

    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('disabled aria-disabled="true"');
    expect(html).toContain('&lt;公司 Lv.2&gt;');
    expect(html).toContain('贷款 &amp; 投资');
    expect(html).not.toContain('<p>不应显示</p>');
  });

  it('方向键漫游跳过禁用项并把选择与焦点交给同一激活端口', function () {
    var first = { disabled: false, dataset: {}, focus: vi.fn() };
    var locked = { disabled: true, dataset: { marketLocked: 'true' }, focus: vi.fn() };
    var last = { disabled: false, dataset: {}, focus: vi.fn() };
    var activate = vi.fn();
    var preventDefault = vi.fn();

    expect(handleMarketRovingControlKeydown(
      { key: 'ArrowRight', preventDefault: preventDefault },
      first,
      [first, locked, last],
      activate
    )).toBe(true);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledWith(last);
    expect(last.focus).toHaveBeenCalledTimes(1);
    expect(locked.focus).not.toHaveBeenCalled();
  });
});
