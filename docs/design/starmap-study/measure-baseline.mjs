/**
 * Reproduce the six starmap baseline scenarios without touching a daily browser.
 *
 * Requirements: project dependencies and Playwright Chromium already installed.
 * Start the isolated local service in another terminal: npm run dev:alt
 * Run from the repository root: node docs/design/starmap-study/measure-baseline.mjs
 * Optional URL override:
 * STARMAP_BASE_URL=http://127.0.0.1:4174/ node docs/design/starmap-study/measure-baseline.mjs
 *
 * Outputs in this script's directory (OVERWRITES these baseline artifacts):
 * performance-baseline.json, current-desktop.png/.jpg, current-mobile.png/.jpg.
 * No product source, daily-browser storage, or unrelated saves are changed.
 * Each scenario creates a fresh non-persistent Chromium browser context;
 * fixtures enter through the visible import/load flow in that context.
 *
 * Desktop 1280 x 820 at DPR 1; mobile-size 393 x 900 at DPR 3.
 * Mobile-size emulation is not physical mobile hardware. Capture and inspect
 * the recorded GPU renderer: the original run used ANGLE / SwiftShader, so
 * its FPS is a software-GPU regression sample, not a hardware guarantee.
 * CPU duration covers the actual application RAF callback that issues draws;
 * it does not wait for GPU completion. Each scenario takes one first-frame
 * sample and one five-second stable sample; repeat runs for robust medians.
 *
 * A sandbox may block Chromium launch on macOS (MachPort permission error).
 * Use the host's normal authorized execution environment if that occurs;
 * this script does not install browsers or change sandbox/security settings.
 */
