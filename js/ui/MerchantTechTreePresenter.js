import { MERCHANT_COMPANY_RULES, MERCHANT_TECHS } from '../data/merchant.js';
import { buildMerchantTechTree, getTechTreeRelations, TECH_TREE_LAYOUT } from './MerchantTechTreeProjection.js';
import { getPendingTechChain } from '../systems/merchant/MerchantTechnology.js';

const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = value => Math.floor(value).toLocaleString('zh-CN');
const icons = { 航运科技: '◇', 航速: '↗', 载量: '▣', 收益: '◈', 船队扩容: '⊞', 功能: '✦' };

export function merchantTechTreeShell() {
  const options = Array.from({ length: 20 }, (_, index) => `<option value="${index + 1}">第 ${index + 1} 阶 · Lv.${index * 5 + 1}–${index * 5 + 5}</option>`).join('');
  return `<div class="merchant-tech-tree-toolbar"><div class="merchant-tech-era-controls"><button type="button" data-tree-action="previous" aria-label="查看上一阶段科技">↑</button><label><span class="sr-only">科技树阶段</span><select id="merchant-tech-era" aria-label="科技树阶段">${options}</select></label><button type="button" data-tree-action="next" aria-label="查看下一阶段科技">↓</button></div><div class="merchant-tech-jump-controls"><button type="button" data-tree-action="current">当前阶段</button><button type="button" data-tree-action="core">下个核心</button></div></div>
    <div class="merchant-tech-tree-legend"><span><i class="is-ready"></i>可研发</span><span><i class="is-complete"></i>已研发</span><span><i class="is-core"></i>核心科技</span><span><i class="is-locked"></i>未满足条件</span><small>短线连接相邻科技 · 上方入口查看远端前置</small></div>
    <div class="merchant-tech-tree-workspace"><div id="merchant-tech-tree-viewport" class="merchant-tech-tree-viewport" tabindex="0" role="region" aria-label="纵向科技树，上下方向键滚动，Home 和 End 查看首末阶段"><div id="merchant-tech-list" class="merchant-tech-tree"></div></div><aside id="merchant-tech-detail" class="merchant-tech-detail" aria-label="科技前后置关系"></aside></div>`;
}

