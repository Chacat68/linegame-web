import { afterEach, describe, expect, it, vi } from 'vitest';

async function createHarness() {
  vi.resetModules();
  const events = {};
  const application = { init: vi.fn(), shutdown: vi.fn() };
  const loader = { start: vi.fn(), update: vi.fn(), complete: vi.fn(), fail: vi.fn() };
  const store = { deleteSlot: vi.fn(), exportSave: vi.fn(() => '{original bytes') };
  const download = vi.fn();
  const starmap = { schedulePreload: vi.fn() };
  vi.stubGlobal('window', { addEventListener: (name, handler) => { events[name] = handler; } });
  vi.doMock('../js/core/GameApplication.js', () => application);
  vi.doMock('../js/ui/StartupLoader.js', () => loader);
  vi.doMock('../js/systems/save/SaveSystem.js', () => store);
  vi.doMock('../js/ui/SaveExportEffect.js', () => ({ downloadRawSave: download }));
  vi.doMock('../js/ui/StarmapRenderer.js', () => starmap);
  await import('../js/main.js');
  return { events, application, loader, store, download, starmap };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../js/core/GameApplication.js');
  vi.doUnmock('../js/ui/StartupLoader.js');
  vi.doUnmock('../js/systems/save/SaveSystem.js');
  vi.doUnmock('../js/ui/SaveExportEffect.js');
  vi.doUnmock('../js/ui/StarmapRenderer.js');
  vi.resetModules();
});

describe('浏览器入口的启动与恢复', () => {
  it('启动层退场期间退出会使旧完成回调失效，不重新安排预加载', async () => {
    const harness = await createHarness();
    let finishTransition;
    harness.loader.complete.mockReturnValue(new Promise(resolve => { finishTransition = resolve; }));
    const started = harness.events.load();
    await vi.waitFor(() => expect(harness.loader.complete).toHaveBeenCalledOnce());
    harness.events.pagehide({ persisted: false });
    expect(harness.application.shutdown).toHaveBeenCalledWith('pagehide');
    finishTransition();
    expect(await started).toBe(false);
    expect(harness.starmap.schedulePreload).not.toHaveBeenCalled();
  });

  it('浏览器缓存页面保留同一会话，启动完成后仍可提前准备星图', async () => {
    const harness = await createHarness();
    let finishTransition;
    harness.loader.complete.mockReturnValue(new Promise(resolve => { finishTransition = resolve; }));
    const started = harness.events.load();
    await vi.waitFor(() => expect(harness.loader.complete).toHaveBeenCalledOnce());
    harness.events.pagehide({ persisted: true });
    finishTransition();
    expect(await started).toBe(true);
    expect(harness.application.shutdown).not.toHaveBeenCalled();
    expect(harness.starmap.schedulePreload).toHaveBeenCalledOnce();
  });

  it('只在经营工作区就绪后撤销加载层', async () => {
    const harness = await createHarness();
    let ready;
    harness.application.init.mockReturnValue(new Promise(resolve => { ready = resolve; }));
    const started = harness.events.load();
    expect(harness.loader.complete).not.toHaveBeenCalled();
    expect(harness.starmap.schedulePreload).not.toHaveBeenCalled();
    ready(true);
    expect(await started).toBe(true);
    expect(harness.loader.complete).toHaveBeenCalledOnce();
    expect(harness.starmap.schedulePreload).toHaveBeenCalledOnce();
  });

  it('恢复失败释放运行时，导出和重试都不会删除槽位', async () => {
    const harness = await createHarness();
    const error = Object.assign(new Error('future save'), { code: 'STARTUP_SAVE_RECOVERY_REQUIRED' });
    harness.application.init.mockImplementationOnce(() => { throw error; });
    expect(await harness.events.load()).toBe(false);
    expect(harness.application.shutdown).toHaveBeenCalledWith('startup-failed');
    expect(harness.starmap.schedulePreload).not.toHaveBeenCalled();
    const actions = harness.loader.fail.mock.calls[0][1];
    actions.onExport();
    expect(harness.download).toHaveBeenCalledWith('{original bytes', 0);
    expect(await actions.onRetry()).toBe(true);
    expect(harness.store.deleteSlot).not.toHaveBeenCalled();
    expect(harness.application.init).toHaveBeenLastCalledWith(null, undefined);
  });

  it('明确重开只清除自动槽位并禁用恢复；删除失败不能绕过恢复', async () => {
    const harness = await createHarness();
    harness.application.init.mockImplementationOnce(() => { throw new Error('failed'); });
    await harness.events.load();
    const actions = harness.loader.fail.mock.calls[0][1];
    harness.store.deleteSlot.mockImplementationOnce(() => { throw new Error('denied'); });
    expect(actions.onRestart).toThrow('denied');
    expect(harness.application.init).toHaveBeenCalledTimes(1);
    expect(await actions.onRestart()).toBe(true);
    expect(harness.store.deleteSlot).toHaveBeenLastCalledWith(0);
    expect(harness.application.init).toHaveBeenLastCalledWith(null, {
      restoreAutosave: false, reason: 'recovery-new-game',
    });
  });
});
