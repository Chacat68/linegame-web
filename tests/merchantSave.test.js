import { restoreLegacyMerchantAccess } from '../js/systems/merchant/MerchantTechnology.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { historicalResearch } from './helpers/merchantResearch.js';
import { createInitialState, GAME_VERSION, SAVE_SCHEMA_VERSION } from '../js/data/constants.js';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_LEGACY_LEVEL_MAP, MERCHANT_TECHS } from '../js/data/merchant.js';
import { prepareStartupState } from '../js/core/StartupState.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import * as Save from '../js/systems/save/SaveSystem.js';
const start=1_800_000_000_000;
const dockSchedulingCost=MERCHANT_TECHS.find(tech=>tech.id==='dock_scheduling').cost;
const fastNavigationCost=MERCHANT_TECHS.find(tech=>tech.id==='fast_navigation').cost;
const plan={from:'sol_prime',to:'mineral_belt',goodId:'food',shipIds:['ship-1'],budget:220};
const fresh=()=>{const state=createInitialState();Merchant.init(state,start);return state;};
const withPriorShipSlots = value => {
  const copy = structuredClone(value), merchant = copy.merchant ?? copy;
  merchant.researchedTechIds.push(...MERCHANT_TECHS.filter(tech => tech.shipSlotBonus && tech.previousCompanyLevel <= merchant.companyLevel && !merchant.researchedTechIds.includes(tech.id)).map(tech => tech.id));
  return copy;
};
const raw=(state,version=SAVE_SCHEMA_VERSION)=>JSON.stringify({meta:{schemaVersion:version,gameVersion:'0.6.4',timestampMs:start,saveName:'现有经营进度'},data:state});
beforeEach(()=>{vi.restoreAllMocks();for(let slot=0;slot<4;slot++)Save.deleteSlot(slot);localStorage.clear();});
describe('2.0 存档与恢复',()=>{
  it.each(Object.entries(MERCHANT_LEGACY_LEVEL_MAP).map(([old, current]) => [Number(old), current]))('v27 等级 %i 转为 %i，备份原文且重复读取不再次转换', (oldLevel, newLevel) => {
    const state=fresh(); state.merchant.companyLevel=newLevel; state.credits=100000+MERCHANT_TECHS.filter(tech=>['fast_navigation','bulk_logistics','integrated_freight'].includes(tech.id) && tech.companyLevel<=newLevel).reduce((sum,tech)=>sum+tech.cost,0); restoreLegacyMerchantAccess(state.merchant);
    // 历史三级阶段可持有三艘；恢复已获得的扩容资格后准备这组旧船。
    if (newLevel === 13) expect(Merchant.command(state,'researchTech',{techId:'berth_planning'},start).ok).toBe(true);
    expect(Merchant.command(state,'buyShip',{typeId:'clipper'},start).ok).toBe(true);
    expect(Merchant.command(state,'buyShip',{typeId:'hauler'},start).ok).toBe(true);
    expect(Merchant.command(state,'create',{...plan,shipIds:['ship-1','ship-2'],budget:304},start).ok).toBe(true);
    Merchant.advance(state,start+18000);
    for(const tech of MERCHANT_TECHS.filter(item=>['fast_navigation','bulk_logistics','integrated_freight'].includes(item.id) && item.companyLevel<=newLevel)) {
      historicalResearch(state, tech.id);
    }
    const legacy=structuredClone(state); legacy.merchant.companyLevel=oldLevel;
    const original=raw(legacy,27); localStorage.setItem('startrader_save_0',original);
    const loaded=Save.loadGame(0);
    expect(loaded.ok).toBe(true); expect(loaded.state).toEqual(withPriorShipSlots(state));
    expect(localStorage.getItem('startrader_save_before_v28_0')).toBe(original);
    expect(JSON.parse(Save.exportSave(0)).meta.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(Save.loadGame(0).state).toEqual(withPriorShipSlots(state));
    expect(localStorage.getItem('startrader_save_before_v28_0')).toBe(original);
  });
  it.each([0,7,1.5,'2'])('拒绝 v27 损坏的等级 %s，保留原存档内容', oldLevel => {
    const state=fresh(); state.merchant.companyLevel=oldLevel;
    const original=raw(state,27); localStorage.setItem('startrader_save_0',original);
    expect(Save.loadGame(0)).toMatchObject({ok:false,errorCode:'SAVE_DATA_INVALID'});
    expect(localStorage.getItem('startrader_save_0')).toBe(original);
  });
  it('新存档只含经营资料，未知的旧字段不再写入',()=>{
    const state=fresh();state.idle={alloy:999};state.fleet=[{level:10}];state.quests=['old'];
    expect(Save.saveGame(0,state).ok).toBe(true);
    const envelope=JSON.parse(Save.exportSave(0));
    expect(envelope.meta).toMatchObject({gameVersion:GAME_VERSION,schemaVersion:SAVE_SCHEMA_VERSION});
    expect(Object.keys(envelope.data).sort()).toEqual(['companyName','credits','currentGalaxy','merchant','viewingGalaxy']);
    expect(Save.loadGame(0).state.merchant).toEqual(state.merchant);
  });
  it('v22 转换完整保留多船、在途货物、任务货本、科技和结算记录，并备份原文件',()=>{
    const state=fresh();state.credits=fastNavigationCost+3350;
    state.merchant.companyLevel=44; restoreLegacyMerchantAccess(state.merchant);
    expect(Merchant.command(state,'buyShip',{typeId:'clipper'},start).ok).toBe(true);
    historicalResearch(state, 'fast_navigation');
    expect(Merchant.command(state,'create',{...plan,shipIds:['ship-1','ship-2'],budget:440},start).ok).toBe(true);
    expect(state.credits).toBe(2570);
    Merchant.advance(state,start+21000);
    expect(Merchant.command(state,'update',{...plan,taskId:state.merchant.tasks[0].id,shipIds:['ship-1','ship-2'],budget:350},start+21000).ok).toBe(true);
    expect(state.credits).toBe(2612);
    expect(state.merchant.tasks[0]).toMatchObject({budget:440,pending:{budget:350},rounds:1,profit:42});
    state.idle={pending:{credits:888}};state.fleet=[{route:'old'}];
    delete state.merchant.onboarding;
    const original=raw({...state,merchant:{...state.merchant,companyLevel:3}},22);localStorage.setItem('startrader_save_0',original);
    const result=Save.loadGame(0);
    expect(result.ok).toBe(true);expect(result.state.merchant).toEqual(withPriorShipSlots({...state.merchant,onboarding:{step:5,skipped:false}}));expect(result.state.credits).toBe(state.credits);
    expect(localStorage.getItem('startrader_save_before_2_0_0')).toBe(original);
    expect(JSON.parse(Save.exportSave(0)).data).not.toHaveProperty('idle');
    const next=structuredClone(result.state);Merchant.advance(next,start+100000);Merchant.advance(result.state,start+100000);
    expect(result.state).toEqual(next);const cash=result.state.credits;Merchant.advance(result.state,start+100000);expect(result.state.credits).toBe(cash);
  });
  it('v21 补旧档基础船研发资格，保留已在途航次',()=>{
    const state=fresh();Merchant.command(state,'create',plan,start);delete state.merchant.researchedTechIds;
    localStorage.setItem('startrader_save_1',raw(state,21));
    const loaded=Save.loadGame(1);expect(loaded.ok).toBe(true);expect(loaded.state.merchant.researchedTechIds).toEqual(['clipper_design','hauler_design','berth_planning']);expect(loaded.state.merchant.ships[0].trip).toEqual(state.merchant.ships[0].trip);
  });
  it('供需扩容保留旧档库存与锁定航次，下次刷新按新额度恢复并继续原任务',()=>{
    const state=fresh();
    state.merchant.markets={
      sol_prime:{supply:{food:36},demand:{technology:30,minerals:12}},
      mineral_belt:{supply:{minerals:32},demand:{food:40,technology:18}},
      nebula_forge:{supply:{technology:26},demand:{minerals:36,food:16,alloys:180}},
      aurora_depot:{supply:{alloys:180},demand:{}},
    };
    const {taskId}=Merchant.command(state,'create',{...plan,from:'mineral_belt',to:'sol_prime',goodId:'minerals'},start);
    expect(Save.saveGame(1,state).ok).toBe(true);
    const loaded=Save.loadGame(1);expect(loaded.ok).toBe(true);expect(loaded.state).toEqual(state);
    Merchant.advance(loaded.state,start+59999);
    expect(loaded.state.credits).toBe(846);
    expect(loaded.state.merchant.ships[0]).toMatchObject({phase:'waiting',taskId});
    Merchant.advance(loaded.state,start+60000);
    expect(loaded.state.merchant.tasks[0]).toMatchObject({id:taskId,rounds:1,profit:66,budget:220,stopping:false});
    expect(loaded.state.merchant.ships[0]).toMatchObject({phase:'outbound',taskId,trip:{quantity:12}});
    expect(loaded.state.merchant.markets.sol_prime.demand.minerals).toBe(36);
    expect(loaded.state.merchant.markets.mineral_belt.supply.minerals).toBe(72);
    expect(loaded.state.credits).toBe(846);
    expect(Save.saveGame(1,loaded.state).ok).toBe(true);
    expect(Save.loadGame(1).state).toEqual(loaded.state);
  });
  it('历史 waiting 任务缺少结束原因仍可恢复，保持原任务并在补货后续跑',()=>{
    for(const version of [23,SAVE_SCHEMA_VERSION]) {
      // 历史存档保留未曾出航的等待任务；新规则由运行 tick 接管，不在解码时篡改。
      const state=fresh();state.credits=780;
      state.merchant.markets.sol_prime.supply.food=0;
      state.merchant.nextId=3;
      state.merchant.tasks=[{id:'task-2',...plan,available:220,rounds:0,profit:0,recent:[],pending:null,stopping:false,createdAt:start}];
      Object.assign(state.merchant.ships[0],{taskId:'task-2',phase:'waiting',waitReason:'出发港暂时无货，等待供货恢复。'});
      if(version===23)delete state.merchant.companyLevel;
      localStorage.setItem('startrader_save_0',raw(state,version));
      const loaded=Save.loadGame(0);
      expect(loaded.ok).toBe(true);
      expect(loaded.state.credits).toBe(780);
      expect(loaded.state.merchant.tasks).toHaveLength(1);
      expect(loaded.state.merchant.tasks[0]).not.toHaveProperty('stopReason');
      Merchant.advance(loaded.state,start+1);
      expect(loaded.state.credits).toBe(780);
      expect(loaded.state.merchant.tasks[0]).toMatchObject({id:'task-2',rounds:0,profit:0,available:220,stopping:false});
      expect(loaded.state.merchant.ships[0]).toMatchObject({phase:'waiting',taskId:'task-2',trip:null});
      expect(loaded.state.merchant.history).toHaveLength(0);
      expect(Save.saveGame(0,loaded.state).ok).toBe(true);
      const restored=Save.loadGame(0);expect(restored.ok).toBe(true);
      expect(restored.state).toEqual(loaded.state);
      Merchant.advance(restored.state,start+125000);
      expect(restored.state.credits).toBe(906);
      expect(restored.state.merchant.tasks[0]).toMatchObject({id:'task-2',rounds:3,profit:126,stopping:false});
      expect(restored.state.merchant.ships[0]).toMatchObject({phase:'return',taskId:'task-2'});
      expect(restored.state.merchant.history).toEqual(loaded.state.merchant.history);
    }
  });
  it('旧规则已自动结束的在途原因与返港账目可保存恢复，既定结束不再续跑',()=>{
    const state=fresh();state.credits=2000;
    state.merchant.companyLevel=13; restoreLegacyMerchantAccess(state.merchant);
    state.merchant.markets.sol_prime.supply.food=36;
    expect(Merchant.command(state,'buyShip',{typeId:'hauler'},start).ok).toBe(true);
    const created=Merchant.command(state,'create',{...plan,shipIds:['ship-1','ship-2'],budget:600},start);
    expect(created.ok).toBe(true);
    const [courier,hauler]=state.merchant.ships.map(ship=>structuredClone(ship.trip));
    Merchant.advance(state,start+2*courier.legMs);
    // 还原旧规则已经作出解除决定、但尚有船在途的存档，不能把它重新开启。
    Object.assign(state.merchant.tasks[0],{stopping:true,stopReason:'出发港暂时无货。'});
    expect(state.merchant.tasks[0].stopping).toBe(true);
    expect(state.credits).toBe(882);
    const reason=state.merchant.tasks[0].stopReason;
    expect(reason).toContain('无货');
    expect(Save.saveGame(1,state).ok).toBe(true);
    const original=Save.exportSave(1),loaded=Save.loadGame(1);
    expect(loaded.ok).toBe(true);expect(loaded.state).toEqual(state);
    for(const badReason of [null,42,{}]) {
      const damaged=structuredClone(state);damaged.merchant.tasks[0].stopReason=badReason;
      expect(Save.importSave(1,raw(damaged,SAVE_SCHEMA_VERSION)).ok).toBe(false);
      expect(Save.exportSave(1)).toBe(original);
    }
    Merchant.advance(loaded.state,start+2*hauler.legMs);
    expect(loaded.state.credits).toBe(1582);
    expect(loaded.state.merchant.tasks).toHaveLength(0);
    expect(loaded.state.merchant.history[0]).toMatchObject({id:created.taskId,stopReason:reason,rounds:2,profit:142,available:600});
    expect(Save.saveGame(1,loaded.state).ok).toBe(true);
    const archived=Save.loadGame(1);expect(archived.ok).toBe(true);expect(archived.state).toEqual(loaded.state);
    const archivedRaw=Save.exportSave(1),damaged=structuredClone(archived.state);
    damaged.merchant.history[0].stopReason=null;
    expect(Save.importSave(1,raw(damaged,SAVE_SCHEMA_VERSION)).ok).toBe(false);
    expect(Save.exportSave(1)).toBe(archivedRaw);
    Merchant.advance(archived.state,start+125000);
    expect(archived.state.credits).toBe(1582);
    expect(archived.state.merchant.history).toEqual(loaded.state.merchant.history);
  });
  it('未建立经营账本的历史存档只转换公司和资金，旧资产原样留在备份',()=>{
    const original=raw({companyName:'旧公司',credits:8123,fleet:[{id:'old-ship'}]},18);
    localStorage.setItem('startrader_save_1',original);const loaded=Save.loadGame(1);
    expect(loaded.ok).toBe(true);expect(loaded.state.credits).toBe(8123);expect(loaded.state.companyName).toBe('旧公司');expect(loaded.state.merchant.ships).toHaveLength(1);
    expect(loaded.state.merchant.onboarding).toEqual({step:5,skipped:false});
    expect(Save.loadGame(1).ok).toBe(true);expect(localStorage.getItem('startrader_save_before_2_0_1')).toBe(original);
  });
  it.each(['{broken',raw(fresh(),SAVE_SCHEMA_VERSION+1),raw({...fresh(),credits:-1}),raw({...fresh(),merchant:{}})])('坏档或未来版本保持原始字节，启动不会自动开新局：%s',original=>{
    localStorage.setItem('startrader_save_0',original);
    expect(Save.loadGame(0).ok).toBe(false);expect(()=>prepareStartupState()).toThrow();expect(Save.exportSave(0)).toBe(original);
    expect(prepareStartupState({restoreAutosave:false}).restoredAutosave).toBe(false);expect(Save.exportSave(0)).toBe(original);
  });
  it('v23 增加公司等级时保留超过初始上限的商队、在途任务与原始备份',()=>{
    // 测试资金覆盖资格准备、迁移后逐级升级、研发和两次补船；迁移本身不改余额。
    const postMigrationUpgradeCost=MERCHANT_COMPANY_LEVELS.slice(12,43).reduce((sum,stage)=>sum+stage.upgradeCost,0);
    const state=fresh();state.credits=MERCHANT_COMPANY_LEVELS.slice(0,43).reduce((sum,stage)=>sum+stage.upgradeCost,0)+fastNavigationCost+360+2502+660+postMigrationUpgradeCost+400+340+850+38+dockSchedulingCost;
    while(state.merchant.companyLevel<44)expect(Merchant.command(state,Merchant.getCompanyProgress(state.merchant).action,{},start).ok).toBe(true);
    historicalResearch(state, 'fast_navigation');
    // 该历史商队在 v23 已支付开港费用；恢复时保留港口与真实余额。
    state.credits-=360;state.merchant.unlockedPorts.push('nebula_forge');
    state.merchant.markets.sol_prime.supply.food=36;
    expect(Merchant.command(state,'buyShip',{typeId:'courier',quantity:5},start).ok).toBe(true);
    expect(Merchant.command(state,'create',{...plan,shipIds:state.merchant.ships.map(ship=>ship.id),budget:660},start).ok).toBe(true);
    expect(state.credits).toBe(postMigrationUpgradeCost+1628+dockSchedulingCost);
    expect(state.merchant.ships).toHaveLength(6);
    expect(state.merchant.ships.filter(ship=>ship.phase==='outbound')).toHaveLength(3);
    expect(state.merchant.tasks[0]).toMatchObject({budget:660,available:282});
    const quote={quantity:1,owned:6,nextPrice:837,lastPrice:837,total:837};
    expect(Merchant.getShipPurchaseQuote(state.merchant,'courier')).toEqual(quote);
    delete state.merchant.companyLevel;
    delete state.merchant.exploration;
    delete state.merchant.onboarding;
    localStorage.setItem('startrader_save_before_2_0_0','更早版本的原始备份');
    const original=raw(state,23);localStorage.setItem('startrader_save_0',original);
    const loaded=Save.loadGame(0);expect(loaded.ok).toBe(true);
    const {exploration,onboarding,...operating}=loaded.state.merchant;
    const expected={...state.merchant,companyLevel:13}; restoreLegacyMerchantAccess(expected);
    expect(operating).toEqual(withPriorShipSlots(expected));
    expect(onboarding).toEqual({step:5,skipped:false});
    expect(exploration).toMatchObject({nextEventAt:0,event:null});
    expect(exploration.rngState).toBeGreaterThan(0);
    expect(exploration.rngState).toBeLessThanOrEqual(0xffff_ffff);
    expect(Save.loadGame(0).state.merchant.exploration).toEqual(exploration);
    expect(loaded.state.credits).toBe(state.credits);
    expect(Merchant.getShipPurchaseQuote(loaded.state.merchant,'courier')).toEqual(quote);
    expect(Merchant.isShipTypeUnlocked(loaded.state.merchant,'swift')).toBe(true);
    expect(Merchant.isShipTypeUnlocked(loaded.state.merchant,'bulk')).toBe(false);
    expect(Merchant.isShipTypeUnlocked(loaded.state.merchant,'relay')).toBe(false);
    expect(loaded.state.merchant.unlockedPorts).toContain('nebula_forge');
    expect(localStorage.getItem('startrader_save_before_v24_0')).toBe(original);
    expect(localStorage.getItem('startrader_save_before_2_0_0')).toBe('更早版本的原始备份');
    Merchant.init(loaded.state,start);
    const before=structuredClone(loaded.state);
    expect(Merchant.command(loaded.state,'researchTech',{techId:'fast_navigation'},start).ok).toBe(false);
    expect(loaded.state).toEqual(before);
    expect(Merchant.command(loaded.state,'buyShip',{typeId:'clipper'},start).ok).toBe(false);
    expect(loaded.state).toEqual(before);
    while(loaded.state.merchant.companyLevel<44)expect(Merchant.command(loaded.state,Merchant.getCompanyProgress(loaded.state.merchant).action,{},start).ok).toBe(true);
    expect(loaded.state.credits).toBe(1628+dockSchedulingCost);
    expect(loaded.state.merchant).toEqual({...before.merchant,companyLevel:44});
    expect(Merchant.command(loaded.state,'researchTech',{techId:'dock_scheduling'},start).ok).toBe(true);
    expect(loaded.state.credits).toBe(1628);
    expect(Merchant.command(loaded.state,'buyShip',{typeId:'clipper'},start).ok).toBe(true);
    expect(Merchant.command(loaded.state,'buyShip',{typeId:'swift'},start).ok).toBe(true);
    expect(loaded.state.credits).toBe(438);
    expect(loaded.state.merchant.ships).toHaveLength(8);
    expect(loaded.state.merchant.tasks).toEqual(before.merchant.tasks);
    expect(Merchant.getShipPurchaseQuote(loaded.state.merchant,'courier')).toEqual(quote);
    expect(Save.saveGame(0,loaded.state).ok).toBe(true);
    const saved=Save.loadGame(0);
    expect(saved.ok).toBe(true);
    expect(saved.state).toEqual(loaded.state);
    expect(Merchant.getShipPurchaseQuote(saved.state.merchant,'courier')).toEqual(quote);
  });
  it('当前格式拒绝缺失、非整数或超范围公司等级，导入不覆盖已有进度',()=>{
    const state=fresh();Save.saveGame(1,state);const before=Save.exportSave(1);
    for(const companyLevel of [undefined,0,1.5,101,'2']) {
      const damaged=structuredClone(state);damaged.merchant.companyLevel=companyLevel;
      expect(Save.importSave(1,raw(damaged,SAVE_SCHEMA_VERSION)).ok).toBe(false);
      expect(Save.exportSave(1)).toBe(before);
    }
  });
  it('v24 只补探索随机状态并备份原档，已开放港口与经营资产原样保留',()=>{
    for(const [index,opened] of [false,true].entries()) {
      const slot=index+1,state=fresh();state.merchant.companyLevel=2;
      expect(Merchant.command(state,'create',plan,start).ok).toBe(true);
      if(opened)state.merchant.unlockedPorts.push('nebula_forge');
      delete state.merchant.exploration;
      delete state.merchant.onboarding;
      const original=raw(state,24);
      localStorage.setItem(`startrader_save_${slot}`,original);
      localStorage.setItem(`startrader_save_before_2_0_${slot}`,'更早的经营备份');
      const loaded=Save.loadGame(slot);expect(loaded.ok).toBe(true);
      const {exploration,onboarding,...operating}=loaded.state.merchant;
      const expected={...state.merchant,companyLevel:29}; restoreLegacyMerchantAccess(expected);
      expect(operating).toEqual(withPriorShipSlots(expected));
      expect(onboarding).toEqual({step:5,skipped:false});
      expect(loaded.state.credits).toBe(780);
      expect(exploration).toMatchObject({event:null,nextEventAt:0});
      expect(exploration.rngState).toBeGreaterThan(0);
      expect(exploration.rngState).toBeLessThanOrEqual(0xffff_ffff);
      expect(localStorage.getItem(`startrader_save_before_v25_${slot}`)).toBe(original);
      expect(localStorage.getItem(`startrader_save_before_2_0_${slot}`)).toBe('更早的经营备份');
      expect(Save.loadGame(slot).state).toEqual(loaded.state);
      Merchant.init(loaded.state,start);Merchant.advance(loaded.state,start);
      if(opened)expect(loaded.state.merchant.exploration).toEqual(exploration);
      else {
        expect(loaded.state.merchant.exploration.nextEventAt).toBe(0);
        expect(loaded.state.merchant.exploration.event).toMatchObject({ status:'available', portId:'nebula_forge', appearedAt:start });
      }
      expect(loaded.state.merchant.tasks).toEqual(state.merchant.tasks);
      expect(loaded.state.merchant.ships).toEqual(state.merchant.ships);
    }
  });
  it('信号期限、探索去程与返程恢复不重抽随机数，完成只开一次港口',()=>{
    const state=fresh();state.merchant.companyLevel=29;state.merchant.exploration.rngState=42; restoreLegacyMerchantAccess(state.merchant);
    Merchant.advance(state,start);
    expect(Save.saveGame(2,state).ok).toBe(true);
    const scheduled=Save.exportSave(2),loaded=Save.loadGame(2);
    expect(loaded.ok).toBe(true);expect(loaded.state).toEqual(state);
    Merchant.init(loaded.state,start);
    expect(loaded.state.merchant.exploration).toEqual(state.merchant.exploration);
    expect(Save.loadGame(2).state.merchant.exploration).toEqual(state.merchant.exploration);
    expect(Save.exportSave(2)).toBe(scheduled);
    Merchant.advance(loaded.state,state.merchant.exploration.nextEventAt);
    const eventId=loaded.state.merchant.exploration.event.id,now=loaded.state.merchant.lastTickAt;
    expect(Merchant.command(loaded.state,'explore',{eventId,shipId:'ship-1',from:'sol_prime'},now).ok).toBe(true);
    expect(loaded.state.credits).toBe(640);
    const baseline=structuredClone(loaded.state),turnAt=loaded.state.merchant.exploration.event.arriveAt;
    expect(Save.saveGame(2,loaded.state).ok).toBe(true);
    const outbound=Save.loadGame(2);expect(outbound.ok).toBe(true);expect(outbound.state).toEqual(loaded.state);
    Merchant.advance(outbound.state,turnAt);
    expect(outbound.state.merchant.exploration.event.status).toBe('returning');
    expect(outbound.state.merchant.unlockedPorts).not.toContain('nebula_forge');
    expect(Save.saveGame(2,outbound.state).ok).toBe(true);
    const returning=Save.loadGame(2);expect(returning.ok).toBe(true);expect(returning.state).toEqual(outbound.state);
    const finalAt=returning.state.merchant.exploration.event.arriveAt;
    Merchant.advance(returning.state,finalAt);Merchant.advance(baseline,finalAt);
    expect(returning.state.credits).toBe(640);
    expect(returning.state.merchant.exploration).toEqual(baseline.merchant.exploration);
    expect(returning.state.merchant.ships).toEqual(baseline.merchant.ships);
    expect(returning.state.merchant.unlockedPorts).toEqual(baseline.merchant.unlockedPorts);
    expect(returning.state.merchant.markets).toEqual(baseline.merchant.markets);
    expect(Save.saveGame(2,returning.state).ok).toBe(true);
    const completed=Save.loadGame(2);expect(completed.ok).toBe(true);expect(completed.state).toEqual(returning.state);
    Merchant.advance(completed.state,finalAt+180000);
    expect(completed.state.credits).toBe(640);
    expect(completed.state.merchant.exploration.event).toEqual(returning.state.merchant.exploration.event);
    expect(completed.state.merchant.unlockedPorts.filter(id=>id==='nebula_forge')).toHaveLength(1);
  });
  it('探索计时、船只归属或事件数据损坏时拒绝覆盖已有存档',()=>{
    const state=fresh();state.merchant.companyLevel=29;state.merchant.exploration.rngState=42; restoreLegacyMerchantAccess(state.merchant);
    Merchant.advance(state,start);Merchant.advance(state,state.merchant.exploration.nextEventAt);
    const now=state.merchant.lastTickAt,eventId=state.merchant.exploration.event.id;
    const bought=Merchant.command(state,'buyShip',{typeId:'courier'},now);expect(bought.ok).toBe(true);
    expect(Merchant.command(state,'explore',{eventId,shipId:'ship-1'},now).ok).toBe(true);
    expect(Save.saveGame(1,state).ok).toBe(true);const original=Save.exportSave(1);
    for(const damage of [
      merchant=>{delete merchant.exploration;},
      merchant=>{merchant.exploration.rngState=-1;},
      merchant=>{merchant.exploration.event.portId='unknown';},
      merchant=>{merchant.exploration.event.arriveAt-=1;},
      merchant=>{merchant.exploration.event.shipId='missing';},
      merchant=>{
        const event=merchant.exploration.event,ship=merchant.ships[0];
        event.status='returning';event.arriveAt+=event.legMs;
        ship.phase='explore_return';ship.departAt=event.startedAt+event.legMs+30000;ship.arriveAt=event.arriveAt;
      },
      merchant=>{merchant.ships[0].phase='outbound';},
      merchant=>{merchant.ships.find(ship=>ship.id===bought.shipIds[0]).taskId=eventId;},
      merchant=>{merchant.nextId=Number(eventId.split('-')[1]);},
    ]) {
      const damaged=structuredClone(state);damage(damaged.merchant);
      const corrupted=raw(damaged,SAVE_SCHEMA_VERSION);
      expect(Save.importSave(1,corrupted).ok).toBe(false);
      expect(Save.exportSave(1)).toBe(original);
      localStorage.setItem('startrader_save_0',corrupted);
      expect(Save.loadGame(0).ok).toBe(false);
      expect(Save.exportSave(0)).toBe(corrupted);
    }
  });
  it('v25 迁移保留所有经营资产并完成引导，原始备份与重复读档不会重放故事',()=>{
    for(const [index,missing] of [true,false].entries()) {
      const slot=index+1,state=fresh();
      expect(Merchant.command(state,'create',plan,start).ok).toBe(true);
      Merchant.advance(state,start+18000);
      if(missing)delete state.merchant.onboarding;
      const original=raw(state,25);
      localStorage.setItem(`startrader_save_${slot}`,original);
      localStorage.setItem(`startrader_save_before_v25_${slot}`,'原有探索版本备份');
      const loaded=Save.loadGame(slot);expect(loaded.ok).toBe(true);
      const expected={...state,merchant:{...state.merchant,companyLevel:13,onboarding:{step:5,skipped:false}}}; restoreLegacyMerchantAccess(expected.merchant);
      expect(loaded.state).toEqual(withPriorShipSlots(expected));
      expect(loaded.state.credits).toBe(822);
      expect(localStorage.getItem(`startrader_save_before_v26_${slot}`)).toBe(original);
      expect(localStorage.getItem(`startrader_save_before_v25_${slot}`)).toBe('原有探索版本备份');
      expect(Save.loadGame(slot).state).toEqual(loaded.state);
      Merchant.init(loaded.state,loaded.state.merchant.lastTickAt);
      const restored=structuredClone(loaded.state);
      expect(Merchant.command(loaded.state,'onboarding',{action:'start'},loaded.state.merchant.lastTickAt).ok).toBe(false);
      expect(loaded.state).toEqual(restored);
    }
  });
  it('新局引导进度随离线经营恢复，正常完成或跳过后均保持终止且无奖励',()=>{
    for(const [index,skip] of [false,true].entries()) {
      const slot=index+1,state=fresh();
      expect(Merchant.command(state,'onboarding',{action:'start'},start).ok).toBe(true);
      expect(Merchant.command(state,'onboarding',{action:'opened-dispatch'},start).ok).toBe(true);
      expect(Merchant.command(state,'create',plan,start).ok).toBe(true);
      expect(state.merchant.onboarding).toEqual({step:3,skipped:false});
      expect(Save.saveGame(slot,state).ok).toBe(true);
      const loaded=Save.loadGame(slot);expect(loaded.ok).toBe(true);expect(loaded.state).toEqual(state);
      Merchant.init(loaded.state,start+125000);Merchant.advance(loaded.state,start+125000);
      expect(loaded.state.credits).toBe(1074);
      expect(loaded.state.merchant.onboarding).toEqual({step:3,skipped:false});
      const before=structuredClone(loaded.state);delete before.merchant.onboarding;
      const now=loaded.state.merchant.lastTickAt;
      if(skip)expect(Merchant.command(loaded.state,'onboarding',{action:'skip'},now).ok).toBe(true);
      else {
        expect(Merchant.command(loaded.state,'onboarding',{action:'viewed-report'},now).ok).toBe(true);
        expect(Merchant.command(loaded.state,'onboarding',{action:'finish'},now).ok).toBe(true);
      }
      const after=structuredClone(loaded.state);delete after.merchant.onboarding;
      expect(after).toEqual(before);
      expect(loaded.state.merchant.onboarding).toEqual({step:5,skipped:skip});
      expect(Save.saveGame(slot,loaded.state).ok).toBe(true);
      const done=Save.loadGame(slot);expect(done.ok).toBe(true);expect(done.state).toEqual(loaded.state);
      Merchant.init(done.state,start+180000);Merchant.advance(done.state,start+180000);
      expect(done.state.merchant.onboarding).toEqual({step:5,skipped:skip});
      expect(done.state.credits).toBe(1200);
    }
  });
  it('当前格式拒绝缺失或矛盾的引导状态，损坏导入不覆盖已有进度',()=>{
    const state=fresh();expect(Save.saveGame(1,state).ok).toBe(true);const original=Save.exportSave(1);
    for(const onboarding of [
      undefined,null,{step:-1,skipped:false},{step:6,skipped:false},{step:1.5,skipped:false},
      {step:'1',skipped:false},{step:0},{step:5,skipped:0},{step:3,skipped:true},
    ]) {
      const damaged=structuredClone(state);damaged.merchant.onboarding=onboarding;
      const corrupted=raw(damaged);
      expect(Save.importSave(1,corrupted).ok).toBe(false);expect(Save.exportSave(1)).toBe(original);
      localStorage.setItem('startrader_save_0',corrupted);
      expect(Save.loadGame(0).ok).toBe(false);expect(Save.exportSave(0)).toBe(corrupted);
    }
    const malformed=structuredClone(state);malformed.merchant.onboarding={step:3,skipped:true};
    const legacy=raw(malformed,25);
    expect(Save.importSave(1,legacy).ok).toBe(false);expect(Save.exportSave(1)).toBe(original);
    localStorage.setItem('startrader_save_0',legacy);
    expect(Save.loadGame(0).ok).toBe(false);expect(Save.exportSave(0)).toBe(legacy);
  });
  it('无法写入迁移备份时拒绝自动覆盖原存档，恢复写入后才完成转换',()=>{
    const state=fresh(),original=raw(state,22);localStorage.setItem('startrader_save_0',original);
    const write=localStorage.setItem.bind(localStorage);
    const spy=vi.spyOn(localStorage,'setItem').mockImplementation((key,value)=>{if(key.includes('before_2_0'))throw new Error('quota');write(key,value);});
    const loaded=Save.loadGame(0);expect(loaded.ok).toBe(true);expect(loaded.warningCode).toBe('SAVE_MIGRATION_WRITE_FAILED');
    expect(Save.saveGame(0,loaded.state).ok).toBe(false);expect(Save.exportSave(0)).toBe(original);
    spy.mockRestore();expect(Save.saveGame(0,loaded.state).ok).toBe(true);expect(localStorage.getItem('startrader_save_before_2_0_0')).toBe(original);
  });
  it('拒绝重复资源占用和损坏的在途账目，导入不会覆盖现有槽位',()=>{
    const state=fresh();Merchant.command(state,'create',plan,start);Save.saveGame(1,state);
    const original=Save.exportSave(1);state.merchant.ships[0].trip.cost=-1;
    expect(Save.importSave(1,raw(state)).ok).toBe(false);expect(Save.exportSave(1)).toBe(original);
  });
  it('当前格式和v23转换均拒绝错误航次金额、货本缺口和回退序号，保留原始进度',()=>{
    const state=fresh();Merchant.command(state,'create',plan,start);
    expect(Save.saveGame(1,state).ok).toBe(true);const original=Save.exportSave(1);
    for(const version of [23,SAVE_SCHEMA_VERSION]) for(const damage of [
      merchant=>{merchant.ships[0].trip.cost=5000;},
      merchant=>{merchant.ships[0].trip.revenue+=1;},
      merchant=>{merchant.ships[0].trip.fee+=1;},
      merchant=>{merchant.tasks[0].available+=1;},
      merchant=>{merchant.nextId=2;},
    ]) {
      const damaged=structuredClone(state);damage(damaged.merchant);
      if(version===23)delete damaged.merchant.companyLevel;
      const corrupted=raw(damaged,version);localStorage.setItem('startrader_save_0',corrupted);
      expect(Save.loadGame(0).ok).toBe(false);expect(Save.exportSave(0)).toBe(corrupted);
      expect(Save.importSave(1,corrupted).ok).toBe(false);expect(Save.exportSave(1)).toBe(original);
    }
  });
  it.each([
    ['空的历史任务', state=>{state.merchant.history=[null];}],
    ['损坏的逐笔收入', state=>{state.merchant.tasks[0].recent=[null];}],
    ['收入和净利润不一致', state=>{state.merchant.tasks[0].recent[0].revenue+=1;}],
  ])('拒绝%s，恢复与导入保持原始资料',(_label,damage)=>{
    const state=fresh();Merchant.command(state,'create',plan,start);Merchant.advance(state,start+18000);
    expect(Save.saveGame(1,state).ok).toBe(true);const before=Save.exportSave(1);
    damage(state);const corrupted=raw(state);localStorage.setItem('startrader_save_0',corrupted);
    expect(Save.loadGame(0).ok).toBe(false);expect(()=>prepareStartupState()).toThrow();expect(Save.exportSave(0)).toBe(corrupted);
    expect(Save.importSave(1,corrupted).ok).toBe(false);expect(Save.exportSave(1)).toBe(before);
  });
  it('槽位列表是只读操作，删除手动槽位不影响自动进度和备份',()=>{
    const state=fresh();Save.saveGame(0,state);Save.saveGame(1,state);const before=Save.exportSave(0);
    expect(Save.listSlots().map(slot=>slot.isEmpty)).toEqual([false,false,true,true]);expect(Save.exportSave(0)).toBe(before);
    Save.deleteSlot(1);expect(Save.listSlots()[1].isEmpty).toBe(true);expect(Save.exportSave(0)).toBe(before);
    expect(Save.saveGame(4,state).ok).toBe(false);
  });
});
