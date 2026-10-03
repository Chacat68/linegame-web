// 校验交付资产及建模源的哈希；静态校验不代替浏览器画面检查。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url),output=new URL('assets/scene/',root);
const manifest=JSON.parse(await readFile(new URL('manifest.json',output),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.version,3);
assert.equal(manifest.assets.length,7);
assert.deepEqual(manifest.assets.filter(asset=>asset.kind==='port').map(asset=>asset.id).sort(),['industrial','mining','sol']);
assert.deepEqual(manifest.assets.filter(asset=>asset.kind==='ship').map(asset=>asset.id).sort(),['clipper','freighter','galleon','shuttle']);
for(const source of manifest.sourceHashes) {
  assert.equal(hash(await readFile(new URL(source.path,root))),source.sha256,'建模源已变化，请重建：'+source.path);
}
let bytesTotal=0;
for(const asset of manifest.assets) {
  assert.equal(asset.borderPixels,0,'主体裁切到边缘：'+asset.id);
  assert.ok(asset.occupiedPixels>asset.width*asset.height*.025,'空白资产：'+asset.id);
  if(asset.kind==='ship') {
    assert.ok(asset.triangles<=6000,'舰船面数超出预算：'+asset.id);
    assert.ok(asset.meshes<=8,'材质组超出预算：'+asset.id);
    assert.equal(asset.shadow.borderPixels,0,'停泊阴影边缘被裁切：'+asset.id);
    assert.ok(asset.shadow.occupiedPixels>asset.width*asset.height*.01,'停泊阴影为空：'+asset.id);
    assert.deepEqual(asset.files.map(file=>file.path.split('.').at(-1)).sort(),['glb','webp','webp']);
  }
  for(const file of asset.files) {
    assert.match(file.path,/^(ships|ports)\/[a-z_]+\.(shadow\.webp|webp|glb)$/);
    const bytes=await readFile(new URL(file.path,output));
    assert.equal(bytes.length,file.bytes);
    assert.equal(hash(bytes),file.sha256,'资产哈希不匹配：'+file.path);
    if(file.path.endsWith('.webp')) {
      assert.equal(bytes.toString('ascii',0,4),'RIFF');
      assert.equal(bytes.toString('ascii',8,12),'WEBP');
      assert.ok(bytes.length<100000,'展示图超出预算：'+file.path);
    } else {
      assert.equal(bytes.toString('ascii',0,4),'glTF');
      assert.equal(bytes.readUInt32LE(4),2);
      assert.equal(bytes.readUInt32LE(8),bytes.length);
      const jsonLength=bytes.readUInt32LE(12);
      const gltf=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
      assert.ok(gltf.meshes.length>0);
      assert.ok(gltf.buffers.every(buffer=>!buffer.uri),'GLB 不得依赖外部缓冲区');
      assert.ok(bytes.length<700000,'模型文件超出预算：'+file.path);
    }
    bytesTotal+=bytes.length;
  }
}
console.log(`资产检查通过：${manifest.assets.length} 项，${bytesTotal.toLocaleString()} 字节，来源哈希与大小预算均有效。`);
