import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMerchantTools } from '../js/ui/MerchantToolsUI.js';

const surface = vi.hoisted(() => ({ dismiss: null }));
vi.mock('../js/ui/SurfaceManager.js', () => ({
  showBlockingSurface: vi.fn(), hideBlockingSurface: vi.fn(),
  registerBlockingSurfaceDismiss: (_id, owner) => { surface.dismiss = owner.onDismiss; return vi.fn(); },
}));
vi.mock('../js/systems/save/SaveSystem.js', () => ({
  listSlots: () => [{slotId:0,isEmpty:true}, {slotId:1,isEmpty:false,meta:{companyName:'测试',credits:100,timestampMs:0}}],
  loadGame: vi.fn(() => ({ok:true,state:{companyName:'测试'},msg:'存档已读取'})),
  saveGame: vi.fn(() => ({ok:true,msg:'存档成功'})),
  importSave: vi.fn(() => ({ok:true,msg:'存档已导入'})),
}));
import { importSave, loadGame } from '../js/systems/save/SaveSystem.js';

let originalDocument, tools, listener, replace, mountedInputs;
const panel = { innerHTML:'', querySelector: () => ({focus:vi.fn()}) };
beforeEach(() => {
  originalDocument = globalThis.document;
  mountedInputs = new Set();
  const modal = {querySelector:()=>panel, addEventListener:(name, fn)=>{if(name==='click') listener=fn;},removeEventListener:vi.fn()};
  globalThis.document = {
    getElementById:id=>id==='settings-modal' ? modal : {value:'full',textContent:''},
    body: {append: input => mountedInputs.add(input)},
    createElement: () => {
      const events = new Map();
      const input = {files:[], click:vi.fn(), remove:()=>mountedInputs.delete(input),
        addEventListener:(name, fn)=>events.set(name, fn), emit:name=>events.get(name)?.()};
      return input;
    },
  };
  vi.clearAllMocks(); replace = vi.fn();
  tools = createMerchantTools({getState:()=>({companyName:'测试'}),replaceState:replace,renderer:{},persist:vi.fn()});
  tools.open('saves');
});
afterEach(() => {tools.dispose(); globalThis.document=originalDocument;});
const click = (tool, slot='1') => listener({target:{closest:()=>({dataset:{tool,slot}})}});

it('读取进度先呈现游戏内确认，返回不执行替换', async () => {
  const pending = click('load');
  expect(panel.innerHTML).toContain('confirm-no'); expect(loadGame).not.toHaveBeenCalled();
  await click('confirm-no'); await pending;
  expect(loadGame).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
  expect(panel.innerHTML).toContain('<h2 id="merchant-tools-title">设置</h2>');
});
it('确认后只读取一次，异步操作确实结束', async () => {
  const pending = click('load'); await click('confirm-yes'); await pending;
  expect(loadGame).toHaveBeenCalledExactlyOnceWith(1); expect(replace).toHaveBeenCalledOnce();
});
it('Escape 或销毁取消待确认操作，不在新会话写回旧进度', async () => {
  const escaped = click('load'); surface.dismiss(); await escaped;
  expect(replace).not.toHaveBeenCalled();
  const abandoned = click('load'); tools.dispose(); await abandoned;
  expect(loadGame).not.toHaveBeenCalled();
});

it('选择导入文件时挂载隐藏输入，读取后导入目标槽位并释放输入', async () => {
  await click('import', '0');
  const [input] = mountedInputs;
  expect(mountedInputs.size).toBe(1);
  expect(input.hidden).toBe(true);
  expect(input.click).toHaveBeenCalledOnce();
  input.files = [{text:vi.fn().mockResolvedValue('{"companyName":"新商队"}')}];
  await input.emit('change');
  expect(importSave).toHaveBeenCalledExactlyOnceWith(0, '{"companyName":"新商队"}');
  expect(mountedInputs.size).toBe(0);
  expect(replace).not.toHaveBeenCalled();
});

it('取消文件选择后释放输入，不修改存档', async () => {
  await click('import', '0');
  const [input] = mountedInputs;
  input.emit('cancel');
  expect(mountedInputs.size).toBe(0);
  expect(importSave).not.toHaveBeenCalled();
});

it('销毁工具会释放文件输入，已开始的文件读取结束后不再导入', async () => {
  await click('import', '0');
  const [input] = mountedInputs;
  let finishReading;
  input.files = [{text:() => new Promise(resolve => { finishReading = resolve; })}];
  const reading = input.emit('change');
  tools.dispose();
  expect(mountedInputs.size).toBe(0);
  finishReading('{"companyName":"旧会话"}');
  await reading;
  expect(importSave).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});