import { chromium, expect } from '@playwright/test';
import { importFixture } from '../../../tests/browser/helpers/merchantFixtures.mjs';
import { roundTripFee, legDuration, isValidMerchantState } from '../../../js/systems/merchant/MerchantSystem.js';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const baseUrl=process.env.STARMAP_BASE_URL || 'http://127.0.0.1:4174/';
const dest=fileURLToPath(new URL('./',import.meta.url));
await fs.mkdir(dest,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--mute-audio']});
const output={measuredAtUtc:new Date().toISOString(),baseUrl,browserVersion:browser.version(),notes:['本地 Vite 服务；各样本独立上下文；桌面 1280×820 DPR=1，窄屏 393×900 DPR=3；均为本机 Chromium Headless，窄屏是尺寸模拟，并非真手机。','CPU 时长为实际应用 RAF 回调耗时（有星图 draw 的回调），包含投影/动画/提交，不是 GPU 完成耗时；实际绘制次数由 WebGL 绘制方法记录。','每场景仅一个首帧样本 + 5 秒稳定采样，不构成稳定跨设备基准。'],measurement:{rafHook:'Actual application requestAnimationFrame callback; count only callbacks issuing WebGL draw calls on #starmap-three-canvas',drawHook:['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'],stableSampleSeconds:5,samplesPerScenario:1,notGpuTimer:true,notColdNetworkCache:true,portScenarioScreenshot:'Four open ports, no traveling ships, scene full motion; captured at end of stable sample'},samples:[]};
const quantile=(a,q)=>{if(!a.length)return null;const s=[...a].sort((a,b)=>a-b);return +s[Math.min(s.length-1,Math.floor(s.length*q))].toFixed(2)};
try {
  for(const form of ['desktop','mobile']) for(const mode of ['new','fourPorts','twelveShips']) {
    const context=await browser.newContext({viewport:form==='desktop'?{width:1280,height:820}:{width:393,height:900},deviceScaleFactor:form==='desktop'?1:3,isMobile:form==='mobile',hasTouch:form==='mobile'});
    await context.addInitScript(()=>{
      const metrics=window.__profile={armed:false,calls:0,frameCPU:[],frameTime:[],rafTime:[],longTasks:[],started:0};
      for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
        const base=WebGL2RenderingContext.prototype[method];
        WebGL2RenderingContext.prototype[method]=function(...args){if(this.canvas?.id==='starmap-three-canvas') metrics.calls++;return base.apply(this,args)};
      }
      const raf=window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame=callback=>raf(t=>{const count=metrics.calls,start=performance.now();callback(t);if(metrics.armed){metrics.rafTime.push(t);if(metrics.calls>count){metrics.frameCPU.push(performance.now()-start);metrics.frameTime.push(t)}}});
      try {new PerformanceObserver(list=>{if(metrics.armed)metrics.longTasks.push(...list.getEntries().filter(e=>e.startTime>=metrics.started).map(e=>e.duration))}).observe({entryTypes:['longtask']})}catch{}
    });
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(baseUrl);
    await expect(page.locator('#startup-loader')).toBeHidden({timeout:30000});
    const intro=page.locator('#merchant-onboarding-intro');
    if(await intro.isVisible()) await intro.locator('[data-onboarding-action="skip"]').click();
    if(mode!=='new') await importFixture(page,{level:6,credits:1_000_000,configure:state=>{
      const m=state.merchant;m.unlockedPorts=['sol_prime','mineral_belt','nebula_forge','aurora_depot'];m.researchedTechIds=['fast_navigation','bulk_logistics','integrated_freight'];
      m.exploration.nextEventAt=0;m.exploration.nextPortId=null;
      if(mode==='twelveShips') {
        const now=Date.now(),duration=legDuration('courier','aurora_depot','nebula_forge'),fee=roundTripFee('courier','aurora_depot','nebula_forge');
        m.lastTickAt=now;m.nextRestockAt=now+60000;m.nextId=25;m.ships=[];m.tasks=[];
        for(let i=0;i<12;i++) {
          const shipId='ship-'+(i+1),taskId='task-'+(i+13),departAt=now-1000-i*70;
          m.ships.push({id:shipId,typeId:'courier',taskId,phase:'outbound',departAt,arriveAt:departAt+duration,waitReason:'',trip:{from:'aurora_depot',to:'nebula_forge',goodId:'alloys',quantity:12,cost:144,fee,revenue:204,departedAt:departAt,legMs:duration}});
          m.tasks.push({id:taskId,from:'aurora_depot',to:'nebula_forge',goodId:'alloys',shipIds:[shipId],budget:144+fee,available:0,rounds:0,profit:0,recent:[],pending:null,stopping:false,createdAt:departAt});
        }
        m.markets.aurora_depot.supply.alloys=36;m.markets.nebula_forge.demand.alloys=36;
      }
      if(!isValidMerchantState(m)) throw Error('Invalid '+mode+' fixture');
    }});
    await page.locator('#bottom-nav [data-view="starmap"]').click();
    await expect(page.locator('#starmap-three-canvas')).toHaveAttribute('data-renderer','three',{timeout:30000});
    const initial=await page.evaluate(async()=>{
      const mod=await import('/js/ui/StarmapRenderer.js'),canvas=document.getElementById('starmap-three-canvas'),gl=canvas.getContext('webgl2'),dbg=gl.getExtension('WEBGL_debug_renderer_info');
      return {info:mod.getRendererInfo(),timing:JSON.parse(canvas.dataset.loadTiming),canvas:[canvas.width,canvas.height],userAgent:navigator.userAgent,deviceMemory:navigator.deviceMemory||null,gpu:{vendor:dbg?gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}};
    });
    await page.waitForTimeout(350);
    await page.evaluate(()=>{const m=window.__profile;m.frameCPU=[];m.frameTime=[];m.rafTime=[];m.longTasks=[];m.started=performance.now();m.armed=true});
    await page.waitForTimeout(5000);
    const raw=await page.evaluate(async()=>{const m=window.__profile;m.armed=false;const mod=await import('/js/ui/StarmapRenderer.js');return {duration:performance.now()-m.started,frameCPU:m.frameCPU,frameTime:m.frameTime,rafTime:m.rafTime,longTasks:m.longTasks,info:mod.getRendererInfo()}});
    const frameIntervals=raw.frameTime.slice(1).map((t,i)=>t-raw.frameTime[i]);
    const sample={form,mode,...initial,stable:{drawFrames:raw.frameTime.length,drawFPS:+(raw.frameTime.length/(raw.duration/1000)).toFixed(2),renderCallbackMedianMs:quantile(raw.frameCPU,.5),renderCallbackP95Ms:quantile(raw.frameCPU,.95),renderIntervalMedianMs:quantile(frameIntervals,.5),renderIntervalP95Ms:quantile(frameIntervals,.95),longTaskCount:raw.longTasks.length,longTaskMaxMs:raw.longTasks.length?Math.max(...raw.longTasks):0,info:raw.info},errors};
    if(mode==='fourPorts'){
      const path=dest+'/current-'+form+'.png';
      await page.screenshot({path});
      await page.screenshot({path:dest+'/current-'+form+'.jpg',type:'jpeg',quality:75,scale:'css'});
      sample.screenshot=path;
    }
    output.samples.push(sample);process.stdout.write(JSON.stringify(sample)+'\n');
    await context.close();
  }
} finally {await browser.close();await fs.writeFile(dest+'/performance-baseline.json',JSON.stringify(output,null,2)+'\n');}
