import { describe, expect, it } from 'vitest';
import { createTestState } from './helpers.js';
import { renderCompanyNetWorth, renderCompanyOverview } from '../js/ui/CompanyOverviewPresenter.js';

function createElement() {
  var attributes = Object.create(null);
  return {
    innerHTML: '',
    style: {},
    textContent: '',
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) { return attributes[name]; },
  };
}

function createDocument(ids) {
  var elements = Object.create(null);
  ids.forEach(function (id) { elements[id] = createElement(); });
  return {
    elements: elements,
    getElementById: function (id) { return elements[id] || null; },
  };
}

describe('CompanyOverviewPresenter', function () {
  it('Header 公司身份与机库经营详情共享同一 state 投影但不复制声望', function () {
    var doc = createDocument([
      'company-name-text', 'net-worth', 'player-level-panel', 'company-level-line',
      'company-level-fill', 'company-level-track', 'company-unlock-roadmap',
    ]);
    var state = createTestState({
      companyName: '远航联合体',
      companyLevel: 2,
      companyExperience: 280,
      experience: 140,
      reputation: 400,
      fleetSlots: 2,
      tradeStations: { sol_prime: { systemId: 'sol_prime', level: 1 } },
    });

    expect(renderCompanyOverview(state, doc)).toBe(true);
    expect(renderCompanyNetWorth(98765.8, doc)).toBe(true);
    expect(doc.elements['company-name-text'].textContent).toBe('远航联合体');
    expect(doc.elements['company-name-text'].getAttribute('title')).toBe('远航联合体');
    expect(doc.elements['net-worth'].textContent).toBe('98,765');
    expect(doc.elements['net-worth'].getAttribute('title')).toBe('公司净资产：98,765');
    expect(doc.elements['player-level-panel'].innerHTML).toContain('level-title');
    expect(doc.elements['player-level-panel'].innerHTML).not.toContain('rep-badge');
    expect(doc.elements['company-unlock-roadmap'].innerHTML).toContain('等级开放功能');
    expect(doc.elements['company-level-track'].getAttribute('aria-valuetext')).toBe('公司等级 2，160/180');
  });
});
