import { restoreLegacyMerchantAccess, getPendingTechChain } from '../js/systems/merchant/MerchantTechnology.js';
import { describe, expect, it } from 'vitest';
import { researchChain } from './helpers/merchantResearch.js';
import { createInitialState } from '../js/data/constants.js';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_SHIPS, MERCHANT_TECHS } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { buildMerchantRouteReports } from '../js/ui/MerchantReportProjection.js';

const start = 1_800_000_000_000;
const companyUpgradeCosts = MERCHANT_COMPANY_LEVELS.slice(0, -1).map(stage => stage.upgradeCost);
const hullTechs = MERCHANT_TECHS.filter(tech => ['fast_navigation', 'bulk_logistics', 'integrated_freight'].includes(tech.id));
const techTotalCost = getPendingTechChain({ researchedTechIds: [] }, 'integrated_freight').reduce((total, tech) => total + tech.cost, 0);
const fastChainCost = getPendingTechChain({ researchedTechIds: [] }, 'fast_navigation').reduce((total, tech) => total + tech.cost, 0);
const fastNavigation = MERCHANT_TECHS.find(tech => tech.id === 'fast_navigation');
const plan = (shipIds = ['ship-1'], budget = 220) => ({
  from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds, budget,
});
function fresh(level = 33) {
  const state = createInitialState();
  state.merchant.companyLevel = level;
  restoreLegacyMerchantAccess(state.merchant);
  Merchant.init(state, start);
  return state;
}
const operatingAssets = merchant => Object.fromEntries(Object.entries(merchant).filter(([key]) => key !== 'exploration'));

