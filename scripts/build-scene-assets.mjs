// 用项目锁定版本的 Three.js 和本地 Chrome 重建原创资产；不访问远程资源。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=new URL('../assets/scene/',import.meta.url);
const server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false}});
let browser;
const records=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
  await server.listen();
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch({channel:process.env.SCENE_ASSET_BROWSER||'chrome',headless:true});
  const page=await browser.newPage();
  await page.route('**/__asset-studio__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>本地场景资产制作</title>'}));
  await page.goto(origin+'/__asset-studio__');
  await page.evaluate(async()=>{window.assetStudio=await import('/scripts/art/RenderSceneAssets.mjs');});
  const assets=[...['shuttle','freighter','clipper','galleon'].map(id=>['ship',id]),
    ...['sol','mining','industrial'].map(id=>['port',id])];
  for(const [kind,id] of assets) {
    const result=await page.evaluate(([kind,id])=>window.assetStudio.renderAsset(kind,id),[kind,id]);
    const dir=kind==='ship'?'ships':'ports';
    await mkdir(new URL(dir+'/',output),{recursive:true});
    const files=[];
    for(const [extension,base64] of [['webp',result.image],['glb',result.glb],['shadow.webp',result.shadow]]) {
      if(!base64) continue;
      const bytes=Buffer.from(base64,'base64'),path=`${dir}/${id}.${extension}`;
      await writeFile(new URL(path,output),bytes);
      files.push({path,bytes:bytes.length,sha256:hash(bytes)});
    }
    records.push({id,kind,...result.metadata,files});
    console.log(`${kind}/${id}: ${result.metadata.triangles} 三角面，${files.map(file=>file.bytes).join(' / ')} 字节`);
  }
  const sources=['js/ui/ShipModelFactory.js','scripts/art/ShipAssetFactory.mjs','scripts/art/RenderSceneAssets.mjs','js/data/sceneVisuals.js','js/ui/SceneLighting.js','js/ui/SceneMaterials.js','js/ui/StarmapLandmarks.js','js/ui/PlanetSurfaceTexture.js'];
  const sourceHashes=await Promise.all(sources.map(async path=>({path,sha256:hash(await readFile(new URL('../'+path,import.meta.url)))})));
  await writeFile(new URL('manifest.json',output),JSON.stringify({
    version:3,provenance:'项目内原创程序化建模，未使用外部模型或付费生成服务',license:'ISC',
    generatedBy:'npm run assets:scene',threeVersion:'0.185.1',browserVersion:browser.version(),
    sourceHashes,assets:records,
  },null,2)+'\n');
} finally {
  if(browser) await browser.close();
  await server.close();
}
