import { restoreLegacyMerchantAccess } from '../js/systems/merchant/MerchantTechnology.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const harness = vi.hoisted(() => ({ runtimes:[], toolsConfig:null, companyConfig:null, open:vi.fn(), dispose:vi.fn(), companyOpen:vi.fn(), companyDispose:vi.fn() }));
vi.mock('../js/core/StartupState.js', () => ({prepareStartupState:()=>({state:{companyName:'测试',credits:1000,merchant:{tasks:[]}}})}));
vi.mock('../js/core/MerchantGameRuntime.js', () => ({
  prepareMerchantSessionState:vi.fn(),
  createMerchantGameRuntime: options => {
    const order = [], instance = {options,order,start:vi.fn(),stop:vi.fn(()=>order.push('stop')),tick:vi.fn(()=>order.push('tick')),execute:vi.fn()};
    harness.runtimes.push(instance); return instance;
  },
}));
vi.mock('../js/ui/MerchantUI.js', () => ({init:vi.fn(),dispose:vi.fn(),render:vi.fn(),renderScene:vi.fn(),enterView:vi.fn(),notify:vi.fn()}));
vi.mock('../js/ui/StarmapRenderer.js', () => ({}));
vi.mock('../js/ui/MerchantToolsUI.js', () => ({createMerchantTools:config=>{harness.toolsConfig=config;return{open:harness.open,dispose:harness.dispose};}}));
vi.mock('../js/ui/MerchantCompanyNameUI.js', () => ({createMerchantCompanyNameUI:config=>{harness.companyConfig=config;return{open:harness.companyOpen,dispose:harness.companyDispose};}}));
vi.mock('../js/core/SettingsCore.js', () => ({loadSettings:()=>({}),applySettings:vi.fn()}));
vi.mock('../js/core/AudioManager.js', () => ({init:vi.fn(),dispose:vi.fn(),playCue:vi.fn()}));
import {init,shutdown} from '../js/core/GameApplication.js';

let nodes, click;
beforeEach(() => {
  vi.clearAllMocks(); harness.runtimes=[];
  vi.useFakeTimers();
  nodes=new Map();
  const element = () => ({dataset:{},inert:false,classList:{toggle:vi.fn()},setAttribute:vi.fn(),removeAttribute:vi.fn(),querySelector:()=>({focus:vi.fn()}),
    addEventListener:(_name,fn)=>{click=fn;},removeEventListener:vi.fn()});
  const buttons=['tasks','ships','starmap','market','reports'].map(view=>({...element(),dataset:{view}}));
  vi.stubGlobal('document',{body:{dataset:{}},getElementById:id=>{if(id==='merchant-logs')return null;if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},querySelectorAll:()=>buttons});
  vi.stubGlobal('requestAnimationFrame',vi.fn(()=>42)); vi.stubGlobal('cancelAnimationFrame',vi.fn());
});
afterEach(() => {shutdown(); vi.useRealTimers(); vi.unstubAllGlobals();});

it('经营组合根接通导航、设置与独立改名，退出前补算且释放监听器和计时', async () => {
  await init();
  click({target:{closest:selector=>selector==='[data-view]' ? {dataset:{view:'starmap'}} : null}});
  expect(document.body.dataset.activeView).toBe('starmap');
  const preventDefault=vi.fn();
  click({preventDefault,target:{closest:selector=>selector.includes('#settings-btn') ? {} : null}});
  expect(harness.open).toHaveBeenCalledOnce(); expect(preventDefault).toHaveBeenCalledOnce();
  click({preventDefault:vi.fn(),target:{closest:selector=>selector==='#company-name-display' ? {} : null}});
  expect(harness.companyOpen).toHaveBeenCalledOnce();
  expect(harness.open).toHaveBeenCalledOnce();
  const runtime=harness.runtimes[0];runtime.order.length=0;
  shutdown('pagehide');
  expect(runtime.order).toEqual(['tick','stop']);expect(runtime.tick).toHaveBeenCalledWith(true);
  expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  expect(nodes.get('game-shell').removeEventListener).toHaveBeenCalledWith('click',expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
  expect(harness.companyDispose).toHaveBeenCalledOnce();
});
it('读档换会话先停旧运行时，新操作和时钟只访问新资料', async () => {
  await init(); const previous=harness.runtimes[0];
  const restored={companyName:'读取的公司',credits:780,merchant:{tasks:[{id:'task-2'}]}};
  harness.toolsConfig.replaceState(restored);
  expect(previous.stop).toHaveBeenCalledOnce();
  expect(harness.runtimes[1].options.getState()).toBe(restored);
  expect(harness.runtimes[1].start).toHaveBeenCalledOnce();
  expect(harness.toolsConfig.getState()).toBe(restored);
  expect(harness.companyConfig.getState()).toBe(restored);
});

it('未研发页面不能通过导航绕过资格，研发后可进入', async () => {
  await init();
  const go = view => click({target:{closest:selector=>selector==='[data-view]' ? {dataset:{view}} : null}});
  go('ships'); expect(document.body.dataset.activeView).toBe('tasks');
  go('market'); expect(document.body.dataset.activeView).toBe('tasks');
  harness.runtimes[0].options.getState().merchant.companyLevel=4;
  go('ships'); expect(document.body.dataset.activeView).toBe('tasks');
  harness.runtimes[0].options.getState().merchant.researchedTechIds=['fleet_command'];
  go('ships'); expect(document.body.dataset.activeView).toBe('ships');
  go('market'); expect(document.body.dataset.activeView).toBe('tasks');
  harness.runtimes[0].options.getState().merchant.companyLevel=5;
  go('market'); expect(document.body.dataset.activeView).toBe('tasks');
  harness.runtimes[0].options.getState().merchant.researchedTechIds.push('market_network');
  go('market'); expect(document.body.dataset.activeView).toBe('market');
  harness.toolsConfig.replaceState({companyName:'新局',credits:1000,merchant:{companyLevel:1}});
  expect(document.body.dataset.activeView).toBe('tasks');
});

it('读取旧已开港或已研发科技时继续保留采购和市场入口', async () => {
  await init();
  const go = view => click({target:{closest:selector=>selector==='[data-view]' ? {dataset:{view}} : null}});
  for (const legacy of [{unlockedPorts:['sol_prime','mineral_belt','nebula_forge']},{researchedTechIds:['fast_navigation']}]) {
    const merchant={companyLevel:1,ships:[],unlockedPorts:['sol_prime','mineral_belt'],researchedTechIds:[],...legacy};
    restoreLegacyMerchantAccess(merchant);
    harness.toolsConfig.replaceState({companyName:'旧商队',credits:1000,merchant});
    go('ships'); expect(document.body.dataset.activeView).toBe('ships');
    go('market'); expect(document.body.dataset.activeView).toBe('market');
  }
});