describe('自动跑商经营闭环', () => {
  it('市场按真实供需、运力和盈利货本识别可完成商路，并把其他商路排到末尾', () => {
    const state = fresh();
    expect(Merchant.findRouteOpportunity(state, 'sol_prime', 'mineral_belt', 'food'))
      .toMatchObject({ shipId: 'ship-1', purchaseCost: 0, budget: 126, profit: 42 });
    state.merchant.markets.sol_prime.supply.food = 0;
    expect(Merchant.findRouteOpportunity(state, 'sol_prime', 'mineral_belt', 'food')).toBeNull();
    expect(Merchant.listRouteOpportunities(state).map(route => [route.goodId, Boolean(route.opportunity)]))
      .toEqual([['minerals', true], ['food', false]]);
    state.merchant.markets.sol_prime.supply.food = 3;
    expect(Merchant.findRouteOpportunity(state, 'sol_prime', 'mineral_belt', 'food')).toBeNull();
    state.merchant.markets.sol_prime.supply.food = 36;
    state.credits = 74;
    expect(Merchant.findRouteOpportunity(state, 'sol_prime', 'mineral_belt', 'food')).toBeNull();
    expect(Merchant.findRouteOpportunity(state, 'mineral_belt', 'sol_prime', 'minerals'))
      .toMatchObject({ shipId: 'ship-1', budget: 74, profit: 2 });
    expect(Merchant.findRouteOpportunity(state, 'sol_prime', 'nebula_forge', 'food')).toBeNull();
  });

  it('空闲船不足时，仅在能购船并保留盈利货本时推荐商路', () => {
    const state = fresh();
    expect(Merchant.command(state, 'create', plan(), start).ok).toBe(true);
    expect(Merchant.findRouteOpportunity(state, 'mineral_belt', 'sol_prime', 'minerals'))
      .toMatchObject({ shipId: null, typeId: 'courier', purchaseCost: 336, budget: 162, profit: 66 });
    state.credits = 300;
    expect(Merchant.findRouteOpportunity(state, 'mineral_belt', 'sol_prime', 'minerals')).toBeNull();
  });

  it('基础船资格开放后可批量购买，逐艘生成独立 ID 并一次扣清总价', () => {
    const state = fresh();
    const first = Merchant.command(state, 'buyShip', { typeId: 'courier' }, start);
    const second = Merchant.command(state, 'buyShip', { typeId: 'clipper' }, start);
    expect(first).toMatchObject({ ok: true, shipIds: ['ship-2'] });
    expect(second).toMatchObject({ ok: true, shipIds: ['ship-3'] });
    expect(state.credits).toBe(324);
    expect(state.merchant.ships.map(ship => ship.typeId)).toEqual(['courier', 'courier', 'clipper']);
    expect(new Set(state.merchant.ships.map(ship => ship.id)).size).toBe(3);
    const batch = fresh();
    batch.credits = 1200;
    expect(Merchant.command(batch, 'buyShip', { typeId: 'courier', quantity: 2 }, start))
      .toMatchObject({ ok: true, shipIds: ['ship-2', 'ship-3'] });
    expect(batch.credits).toBe(460);
    expect(Merchant.command(batch, 'buyShip', { typeId: 'clipper' }, start).ok).toBe(true);
    expect(batch.credits).toBe(120);
    expect(batch.merchant.ships.map(ship => ship.typeId)).toEqual(['courier', 'courier', 'courier', 'clipper']);
    const larger = fresh();
    expect(Merchant.command(larger, 'buyShip', { typeId: 'hauler' }, start).ok).toBe(true);
    expect(larger.merchant.ships[1].typeId).toBe('hauler');
  });

  it('报价计入赠船、逐艘取整，并明确限定有效船型与采购数量', () => {
    const state = fresh();
    const before = structuredClone(state);
    expect(Merchant.getShipPurchaseQuote(state.merchant, 'courier'))
      .toEqual({ quantity: 1, owned: 1, nextPrice: 336, lastPrice: 336, total: 336 });
    expect(Merchant.getShipPurchaseQuote(state.merchant, 'courier', 2))
      .toEqual({ quantity: 2, owned: 1, nextPrice: 336, lastPrice: 404, total: 740 });
    expect(Merchant.getShipPurchaseQuote(state.merchant, 'courier', 20))
      .toEqual({ quantity: 20, owned: 1, nextPrice: 336, lastPrice: 10735, total: 62735 });
    for (const [typeId, price] of [['clipper', 340], ['hauler', 560], ['swift', 850], ['bulk', 980], ['relay', 1250]]) {
      expect(Merchant.getShipPurchaseQuote(state.merchant, typeId))
        .toEqual({ quantity: 1, owned: 0, nextPrice: price, lastPrice: price, total: price });
    }
    expect(Merchant.getShipPurchaseQuote(state.merchant, 'missing')).toBeNull();
    for (const quantity of [0, -1, 1.5, 21, NaN, Infinity, '2', null]) {
      expect(Merchant.getShipPurchaseQuote(state.merchant, 'courier', quantity)).toBeNull();
    }
    expect(state).toEqual(before);
  });

  it('同型持有量决定价格，在途、等待和其他船型均不改变下一艘报价', () => {
    const state = fresh(); state.credits = 2000;
    const quote = Merchant.getShipPurchaseQuote(state.merchant, 'courier');
    expect(Merchant.command(state, 'create', plan(), start).ok).toBe(true);
    expect(state.merchant.ships[0].phase).toBe('outbound');
    expect(Merchant.getShipPurchaseQuote(state.merchant, 'courier')).toEqual(quote);
    expect(Merchant.command(state, 'buyShip', { typeId: 'clipper' }, start).ok).toBe(true);
    expect(Merchant.getShipPurchaseQuote(state.merchant, 'courier')).toEqual(quote);
    expect(Merchant.getShipPurchaseQuote(state.merchant, 'clipper'))
      .toEqual({ quantity: 1, owned: 1, nextPrice: 408, lastPrice: 408, total: 408 });
    expect(Merchant.command(state, 'buyShip', { typeId: 'courier' }, start).ok).toBe(true);
    expect(Merchant.getShipPurchaseQuote(state.merchant, 'courier'))
      .toEqual({ quantity: 1, owned: 2, nextPrice: 404, lastPrice: 404, total: 404 });

    const waiting = fresh();
    expect(Merchant.command(waiting, 'buyShip', { typeId: 'courier' }, start).ok).toBe(true);
    const waitingQuote = Merchant.getShipPurchaseQuote(waiting.merchant, 'courier');
    expect(Merchant.command(waiting, 'create', plan(['ship-1', 'ship-2'], 126), start).ok).toBe(true);
    expect(waiting.merchant.ships[1].phase).toBe('waiting');
    expect(waiting.merchant.tasks[0].stopping).toBe(false);
    expect(Merchant.getShipPurchaseQuote(waiting.merchant, 'courier')).toEqual(waitingQuote);
  });

  it('批量和拆单按相同边际价扣款，形成完全相同的船队和余额', () => {
    const batch = fresh(); batch.credits = 2000;
    const split = structuredClone(batch);
    expect(Merchant.command(batch, 'buyShip', { typeId: 'courier', quantity: 2 }, start).ok).toBe(true);
    expect(batch.credits).toBe(1260);
    expect(Merchant.command(split, 'buyShip', { typeId: 'courier' }, start).ok).toBe(true);
    expect(split.credits).toBe(1664);
    expect(Merchant.command(split, 'buyShip', { typeId: 'courier' }, start).ok).toBe(true);
    expect(split.credits).toBe(1260);
    expect(batch).toEqual(split);
    expect(Merchant.getShipPurchaseQuote(batch.merchant, 'courier'))
      .toEqual({ quantity: 1, owned: 3, nextPrice: 484, lastPrice: 484, total: 484 });
  });

  it('公司船位按全部持有船只计数，越过上限的批量采购完整拒绝', () => {
    const state = fresh(1); state.credits = 100000;
    expect(Merchant.getCompanyProgress(state.merchant)).toMatchObject({level:1,shipLimit:1,remaining:0});
    const before = structuredClone(state);
    expect(Merchant.command(state,'buyShip',{typeId:'courier',quantity:4},start).ok).toBe(false);
    expect(state).toEqual(before);
    expect(Merchant.command(state,'buyShip',{typeId:'courier'},start).ok).toBe(false);
    expect(Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start).ok).toBe(true);
    expect(Merchant.getCompanyProgress(state.merchant)).toMatchObject({level:2,shipLimit:1,remaining:0});
    while (state.merchant.companyLevel < 9) expect(Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start).ok).toBe(true);
    researchChain(state, 'berth_planning');
    expect(Merchant.command(state,'buyShip',{typeId:'courier'},start).ok).toBe(true);
    expect(Merchant.command(state,'create',plan(state.merchant.ships.map(ship=>ship.id),600),start).ok).toBe(true);
    const full = structuredClone(state);
    expect(Merchant.command(state,'buyShip',{typeId:'clipper'},start).ok).toBe(false);
    expect(state).toEqual(full);
    expect(Merchant.findRouteOpportunity(state,'mineral_belt','sol_prime','minerals')).toBeNull();
  });

  it('公司升级只扣自由现金并提升基础船位，不赠船、解锁科技或挪用任务预算', () => {
    const state = fresh(1); state.credits = 220 + companyUpgradeCosts.slice(0, 35).reduce((sum, cost) => sum + cost, 0) + fastChainCost + 850;
    expect(Merchant.command(state,'create',plan(['ship-1'],220),start).ok).toBe(true);
    const merchant = structuredClone(state.merchant), cash = state.credits;
    expect(Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start).ok).toBe(true);
    expect(state.credits).toBe(cash-companyUpgradeCosts[0]);
    expect(operatingAssets(state.merchant)).toEqual({...operatingAssets(merchant),companyLevel:2});
    expect(state.merchant.exploration.event).toBeNull();
    expect(Merchant.getCompanyProgress(state.merchant)).toMatchObject({shipLimit:1,remaining:0});
    expect(Merchant.command(state,'buyShip',{typeId:'swift'},start).ok).toBe(false);
    expect(Merchant.command(state,'researchTech',{techId:'fast_navigation'},start).ok).toBe(false);
    while (state.merchant.companyLevel < 35) expect(Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start).ok).toBe(true);
    expect(state.merchant.exploration.event).toBeNull();
    researchChain(state, 'fast_navigation');
    expect(Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start).ok).toBe(true);
    expect(Merchant.command(state,'buyShip',{typeId:'swift'},start).ok).toBe(true);
    expect(state.merchant.ships).toHaveLength(2);
    expect(state.credits).toBe(0);
    expect(state.merchant.tasks).toEqual(merchant.tasks);
  });

  it('每级扩容费用边界保护自由现金、首航货本与任务预算，满级不再扣费', () => {
    for (const [index, cost] of companyUpgradeCosts.entries()) {
      for (const credits of [cost - 1, cost + 73]) {
        const state = createInitialState({credits}); Merchant.init(state,start);
        state.merchant.companyLevel = index + 1;
        expect(Merchant.getCompanyProgress(state.merchant).upgradeCost).toBe(cost);
        const before = structuredClone(state);
        const result = Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start);
        expect(result.ok).toBe(false);
        expect(result.msg).toContain(credits < cost ? '可用 CR 不足' : '74 CR 首航货本');
        expect(state).toEqual(before);
      }
      const idle = createInitialState({credits: cost + 74}); Merchant.init(idle,start);
      idle.merchant.companyLevel = index + 1;
      const idleMerchant = structuredClone(idle.merchant);
      expect(Merchant.command(idle,Merchant.getCompanyProgress(idle.merchant).action,{},start).ok).toBe(true);
      expect(idle.credits).toBe(74);
      expect(operatingAssets(idle.merchant)).toEqual({...operatingAssets(idleMerchant),companyLevel:index+2,nextId:idleMerchant.nextId});

      const operating = createInitialState({credits: cost + 219}); Merchant.init(operating,start);
      operating.merchant.companyLevel = index + 1;
      expect(Merchant.command(operating,'create',plan(),start).ok).toBe(true);
      expect(operating.credits).toBe(cost - 1);
      expect(Merchant.getOperatingReserve(operating)).toBe(0);
      const underfunded = structuredClone(operating);
      expect(Merchant.command(operating,Merchant.getCompanyProgress(operating.merchant).action,{},start).ok).toBe(false);
      expect(operating).toEqual(underfunded);
      operating.credits += 1;
      const activeMerchant = structuredClone(operating.merchant);
      expect(Merchant.command(operating,Merchant.getCompanyProgress(operating.merchant).action,{},start).ok).toBe(true);
      expect(operating.credits).toBe(0);
      expect(operatingAssets(operating.merchant)).toEqual({...operatingAssets(activeMerchant),companyLevel:index+2,
        nextId:activeMerchant.nextId});
    }
    const state = fresh(1); state.credits = companyUpgradeCosts.reduce((sum, cost) => sum + cost, 31200);
    for (let level=2;level<=100;level++) expect(Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start).ok).toBe(true);
    expect(state.credits).toBe(31200);
    expect(Merchant.getCompanyProgress(state.merchant)).toMatchObject({level:100,shipLimit:30,upgradeCost:null});
    const before = structuredClone(state);
    expect(Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('公司等级开放探索和科技资格，不能绕过探索直接付费开港', () => {
    const state = fresh(1); state.credits = companyUpgradeCosts.slice(0,70).reduce((total,cost)=>total+cost,0) + techTotalCost + 2190;
    const before = structuredClone(state);
    expect(Merchant.command(state,'unlockPort',{},start).ok).toBe(false);
    expect(Merchant.command(state,'researchTech',{techId:'fast_navigation'},start).ok).toBe(false);
    expect(state).toEqual(before);
    while (state.merchant.companyLevel < 24) expect(Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start).ok).toBe(true);
    expect(state.merchant.unlockedPorts).not.toContain('nebula_forge');
    const upgraded = structuredClone(state);
    expect(Merchant.command(state,'unlockPort',{},start).ok).toBe(false);
    expect(state).toEqual(upgraded);
    expect(Merchant.command(state,'researchTech',{techId:'fast_navigation'},start).ok).toBe(false);
    while (state.merchant.companyLevel < 35) expect(Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start).ok).toBe(true);
    researchChain(state, 'fast_navigation');
    expect(Merchant.command(state,'researchTech',{techId:'bulk_logistics'},start).ok).toBe(false);
    while (state.merchant.companyLevel < 52) expect(Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start).ok).toBe(true);
    researchChain(state, 'bulk_logistics');
    expect(Merchant.command(state,'researchTech',{techId:'integrated_freight'},start).ok).toBe(false);
    while (state.merchant.companyLevel < 71) expect(Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start).ok).toBe(true);
    researchChain(state, 'integrated_freight');
    expect(state.credits).toBe(2190);
  });

  it('无效数量、总价不足与未解锁船型均完整拒绝，不扣款也不发船', () => {
    const state = fresh();
    const before = structuredClone(state);
    for (const input of [
      { typeId: 'courier', quantity: 0 }, { typeId: 'courier', quantity: 1.5 },
      { typeId: 'courier', quantity: 21 }, { typeId: 'hauler', quantity: 2 },
      { typeId: 'swift', quantity: 1 },
    ]) {
      expect(Merchant.command(state, 'buyShip', input, start).ok).toBe(false);
      expect(state).toEqual(before);
    }
    for (const credits of [739, 740, 813]) {
      const boundary = createInitialState({ credits }); Merchant.init(boundary, start);
      boundary.merchant.companyLevel = 33;
      const untouched = structuredClone(boundary);
      const result = Merchant.command(boundary, 'buyShip', { typeId: 'courier', quantity: 2 }, start);
      expect(result.ok).toBe(false);
      expect(result.msg).toContain(credits < 740 ? '可用 CR 不足' : '74 CR 首航货本');
      expect(boundary).toEqual(untouched);
    }
    const funded = createInitialState({ credits: 814 }); Merchant.init(funded, start);
    funded.merchant.companyLevel = 33;
    expect(Merchant.command(funded, 'buyShip', { typeId: 'courier', quantity: 2 }, start).ok).toBe(true);
    expect(funded.credits).toBe(74);
    expect(funded.merchant.ships).toHaveLength(3);
  });

  it('无运行中货本时保留最低盈利首航资金，已有任务或在途回款时不重复冻结', () => {
    const state = createInitialState({ credits: 950 });
    state.merchant.companyLevel = 33;
    restoreLegacyMerchantAccess(state.merchant);
    Merchant.init(state, start);
    expect(Merchant.getOperatingReserve(state)).toBe(74);
    expect(Merchant.command(state, 'buyShip', { typeId: 'hauler' }, start).ok).toBe(true);
    const before = structuredClone(state);
    expect(Merchant.command(state, 'buyShip', { typeId: 'clipper' }, start)).toMatchObject({ ok: false, msg: '需保留至少 74 CR 首航货本。' });
    expect(state).toEqual(before);
    const research = createInitialState({ credits: fastChainCost + 50 });
    research.merchant.companyLevel = 40;
    Merchant.init(research, start);
    researchChain(research, 'fast_navigation', { includeTarget: false });
    expect(Merchant.command(research, 'researchTech', { techId: 'fast_navigation' }, start).msg).toContain('74 CR 首航货本');
    expect(research.credits).toBe(fastNavigation.cost + 50);
    const operating = createInitialState({ credits: 1380 });
    operating.merchant.companyLevel = 33;
    restoreLegacyMerchantAccess(operating.merchant);
    Merchant.init(operating, start);
    expect(Merchant.command(operating, 'create', plan(), start).ok).toBe(true);
    expect(Merchant.getOperatingReserve(operating)).toBe(0);
    const insufficient = structuredClone(operating);
    expect(Merchant.command(operating, 'buyShip', { typeId: 'hauler', quantity: 2 }, start).ok).toBe(false);
    expect(operating).toEqual(insufficient);
    operating.credits += 72;
    const task = structuredClone(operating.merchant.tasks[0]);
    expect(Merchant.command(operating, 'buyShip', { typeId: 'hauler', quantity: 2 }, start).ok).toBe(true);
    expect(operating.credits).toBe(0);
    expect(operating.merchant.tasks[0]).toEqual(task);
  });

  it('航速与货运研发有明确前置、成本和完成态，只解锁购买资格', () => {
    const state = createInitialState({ credits: techTotalCost + 850 + 980 + 1250 + 74 });
    state.merchant.companyLevel = 75;
    Merchant.init(state, start);
    const before = structuredClone(state);
    for (const typeId of ['swift', 'bulk', 'relay']) {
      expect(Merchant.command(state, 'buyShip', { typeId }, start).ok).toBe(false);
      expect(state).toEqual(before);
    }
    expect(Merchant.command(state, 'researchTech', { techId: 'integrated_freight' }, start).ok).toBe(false);
    expect(state).toEqual(before);
    expect(new Set(hullTechs.map(tech => tech.unlockShipId)).size).toBe(hullTechs.length);
    expect(MERCHANT_SHIPS.filter(ship => hullTechs.some(tech => tech.id === ship.techId)).map(ship => [ship.techId, ship.id]).sort())
      .toEqual(hullTechs.map(tech => [tech.id, tech.unlockShipId]).sort());
    for (const tech of hullTechs) {
      researchChain(state, tech.id, { includeTarget: false });
      const merchant = structuredClone(state.merchant), cash = state.credits;
      const availableBefore = MERCHANT_SHIPS.filter(ship => Merchant.isShipTypeUnlocked(merchant, ship.id)).map(ship => ship.id);
      expect(Merchant.command(state, 'researchTech', { techId: tech.id }, start).ok).toBe(true);
      expect(state.credits).toBe(cash - tech.cost);
      expect(state.merchant).toEqual({ ...merchant, researchedTechIds: [...merchant.researchedTechIds, tech.id] });
      const newlyAvailable = MERCHANT_SHIPS.filter(ship => Merchant.isShipTypeUnlocked(state.merchant, ship.id) && !availableBefore.includes(ship.id)).map(ship => ship.id);
      expect(newlyAvailable).toEqual([tech.unlockShipId]);
      const completed = structuredClone(state);
      expect(Merchant.command(state, 'researchTech', { techId: tech.id }, start).ok).toBe(false);
      expect(state).toEqual(completed);
      for (const locked of MERCHANT_SHIPS.filter(ship => !Merchant.isShipTypeUnlocked(state.merchant, ship.id))) {
        expect(Merchant.command(state, 'buyShip', { typeId: locked.id }, start).ok).toBe(false);
        expect(state).toEqual(completed);
      }
      expect(Merchant.command(state, 'buyShip', { typeId: tech.unlockShipId }, start).ok).toBe(true);
    }
    expect(state.merchant.researchedTechIds).toEqual(getPendingTechChain({ researchedTechIds: [] }, 'integrated_freight').map(tech => tech.id));
    expect(state.merchant.ships.map(ship => ship.typeId)).toEqual(['courier', 'swift', 'bulk', 'relay']);
    expect(state.credits).toBe(74);
  });

  it('各阶研发都保护不足现金与首航储备，足额时不挪用在途经营货本', () => {
    for (const tech of hullTechs) {
      const prerequisiteCost = getPendingTechChain({ researchedTechIds: [] }, tech.id).filter(item => item.id !== tech.id).reduce((total, item) => total + item.cost, 0);
      const setup = credits => {
        const state = createInitialState({ credits: credits + prerequisiteCost });
        state.merchant.companyLevel = tech.companyLevel;
        Merchant.init(state, start);
        researchChain(state, tech.id, { includeTarget: false });
        return state;
      };
      for (const credits of [tech.cost - 1, tech.cost + 73]) {
        const idle = setup(credits), before = structuredClone(idle);
        const result = Merchant.command(idle, 'researchTech', { techId: tech.id }, start);
        expect(result.ok).toBe(false);
        expect(result.msg).toContain(credits < tech.cost ? '可用 CR 不足' : '74 CR 首航货本');
        expect(idle).toEqual(before);
      }
      const idle = setup(tech.cost + 74), idleMerchant = structuredClone(idle.merchant);
      expect(Merchant.command(idle, 'researchTech', { techId: tech.id }, start).ok).toBe(true);
      expect(idle.credits).toBe(74);
      expect(idle.merchant).toEqual({ ...idleMerchant, researchedTechIds: [...idleMerchant.researchedTechIds, tech.id] });

      const operating = setup(tech.cost + 219);
      expect(Merchant.command(operating, 'create', plan(), start).ok).toBe(true);
      expect(operating.credits).toBe(tech.cost - 1);
      expect(Merchant.getOperatingReserve(operating)).toBe(0);
      const underfunded = structuredClone(operating);
      expect(Merchant.command(operating, 'researchTech', { techId: tech.id }, start).ok).toBe(false);
      expect(operating).toEqual(underfunded);
      operating.credits += 1;
      const activeMerchant = structuredClone(operating.merchant);
      expect(Merchant.command(operating, 'researchTech', { techId: tech.id }, start).ok).toBe(true);
      expect(operating.credits).toBe(0);
      expect(operating.merchant).toEqual({ ...activeMerchant, researchedTechIds: [...activeMerchant.researchedTechIds, tech.id] });
    }
  });

  it('不同船型同任务独立按载量、航速、费用发车并分别返港结算', () => {
    const state = createInitialState({ credits: 3000 });
    state.merchant.companyLevel = 13;
    restoreLegacyMerchantAccess(state.merchant);
    Merchant.init(state, start);
    const bought = Merchant.command(state, 'buyShip', { typeId: 'clipper' }, start);
    expect(Merchant.command(state, 'create', plan(['ship-1', ...bought.shipIds], 800), start).ok).toBe(true);
    const [courier, clipper] = state.merchant.ships;
    expect(courier.trip.quantity).toBe(12);
    expect(clipper.trip.quantity).toBe(18);
    expect(courier.trip.fee).toBeLessThan(clipper.trip.fee);
    expect(courier.trip.legMs).toBeLessThan(clipper.trip.legMs);
    Merchant.advance(state, start + 2 * clipper.trip.legMs);
    const records = state.merchant.tasks[0].recent;
    expect(records.some(record => record.shipId === courier.id && record.profit === 42)).toBe(true);
    expect(records.some(record => record.shipId === clipper.id && record.profit > 0)).toBe(true);
  });

  it('去程售出不发利润，完整返港只结算一次，本金和费用不重发', () => {
    const state = fresh();
    expect(Merchant.command(state, 'create', plan(), start).ok).toBe(true);
    expect(state.credits).toBe(780);
    expect(state.merchant.tasks[0].available).toBe(94);
    expect(state.merchant.ships[0].trip).toMatchObject({ quantity: 12, cost: 96, fee: 30, revenue: 168 });
    expect(Merchant.command(state, 'stop', { taskId: state.merchant.tasks[0].id }, start).ok).toBe(true);
    const arrival = state.merchant.ships[0].arriveAt;
    Merchant.advance(state, arrival);
    expect(state.credits).toBe(780);
    expect(state.merchant.ships[0].phase).toBe('return');
    Merchant.advance(state, arrival + 8572);
    expect(state.credits).toBe(1042);
    expect(state.merchant.tasks).toHaveLength(0);
    expect(state.merchant.history[0]).toMatchObject({ rounds: 1, profit: 42 });
    Merchant.advance(state, arrival + 8572);
    expect(state.credits).toBe(1042);
  });

  it('完整货本无法支持盈利航次时解除派遣，只退一次原货本', () => {
    for (const [reason, change, budget] of [
      ['货本不足', () => {}, 1],
      ['完整往返费用', () => {}, 70],
    ]) {
      const state = fresh(); change(state);
      const markets = structuredClone(state.merchant.markets);
      const result = Merchant.command(state, 'create', plan(['ship-1'], budget), start);
      expect(result.ok).toBe(true);
      expect(result.msg).toContain('自动解除派遣');
      expect(state.credits).toBe(1000);
      expect(state.merchant.tasks).toHaveLength(0);
      expect(state.merchant.history).toHaveLength(1);
      expect(state.merchant.history[0]).toMatchObject({ id: result.taskId, budget, available: budget, rounds: 0, profit: 0, stopping: true });
      expect(state.merchant.history[0].stopReason).toContain(reason);
      expect(buildMerchantRouteReports(state.merchant)).toEqual([{
        key: 'sol_prime:mineral_belt', from: 'sol_prime', to: 'mineral_belt', profit: 0, records: [],
        stoppedTasks: [{ id: result.taskId, reason: state.merchant.history[0].stopReason, closedAt: start }],
      }]);
      expect(state.merchant.ships[0]).toMatchObject({ phase: 'idle', taskId: null, trip: null });
      expect(state.merchant.markets).toEqual(markets);
      expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
      Merchant.advance(state, start + 125000);
      expect(state.credits).toBe(1000);
      expect(state.merchant.tasks).toHaveLength(0);
      expect(state.merchant.history).toHaveLength(1);
    }
  });

  it('临时无货、需求暂满或货量不足时保留商路，补货后原任务自动续跑且不重新划拨货本', () => {
    for (const change of [
      state => { state.merchant.markets.sol_prime.supply.food = 0; },
      state => { state.merchant.markets.mineral_belt.demand.food = 0; },
      state => { state.merchant.markets.mineral_belt.demand.food = 3; },
    ]) {
      const state = fresh();change(state);
      const markets = structuredClone(state.merchant.markets);
      const { taskId } = Merchant.command(state, 'create', plan(), start), sequence = state.merchant.nextId;
      expect(state.credits).toBe(780);
      expect(state.merchant.tasks[0]).toMatchObject({ id: taskId, stopping: false, available: 220, rounds: 0 });
      expect(state.merchant.ships[0]).toMatchObject({ phase: 'waiting', taskId, trip: null });
      expect(state.merchant.ships[0].waitReason).toContain('自动续跑');
      expect(Merchant.getTaskStatus(state.merchant, state.merchant.tasks[0])).toContain('自动续跑');
      expect(state.merchant.markets).toEqual(markets);
      Merchant.advance(state, start + 59999);
      expect(state.credits).toBe(780);
      Merchant.advance(state, start + 60000);
      expect(state.merchant.ships[0]).toMatchObject({ taskId, phase: 'outbound' });
      expect(state.merchant.ships[0].trip.quantity).toBe(12);
      expect(state.credits).toBe(780);
      Merchant.advance(state, start + 60000 + 2 * Merchant.legDuration('courier', 'sol_prime', 'mineral_belt'));
      expect(state.credits).toBe(822);
      expect(state.merchant.tasks[0]).toMatchObject({ id: taskId, rounds: 1, profit: 42, stopping: false });
      expect(state.merchant.nextId).toBe(sequence);
      expect(state.merchant.history).toHaveLength(0);
      expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    }
  });

  it('等待补货时可立即结束并退回货本，后续刷新和离线补算不会重启已结束商路', () => {
    const state = fresh();state.merchant.markets.sol_prime.supply.food = 0;
    const { taskId } = Merchant.command(state, 'create', plan(), start);
    expect(Merchant.command(state, 'stop', { taskId }, start + 1000).ok).toBe(true);
    expect(state.credits).toBe(1000);
    expect(state.merchant.tasks).toHaveLength(0);
    expect(state.merchant.ships[0]).toMatchObject({ phase: 'idle', taskId: null });
    Merchant.advance(state, start + 5 * 60000);
    expect(state.credits).toBe(1000);
    expect(state.merchant.tasks).toHaveLength(0);
    expect(state.merchant.history).toHaveLength(1);
  });

  it('共享市场部分装载按完整费用重算，仍盈利的航次照常执行', () => {
    const partial = fresh();
    partial.merchant.markets.mineral_belt.demand.food = 6;
    expect(Merchant.command(partial, 'create', plan(), start).ok).toBe(true);
    expect(partial.merchant.tasks[0].stopping).toBe(false);
    expect(partial.merchant.ships[0].trip.quantity).toBe(6);
    expect(partial.merchant.ships[0].trip.revenue - partial.merchant.ships[0].trip.cost - partial.merchant.ships[0].trip.fee).toBe(6);
  });

  it('耗尽供给后保留商路等待，多船各自结算，玩家结束才释放完整货本', () => {
    const state = fresh(); state.credits = 2000;
    state.merchant.markets.sol_prime.supply.food = 36;
    expect(Merchant.command(state, 'buyShip', { typeId: 'hauler' }, start).ok).toBe(true);
    const result = Merchant.command(state, 'create', plan(['ship-1', 'ship-2'], 600), start);
    expect(result.ok).toBe(true);
    const [courierTrip, haulerTrip] = state.merchant.ships.map(ship => structuredClone(ship.trip));
    expect(state.credits).toBe(840);
    expect(courierTrip.quantity).toBe(12);
    expect(haulerTrip.quantity).toBe(24);
    Merchant.advance(state, start + 2 * courierTrip.legMs);
    expect(state.credits).toBe(882);
    expect(state.merchant.tasks[0]).toMatchObject({ id: result.taskId, stopping: false, rounds: 1, profit: 42, available: 364 });
    expect(state.merchant.ships[0]).toMatchObject({ taskId: result.taskId, trip: null, phase: 'waiting' });
    expect(state.merchant.ships[0].waitReason).toContain('补货后自动续跑');
    expect(state.merchant.ships[1]).toMatchObject({ phase: 'return', trip: haulerTrip, arriveAt: start + 2 * haulerTrip.legMs });
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    expect(buildMerchantRouteReports(state.merchant)[0]).toMatchObject({ profit: 42, stoppedTasks: [] });
    expect(Merchant.command(state, 'stop', { taskId: result.taskId }, state.merchant.lastTickAt).ok).toBe(true);
    Merchant.advance(state, start + 2 * haulerTrip.legMs);
    expect(state.credits).toBe(1582);
    expect(state.merchant.tasks).toHaveLength(0);
    expect(state.merchant.history).toHaveLength(1);
    expect(state.merchant.history[0]).toMatchObject({ id: result.taskId, rounds: 2, profit: 142, available: 600 });
    expect(state.merchant.history[0].recent).toHaveLength(2);
    const report = buildMerchantRouteReports(state.merchant)[0];
    expect(report).toMatchObject({ profit: 142, stoppedTasks: [] });
    expect(report.records).toHaveLength(2);
    expect(state.merchant.ships.every(ship => ship.phase === 'idle' && ship.taskId === null && ship.trip === null)).toBe(true);
    const closed = structuredClone(state);
    expect(Merchant.command(state, 'stop', { taskId: result.taskId }, start + 2 * haulerTrip.legMs).ok).toBe(false);
    expect(state).toEqual(closed);
    Merchant.advance(state, start + 125000);
    expect(state.credits).toBe(1582);
    expect(state.merchant.history).toEqual(closed.merchant.history);
  });

  it('共享货本暂被同任务在途船占用时等待回款，不误停可盈利的经营安排', () => {
    const state = fresh(); state.credits = 2000;
    expect(Merchant.command(state, 'buyShip', { typeId: 'courier' }, start).ok).toBe(true);
    expect(Merchant.command(state, 'create', plan(['ship-1', 'ship-2'], 126), start).ok).toBe(true);
    expect(state.credits).toBe(1538);
    expect(state.merchant.tasks[0]).toMatchObject({ stopping: false, budget: 126, available: 0 });
    expect(state.merchant.ships[1].phase).toBe('waiting');
    expect(state.merchant.ships[1].waitReason).toContain('同任务');
    const legMs = state.merchant.ships[0].trip.legMs;
    Merchant.advance(state, start + 2 * legMs);
    expect(state.credits).toBe(1580);
    expect(state.merchant.tasks[0]).toMatchObject({ stopping: false, rounds: 1, available: 0 });
    expect(state.merchant.history).toHaveLength(0);
    expect(state.merchant.ships[0].phase).toBe('outbound');
    expect(state.merchant.ships[1].phase).toBe('waiting');
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it('待生效调整先等旧航次返港，按新商路和新货本判断继续或结束', () => {
    for (const budget of [74, 1]) {
      const state = fresh();
      const { taskId } = Merchant.command(state, 'create', plan(), start);
      const legMs = state.merchant.ships[0].trip.legMs;
      expect(Merchant.command(state, 'update', { ...plan(['ship-1'], budget), taskId, from: 'mineral_belt', to: 'sol_prime', goodId: 'minerals' }, start).ok).toBe(true);
      state.merchant.markets.sol_prime.supply.food = 0;
      Merchant.advance(state, start + 1);
      expect(state.merchant.tasks[0]).toMatchObject({ stopping: false, from: 'sol_prime', pending: { budget } });
      expect(state.credits).toBe(780);
      Merchant.advance(state, start + 2 * legMs);
      if (budget === 74) {
        expect(state.merchant.tasks[0]).toMatchObject({ from: 'mineral_belt', goodId: 'minerals', budget: 74, pending: null, stopping: false });
        expect(state.merchant.ships[0].trip).toMatchObject({ from: 'mineral_belt', goodId: 'minerals', quantity: 4 });
        expect(state.credits).toBe(968);
      } else {
        expect(state.merchant.tasks).toHaveLength(0);
        expect(state.merchant.history[0]).toMatchObject({ budget: 1, pending: null, rounds: 1, profit: 42 });
        expect(state.merchant.history[0].stopReason).toContain('货本不足');
        expect(state.credits).toBe(1042);
      }
      expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    }
  });

  it('停止待调整任务释放预留船，自动结束也不会遗留船位或重复返款', () => {
    for (const mode of ['manual', 'automatic']) {
      const state = fresh();
      expect(Merchant.command(state, 'buyShip', { typeId: 'courier' }, start).ok).toBe(true);
      const { taskId } = Merchant.command(state, 'create', plan(), start);
      const legMs = state.merchant.ships[0].trip.legMs;
      expect(Merchant.command(state, 'update', { ...plan(['ship-2'], mode === 'manual' ? 300 : 1), taskId }, start).ok).toBe(true);
      expect(state.merchant.ships[1].taskId).toBe(taskId);
      if (mode === 'manual') {
        expect(Merchant.command(state, 'stop', { taskId }, start).ok).toBe(true);
        expect(state.merchant.tasks[0]).toMatchObject({ stopping: true, pending: null });
        expect(state.merchant.ships[1]).toMatchObject({ phase: 'idle', taskId: null, trip: null });
        expect(state.merchant.ships[0].phase).toBe('outbound');
        expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
      }
      Merchant.advance(state, start + 2 * legMs);
      expect(state.credits).toBe(706);
      expect(state.merchant.tasks).toHaveLength(0);
      expect(state.merchant.history).toHaveLength(1);
      expect(state.merchant.history[0]).toMatchObject({ rounds: 1, profit: 42, pending: null });
      if (mode === 'automatic') expect(state.merchant.history[0].stopReason).toContain('货本不足');
      expect(state.merchant.ships.every(ship => ship.phase === 'idle' && ship.taskId === null)).toBe(true);
      expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
      Merchant.advance(state, start + 2 * legMs);
      expect(state.credits).toBe(706);
    }
  });

  it('同船和同笔现金不能重复派给另一任务', () => {
    const state = fresh();
    Merchant.command(state, 'create', plan(), start);
    expect(Merchant.command(state, 'create', plan(), start)).toMatchObject({ ok: false });
    expect(state.credits).toBe(780);
    Merchant.command(state, 'buyShip', { typeId: 'courier' }, start);
    expect(state.credits).toBe(444);
    expect(Merchant.command(state, 'create', plan(['ship-3'], 600), start)).toMatchObject({ ok: false });
  });

  it('多船独立使用运力与速度，争用同一港口容量', () => {
    const state = fresh();
    state.merchant.markets.sol_prime.supply.food = 36;
    state.merchant.markets.mineral_belt.demand.food = 40;
    Merchant.command(state, 'buyShip', { typeId: 'hauler' }, start);
    Merchant.command(state, 'create', plan(['ship-1', 'ship-2'], 430), start);
    const ships = state.merchant.ships;
    expect(ships[0].trip.quantity).toBe(12);
    expect(ships[1].trip.quantity).toBe(24);
    expect(ships[0].trip.legMs).toBeLessThan(ships[1].trip.legMs);
    expect(state.merchant.markets.sol_prime.supply.food).toBe(0);
    expect(state.merchant.markets.mineral_belt.demand.food).toBe(4);
  });

  it('在途调整和结束等待各自完成返港，船与预算随后释放', () => {
    const state = fresh();
    Merchant.command(state, 'create', plan(), start);
    const id = state.merchant.tasks[0].id;
    expect(Merchant.command(state, 'update', { ...plan(['ship-1'], 300), taskId: id }, start).ok).toBe(true);
    expect(state.merchant.tasks[0].pending).not.toBeNull();
    expect(state.merchant.tasks[0].budget).toBe(300);
    Merchant.advance(state, start + 17144);
    expect(state.merchant.tasks[0].pending).toBeNull();
    expect(state.merchant.tasks[0].budget).toBe(300);
    expect(state.merchant.tasks[0].rounds).toBe(1);
    Merchant.command(state, 'stop', { taskId: id }, start + 17144);
    Merchant.advance(state, start + 40000);
    expect(state.merchant.tasks).toHaveLength(0);
    expect(state.merchant.ships[0].taskId).toBeNull();
  });

  it('逐秒在线与一次离线补算得到同一交易和资金，重复恢复不发钱', () => {
    const online = fresh();
    const offline = fresh();
    Merchant.command(online, 'create', plan(), start);
    Merchant.command(offline, 'create', plan(), start);
    for (let second = 1; second <= 125; second++) Merchant.advance(online, start + second * 1000);
    Merchant.advance(offline, start + 125000);
    expect(offline.credits).toBe(online.credits);
    expect(offline.merchant.tasks).toHaveLength(1);
    expect(offline.merchant.tasks).toEqual(online.merchant.tasks);
    expect(offline.merchant.history).toEqual(online.merchant.history);
    expect(offline.merchant.history).toHaveLength(0);
    expect(offline.merchant.tasks[0]).toMatchObject({ rounds: 7, profit: 294, budget: 220, stopping: false });
    expect(offline.merchant.ships).toEqual(online.merchant.ships);
    expect(offline.merchant.markets).toEqual(online.merchant.markets);
    const cash = offline.credits;
    Merchant.advance(offline, start + 125000);
    expect(offline.credits).toBe(cash);
  });

  it('拒绝会让离线结算卡住的损坏船位或市场容量', () => {
    const state = fresh();
    Merchant.command(state, 'create', plan(), start);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    const brokenShip = structuredClone(state.merchant);
    brokenShip.ships[0].taskId = null;
    expect(Merchant.isValidMerchantState(brokenShip)).toBe(false);
    const brokenMarket = structuredClone(state.merchant);
    delete brokenMarket.markets.sol_prime.supply.food;
    expect(Merchant.isValidMerchantState(brokenMarket)).toBe(false);
  });

  it('在途采购、销售与费用必须符合实际货量，任务资金不能凭空增加或减少', () => {
    const state = fresh();
    Merchant.command(state, 'create', plan(), start);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    for (const damage of [
      merchant => { merchant.ships[0].trip.cost = 5000; },
      merchant => { merchant.ships[0].trip.revenue += 1; },
      merchant => { merchant.ships[0].trip.fee += 1; },
      merchant => { merchant.tasks[0].available += 1; },
      merchant => { merchant.tasks[0].available -= 1; },
    ]) {
      const damaged = structuredClone(state.merchant);
      damage(damaged);
      expect(Merchant.isValidMerchantState(damaged)).toBe(false);
    }
    Merchant.advance(state, state.merchant.ships[0].arriveAt);
    expect(state.merchant.ships[0].phase).toBe('return');
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it('生成序号必须高于已使用的船号与任务号，包括已经结束的任务', () => {
    const state = fresh();
    Merchant.command(state, 'buyShip', { typeId: 'courier' }, start);
    const purchased = structuredClone(state.merchant);
    purchased.nextId = 2;
    expect(Merchant.isValidMerchantState(purchased)).toBe(false);
    const task = Merchant.command(state, 'create', plan(), start);
    Merchant.command(state, 'stop', { taskId: task.taskId }, start);
    Merchant.advance(state, start + 18000);
    expect(state.merchant.tasks).toHaveLength(0);
    expect(state.merchant.history[0].id).toBe(task.taskId);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    const archived = structuredClone(state.merchant);
    archived.nextId = Number(task.taskId.split('-')[1]);
    expect(Merchant.isValidMerchantState(archived)).toBe(false);
  });

  it('存档校验保留合法待调整任务，并拒绝幽灵占船和损坏的待生效方案', () => {
    const state = fresh();
    const added = Merchant.command(state, 'buyShip', { typeId: 'courier' }, start);
    Merchant.command(state, 'create', plan(), start);
    const taskId = state.merchant.tasks[0].id;
    Merchant.command(state, 'update', { ...plan(['ship-1', ...added.shipIds], 300), taskId }, start);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);

    const ghost = structuredClone(state.merchant);
    ghost.tasks[0].pending.shipIds = ['ship-1'];
    expect(Merchant.isValidMerchantState(ghost)).toBe(false);

    const wrongOwner = structuredClone(state.merchant);
    wrongOwner.ships[0].taskId = null;
    expect(Merchant.isValidMerchantState(wrongOwner)).toBe(false);

    const invalidPending = structuredClone(state.merchant);
    invalidPending.tasks[0].pending.from = 'unknown-port';
    expect(Merchant.isValidMerchantState(invalidPending)).toBe(false);

    Merchant.advance(state, start + 18000);
    expect(state.merchant.tasks[0].pending).toBeNull();
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    Merchant.command(state, 'update', { ...plan(['ship-1'], 160), taskId }, start + 18000);
    expect(state.merchant.tasks[0].pending).not.toBeNull();
    expect(state.merchant.tasks[0].budget).toBe(300);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    state.merchant.markets.sol_prime.supply.food = 0;
    Merchant.advance(state, start + 36000);
    expect(state.merchant.tasks).toHaveLength(1);
    expect(state.merchant.tasks[0]).toMatchObject({ pending: null, budget: 160, stopping: false });
    expect(state.merchant.ships[0].waitReason).toContain('自动续跑');
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });
});