export function createMerchantTechTreePresenter({ doc = document, getState, showAll }) {
  const host = doc.getElementById('merchant-research');
  const viewport = doc.getElementById('merchant-tech-tree-viewport');
  const list = doc.getElementById('merchant-tech-list');
  const detail = doc.getElementById('merchant-tech-detail');
  const era = doc.getElementById('merchant-tech-era');
  let selectedId = null, category = 'all', viewedTier = 1, entered = false, markup = '', detailMarkup = '', tree = null;
  let width = viewport.clientWidth || 840;
  const pending = () => MERCHANT_TECHS.filter(tech => !getState().merchant.researchedTechIds.includes(tech.id));
  const techName = id => MERCHANT_TECHS.find(tech => tech.id === id).name;

  function replace(node, html, previous) {
    if (html === previous) return previous;
    const focused = node.contains(doc.activeElement) ? doc.activeElement : null;
    const id = focused?.dataset.treeId;
    const action = focused?.dataset.treeAction;
    node.innerHTML = html;
    if (id) node.querySelector(`[data-tree-id="${id}"][data-tree-action="${action}"]`)?.focus({ preventScroll: true });
    return html;
  }
  function selectEra(tier) {
    viewedTier = Math.max(1, Math.min(20, tier)); era.value = String(viewedTier);
    host.querySelector('[data-tree-action="previous"]').disabled = viewedTier === 1;
    host.querySelector('[data-tree-action="next"]').disabled = viewedTier === 20;
  }
  function jump(tier, y = null) {
    selectEra(tier);
    viewport.scrollTo({ left: 0, top: y ?? tree.stages[viewedTier - 1].y, behavior: 'instant' });
  }
  function scroll() {
    if (!tree || !entered || viewport.classList.contains('is-empty')) return;
    const atEnd = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1;
    const stage = tree.stages.findLast(item => item.y <= viewport.scrollTop + 1);
    selectEra(atEnd ? 20 : stage?.tier || 1);
  }
  function locate(id) {
    const tech = MERCHANT_TECHS.find(item => item.id === id);
    if (!tech) return;
    if (category !== 'all' && tech.category !== category) showAll();
    selectedId = id; render(getState(), category);
    const node = list.querySelector(`[data-research-tech="${id}"]`);
    jump(Math.ceil(tech.companyLevel / 5), Math.max(0, Number(node.dataset.treeY) - 104));
    const workspace = viewport.closest('.workspace-surface');
    const resourceBottom = doc.getElementById('merchant-resource-bar')?.getBoundingClientRect().bottom || 0;
    const navTop = doc.getElementById('bottom-nav')?.getBoundingClientRect().top || doc.documentElement.clientHeight;
    const canvasTop = viewport.getBoundingClientRect().top;
    if (workspace && (canvasTop < resourceBottom || canvasTop + TECH_TREE_LAYOUT.nodeHeight > navTop)) {
      workspace.scrollTop += canvasTop - resourceBottom - 12;
    }
    node.querySelector('[data-tree-action="inspect"]')?.focus({ preventScroll: true });
  }
  function renderDetail(merchant) {
    const tech = MERCHANT_TECHS.find(item => item.id === selectedId);
    if (!tech) { detail.hidden = true; detailMarkup = ''; detail.innerHTML = ''; return; }
    detail.hidden = false;
    const completed = new Set(merchant.researchedTechIds);
    const { parents, children } = getTechTreeRelations(tech.id);
    const chain = getPendingTechChain(merchant, tech.id);
    const prerequisiteCost = chain.filter(item => item.id !== tech.id).reduce((sum, item) => sum + item.cost, 0);
    const done = completed.has(tech.id);
    const relation = item => `<button type="button" data-tree-action="locate" data-tree-id="${item.id}"${completed.has(item.id) ? ' class="merchant-tech-relation-complete"' : ''}>${completed.has(item.id) ? '✓ ' : ''}${escape(item.name)}<small>Lv.${item.companyLevel} · ${completed.has(item.id) ? '已研发' : `${money(item.cost)} CR`}</small></button>`;
    const html = `<small>${tech.milestone ? `核心科技 · ${escape(tech.milestone.label)}` : escape(tech.category)} · Lv.${tech.companyLevel}</small><h3 tabindex="-1">${escape(tech.name)}</h3><p>${escape(tech.description)}</p><strong class="merchant-tech-detail-cost${done ? ' is-complete' : ''}">${done ? '✓ 已研发' : `${money(tech.cost)} <span>CR</span>`}</strong>
      ${parents.length ? `<section><h4>前置科技${done ? '' : ' · 全部完成后可研发'}</h4>${parents.map(relation).join('')}${prerequisiteCost ? `<p>前置尚需 ${money(prerequisiteCost)} CR</p>` : ''}</section>` : ''}
      ${children.length ? `<section><h4>后续科技</h4>${children.map(relation).join('')}</section>` : ''}
      <button type="button" data-tree-action="locate" data-tree-id="${tech.id}" class="merchant-tech-locate">定位此科技 ↗</button>`;
    detailMarkup = replace(detail, html, detailMarkup);
  }
  function nodeMarkup(node) {
    const { tech, missing, locked, completed } = node;
    const status = completed ? '效果已生效' : missing.length ? `前置：${missing.map(techName).join('、')}` : locked ? `公司 Lv.${tech.companyLevel} 开放资格` : tech.requires.length ? '前置已完成' : '可研发';
    const badge = completed ? `<b class="is-complete">${tech.milestone ? '核心 · ' : ''}已研发</b>` : tech.milestone ? '<b>核心</b>' : '';
    return `<article class="merchant-tech-card merchant-tech-tree-node${tech.milestone ? ' is-core' : ''}${completed ? ' is-complete' : locked || missing.length ? ' is-locked' : ' is-ready'}${node.selected ? ' is-selected' : ''}${node.related ? ' is-related' : ''}" data-research-tech="${tech.id}" data-tech-category="${escape(tech.category)}" data-tree-level="${tech.companyLevel}" data-tree-x="${node.x}" data-tree-y="${node.y}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px"><div class="merchant-tech-node-type"><span aria-hidden="true">${icons[tech.category]}</span><small>${escape(tech.category)} · Lv.${tech.companyLevel}</small>${badge}</div><h3><button type="button" data-tree-action="inspect" data-tree-id="${tech.id}" aria-pressed="${node.selected}" aria-label="查看${escape(tech.name)}的前后置关系">${escape(tech.name)}</button></h3><p>${escape(tech.description)}</p><span class="merchant-tech-status">${locked ? `${money(tech.cost)} CR · ` : ''}${escape(status)}</span><button type="button" data-merchant-action="research" data-button-state="${completed ? 'complete' : locked || missing.length ? 'blocked' : 'ready'}" data-tech="${tech.id}" ${completed || locked || missing.length ? 'disabled' : ''}>${completed ? '已研发' : locked ? `Lv.${tech.companyLevel} 解锁` : `研发 · ${money(tech.cost)} CR`}</button><small data-merchant-tech-hint></small></article>`;
  }
  function render(state = getState(), nextCategory = category) {
    category = nextCategory;
    const remaining = pending();
    if (!MERCHANT_TECHS.some(tech => tech.id === selectedId && (category === 'all' || tech.category === category))) {
      const candidates = remaining.filter(tech => category === 'all' || tech.category === category);
      selectedId = (candidates.find(tech => tech.companyLevel <= state.merchant.companyLevel && tech.requires.every(id => state.merchant.researchedTechIds.includes(id))) || candidates[0]
        || MERCHANT_TECHS.find(tech => category === 'all' || tech.category === category))?.id || null;
    }
    tree = buildMerchantTechTree(state.merchant, { category, selectedId, width });
    const empty = !tree.nodes.length;
    const message = '暂无此类型科技。';
    viewport.classList.toggle('is-empty', empty);
    viewport.parentElement.classList.toggle('is-empty', empty);
    list.style.width = empty ? '100%' : `${tree.width}px`; list.style.height = empty ? 'auto' : `${tree.height}px`;
    const eras = tree.stages.map(stage => `<div class="merchant-tech-era-column${stage.tier === Math.ceil(state.merchant.companyLevel / 5) ? ' is-current' : ''}" style="top:${stage.y}px;height:${stage.height}px"><span>第 ${stage.tier} 阶 <b>Lv.${(stage.tier - 1) * 5 + 1}–${stage.tier * 5}</b></span></div>`).join('');
    const lines = [...tree.edges].sort((a, b) => Number(a.related) - Number(b.related)).map(edge => `<path class="merchant-tech-edge${edge.kind === 'reference' ? ' is-reference' : ''}${edge.completed ? ' is-complete' : ''}${edge.related ? ' is-path' : ''}" data-tech-from="${edge.from}" data-tech-to="${edge.to}" data-tech-connection="${edge.kind}" d="${edge.path}" marker-end="url(#merchant-tech-arrow)"/>`).join('');
    const references = tree.references.map(reference => {
      const names = reference.parents.map(parent => `${parent.completed ? '✓ ' : ''}${parent.tech.name}`).join(' · ');
      return `<button type="button" class="merchant-tech-reference${reference.completed ? ' is-complete' : ''}${reference.related ? ' is-path' : ''}" data-tree-action="prerequisites" data-tree-id="${reference.to}" data-tech-reference="${reference.to}" aria-label="查看${escape(techName(reference.to))}的前置：${escape(names)}" title="${escape(names)}" style="left:${reference.x}px;top:${reference.y}px;width:${reference.width}px"><span aria-hidden="true">↑</span><span>${escape(names)}</span><small aria-hidden="true">查看</small></button>`;
    }).join('');
    const html = empty ? `<p id="merchant-tech-empty" class="merchant-empty merchant-tech-empty">${escape(message)}</p>` : `${eras}<svg class="merchant-tech-connections" width="${tree.width}" height="${tree.height}" aria-hidden="true"><defs><marker id="merchant-tech-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>${lines}</svg>${references}${tree.nodes.map(nodeMarkup).join('')}`;
    const left = viewport.scrollLeft, top = viewport.scrollTop;
    markup = replace(list, html, markup);
    viewport.scrollLeft = left; viewport.scrollTop = top;
    renderDetail(state.merchant);
    host.querySelector('[data-tree-action="core"]').disabled = !remaining.some(tech => tech.milestone);
  }
  function enter() {
    if (entered) return;
    entered = true;
    jump(Math.ceil(getState().merchant.companyLevel / MERCHANT_COMPANY_RULES.levelsPerTier));
  }
  function click(event) {
    const button = event.target.closest?.('[data-tree-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.treeAction;
    if (action === 'previous' || action === 'next') jump(viewedTier + (action === 'next' ? 1 : -1));
    if (action === 'current') jump(Math.ceil(getState().merchant.companyLevel / 5));
    if (action === 'core') locate(pending().find(tech => tech.milestone)?.id);
    if (action === 'locate') locate(button.dataset.treeId);
    if (action === 'inspect') { selectedId = button.dataset.treeId; render(); list.querySelector(`[data-research-tech="${selectedId}"] [data-tree-action="inspect"]`)?.focus({ preventScroll: true }); }
    if (action === 'prerequisites') {
      selectedId = button.dataset.treeId; render();
      detail.querySelector('h3')?.focus({ preventScroll: true });
      const workspace = viewport.closest('.workspace-surface');
      const resourceBottom = doc.getElementById('merchant-resource-bar')?.getBoundingClientRect().bottom || 0;
      const navTop = doc.getElementById('bottom-nav')?.getBoundingClientRect().top || doc.documentElement.clientHeight;
      const top = detail.getBoundingClientRect().top;
      if (workspace && (top < resourceBottom || top + 100 > navTop)) workspace.scrollTop += top - resourceBottom - 12;
    }
  }
  function change() { jump(Number(era.value)); }
  function keydown(event) {
    if (event.target !== viewport) return;
    const keys = ['ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') jump(event.key === 'Home' ? 1 : 20);
    else viewport.scrollBy({ top: event.key === 'ArrowUp' ? -180 : 180, behavior: 'instant' });
  }
  const observer = new ResizeObserver(entries => {
    const next = Math.floor(entries[0].contentRect.width);
    if (next > 0 && next !== width) {
      width = next; render();
      if (entered && !host.hidden) jump(viewedTier);
    }
  });
  observer.observe(viewport);
  host.addEventListener('click', click); era.addEventListener('change', change); viewport.addEventListener('keydown', keydown); viewport.addEventListener('scroll', scroll);
  return { render, enter, locate, dispose() { observer.disconnect(); host.removeEventListener('click', click); era.removeEventListener('change', change); viewport.removeEventListener('keydown', keydown); viewport.removeEventListener('scroll', scroll); } };
}
