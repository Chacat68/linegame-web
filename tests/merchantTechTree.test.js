import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../js/data/constants.js';
import { MERCHANT_TECHS } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import * as Save from '../js/systems/save/SaveSystem.js';
import { getPendingTechChain, isValidTechSnapshot } from '../js/systems/merchant/MerchantTechnology.js';
import { buildMerchantTechTree, getTechTreeRelations } from '../js/ui/MerchantTechTreeProjection.js';
import { historicalResearch, researchChain } from './helpers/merchantResearch.js';

const at = 1_800_000_000_000;
const fresh = (level = 100) => {
  const state = createInitialState({ credits: 10_000_000 });
  Merchant.init(state, at); state.merchant.companyLevel = level;
  return state;
};
beforeEach(() => localStorage.clear());

describe('按公司等级推进的科技树', () => {
  it('65 个节点可通过有向无环前置逐一到达，所有前置不晚于目标等级', () => {
    const ids = new Set(MERCHANT_TECHS.map(tech => tech.id));
    for (const tech of MERCHANT_TECHS) {
      const chain = getPendingTechChain({ researchedTechIds: [] }, tech.id);
      const completed = new Set();
      for (const item of chain) {
        expect(completed.has(item.id)).toBe(false);
        for (const parent of item.requires) {
          expect(ids.has(parent)).toBe(true);
          expect(Merchant.getTech(parent).companyLevel).toBeLessThanOrEqual(item.companyLevel);
          expect(completed.has(parent)).toBe(true);
        }
        completed.add(item.id);
      }
      expect(chain.at(-1).id).toBe(tech.id);
    }
    expect(MERCHANT_TECHS.filter(tech => tech.milestone)).toHaveLength(8);
  });

  it('等级和资金都充足时仍不能绕过扩容、勘察与进阶船型的任一前置，失败完整保留账本', () => {
    for (const tech of MERCHANT_TECHS.filter(item => item.milestone)) {
      const initial = fresh();
      researchChain(initial, tech.id, { includeTarget: false });
      for (const parent of tech.requires) {
        const state = structuredClone(initial);
        state.merchant.researchedTechIds = state.merchant.researchedTechIds.filter(id => id !== parent);
        const before = structuredClone(state);
        const result = Merchant.command(state, 'researchTech', { techId: tech.id }, at);
        expect(result).toMatchObject({ ok: false, msg: expect.stringContaining(Merchant.getTech(parent).name) });
        expect(state).toEqual(before);
      }
      expect(Merchant.command(initial, 'researchTech', { techId: tech.id }, at).ok).toBe(true);
    }
  });

  it('五级一段向下延伸，已研发节点保留原始位置和尺寸，分类仍保留前置连接', () => {
    const state = fresh(24);
    const full = buildMerchantTechTree(state.merchant, { selectedId: 'planet_survey' });
    expect(full.stages).toHaveLength(20); expect(full.columns).toBe(3); expect(full.nodes).toHaveLength(65);
    expect(full.nodes.find(node => node.tech.id === 'planet_survey').tier).toBe(5);
    expect(new Set(full.nodes.map(node => `${node.x},${node.y}`)).size).toBe(65);
    for (const edge of full.edges) {
      expect(Merchant.getTech(edge.to).requires).toContain(edge.from);
      expect(full.nodes.find(node => node.tech.id === edge.to).y).toBeGreaterThan(full.nodes.find(node => node.tech.id === edge.from).y + 244);
    }
    const mobile = buildMerchantTechTree(state.merchant, { width: 280 });
    expect(mobile.columns).toBe(1);
    for (const node of mobile.nodes) {
      expect(node.x + node.width).toBeLessThanOrEqual(280);
      expect(node.x).toBeGreaterThanOrEqual(0);
    }
    researchChain(state, 'planet_survey', { includeTarget: false });
    const filtered = buildMerchantTechTree(state.merchant, { category: '功能', selectedId: 'planet_survey' });
    expect(filtered.nodes.find(node => node.tech.id === 'market_network').completed).toBe(true);
    expect(filtered.nodes.find(node => node.tech.id === 'planet_survey')).toMatchObject({
      x: full.nodes.find(node => node.tech.id === 'planet_survey').x,
      y: full.nodes.find(node => node.tech.id === 'planet_survey').y,
      missing: [], related: true,
    });
    expect(filtered.edges.find(edge => edge.to === 'planet_survey')).toMatchObject({ from: 'market_network', completed: true, sourceHidden: false });
    expect(getTechTreeRelations('deep_survey').parents.map(tech => tech.id)).toEqual(['planet_survey', 'bulk_logistics']);
    expect(getTechTreeRelations('deep_survey').children.map(tech => tech.id)).toContain('integrated_freight');
    researchChain(state, 'planet_survey');
    expect(buildMerchantTechTree(state.merchant).nodes.find(node => node.tech.id === 'planet_survey').completed).toBe(true);
    state.merchant.companyLevel = 100;
    for (const tech of MERCHANT_TECHS) researchChain(state, tech.id);
    const finished = buildMerchantTechTree(state.merchant);
    expect(finished.nodes).toHaveLength(65);
    expect(finished.nodes.every(node => node.completed)).toBe(true);
    expect(finished.nodes.map(({ x, y, width }) => ({ x, y, width }))).toEqual(full.nodes.map(({ x, y, width }) => ({ x, y, width })));
    expect(finished.edges.map(edge => edge.path)).toEqual(full.edges.map(edge => edge.path));
    expect(finished.height).toBe(full.height);
  });

  it('旧 v33 已付费的核心和在途快照不补前置、不再次收费；新增后续仍执行新依赖', () => {
    const state = fresh(100);
    historicalResearch(state, 'fast_navigation');
    expect(Merchant.command(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 }, at).ok).toBe(true);
    const before = structuredClone(state), trip = state.merchant.ships[0].trip;
    expect(isValidTechSnapshot(state.merchant, trip.techIds)).toBe(true);
    expect(Save.saveGame(0, state).ok).toBe(true);
    const loaded = Save.loadGame(0);
    expect(loaded.ok).toBe(true); expect(loaded.state).toEqual(before);
    expect(Merchant.command(loaded.state, 'researchTech', { techId: 'fast_navigation' }, at).ok).toBe(false);
    expect(loaded.state).toEqual(before);
    expect(Merchant.command(loaded.state, 'researchTech', { techId: 'integrated_freight' }, at).ok).toBe(false);
    expect(loaded.state).toEqual(before);
  });

  it('短线路不穿过科技或前置入口，远端和隐藏来源仍完整列出；只突出当前科技的一跳关系', () => {
    const state = fresh();
    const hits = (a, b, box) => a[0] === b[0]
      ? a[0] > box.x && a[0] < box.x + box.width && Math.min(a[1], b[1]) < box.y + box.height && Math.max(a[1], b[1]) > box.y
      : a[1] > box.y && a[1] < box.y + box.height && Math.min(a[0], b[0]) < box.x + box.width && Math.max(a[0], b[0]) > box.x;
    for (const width of [280, 560, 840, 1040]) {
      const tree = buildMerchantTechTree(state.merchant, { width, selectedId: 'integrated_freight' });
      expect(tree.edges).toHaveLength(MERCHANT_TECHS.reduce((sum, tech) => sum + tech.requires.length, 0));
      const boxes = [...tree.nodes.map(node => ({ ...node, height: 244 })), ...tree.references.map(ref => ({ ...ref, height: 44 }))];
      for (const edge of tree.edges) {
        expect(edge.related).toBe(edge.from === 'integrated_freight' || edge.to === 'integrated_freight');
        expect(edge.points.at(-1)[1] - edge.points[0][1]).toBeLessThan(244);
        for (let index = 1; index < edge.points.length; index++) {
          const a = edge.points[index - 1], b = edge.points[index];
          expect(b[1]).toBeGreaterThanOrEqual(a[1]);
          expect(boxes.some(box => hits(a, b, box))).toBe(false);
        }
      }
      const reference = tree.references.find(ref => ref.to === 'integrated_freight');
      expect(reference.parents.map(parent => parent.tech.id)).toEqual(Merchant.getTech('integrated_freight').requires);
      expect(tree.edges.find(edge => edge.from === 'efficient_engines' && edge.to === 'thruster_calibration').kind).toBe('direct');
    }
    researchChain(state, 'berth_planning', { includeTarget: false });
    const completed = buildMerchantTechTree(state.merchant, { selectedId: 'berth_planning' });
    expect(completed.nodes.find(node => node.tech.id === 'clipper_design').completed).toBe(true);
    expect(completed.edges.find(edge => edge.to === 'berth_planning')).toMatchObject({ kind: 'direct', completed: true, sourceHidden: false });
    const filtered = buildMerchantTechTree(fresh().merchant, { category: '船队扩容' });
    expect(filtered.references.find(ref => ref.to === 'berth_planning').parents[0].tech.id).toBe('clipper_design');
    expect(filtered.edges.find(edge => edge.to === 'berth_planning')).toMatchObject({ kind: 'reference', sourceHidden: true, completed: false });
  });
});
