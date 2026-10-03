import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MOUSE, TOUCH, Vector3 } from 'three';
import { configureStarmapControls, getStarmapPixelRatio, panStarmapCameraTo, resolveStarmapQuality } from '../js/ui/StarmapViewPolicy.js';
import { createGalaxyBackdropData } from '../js/ui/GalaxyBackdrop.js';

// 优化前完整 RGBA 的 SHA256：四种星系 × 三档画质 × 横竖方屏，另覆盖比例钳制。
const backdropSnapshots = [
  ["milky_way","low",0.47,180,384,"e38e5d3afbaed0cb2527aa85c73abd22611590c1a85fab3a9dabfc6fb44a7d81"],
  ["milky_way","low",1,384,384,"49b79c15ef65c692bb27ef9067cd6cf7322757f3273371d6df8d7dff5884bfbb"],
  ["milky_way","low",1.6,384,240,"4154f859df1345602c2d773cec9de05dbe00ea41dd9c283ea44ef87ed89ff166"],
  ["milky_way","medium",0.47,361,768,"1187685e09da896f63895af7b4be82cf93cb47102ed8b3188ce0c57054488e46"],
  ["milky_way","medium",1,768,768,"a2c7819fe96f9ac42b7ca7efd82865ead974d4fc2cc563a20e009b86a24aa439"],
  ["milky_way","medium",1.6,768,480,"7170bf51338845ae4d0723519b2cd87bb84ba6faf5fcb293e7a62667eda5662c"],
  ["milky_way","high",0.47,481,1024,"2f322d39224acb9c645533f82af69a73405b8822fd36baf51f64a7e53c483f6c"],
  ["milky_way","high",1,1024,1024,"72acdf0cdaa3b1065b5961068a198301da9f8bff9038e0f33b4e498780a59943"],
  ["milky_way","high",1.6,1024,640,"145c306d82d6c52d0528234672e5831964db70e741dd0b9c56254a7129034ee6"],
  ["milky_way","low",0.1,96,384,"7448adf4f6cac482a367cacad709dec9d91371edb323500f47cfc526d4110a22"],
  ["milky_way","high",10,1024,205,"e2662f1f72300aca8e198ee67404780bf53c65d72ed45758531cf3952623d908"],
  ["andromeda","low",0.47,180,384,"07da381bbea677cf9ed69ff6406a3f0458c5f9de6bdbf7befc45b876dee7686c"],
  ["andromeda","low",1,384,384,"1e1035cd107ea7c139cd250be0924179fe7d974fe10ea9870a610bb4de88ffdc"],
  ["andromeda","low",1.6,384,240,"21a7e3a7d88cb69eec8fe578a731d3f5f016caae7cb8205c1dbfb40dd48dbf0d"],
  ["andromeda","medium",0.47,361,768,"bad6804473e302d43e373c826756c559eaf0473866b802cd47f901ef193e6df5"],
  ["andromeda","medium",1,768,768,"24c03d2a107fd01b46a9683e08e2ba60785ada04e7f5add9a26a950c892d026f"],
  ["andromeda","medium",1.6,768,480,"46b60e22e37a8b9da71a6262d513285f232ec7cb18dd320daab0af52c2e40cdc"],
  ["andromeda","high",0.47,481,1024,"96b0b4c30d7e33cbad0ca7e4433e18128090e53ffe973dfa59cbdc7a3f52afd9"],
  ["andromeda","high",1,1024,1024,"575b1ce0d2240460585d3022ee0d1c9961ed739aa27562bc2cb9243d6c13250d"],
  ["andromeda","high",1.6,1024,640,"e466a8a833fb721ec3ccf3c4bbe66755ec4810ce35240f1793a293df4cdd943d"],
  ["andromeda","low",0.1,96,384,"b7650676b971dee59d0bea5ce7db23a005b4ac95616cb64b5804e17004968146"],
  ["andromeda","high",10,1024,205,"5dc929d964f8056c0a59929459739d353da375d0c0e1b8f32ee775feeebbfd4c"],
  ["chrono_rift","low",0.47,180,384,"3533d18c1f284b16c48c95ea11c694491b06ce406774baf80352878891ead466"],
  ["chrono_rift","low",1,384,384,"572285548c00a395eafe26e0c8562979b5363c6e4d92c532a063e6f1a97bff77"],
  ["chrono_rift","low",1.6,384,240,"632727e95fad32d23c4ab5a05468be086c7d661e5e1a85ad6a8897937dc6e73b"],
  ["chrono_rift","medium",0.47,361,768,"c9c6cb29e9e7a5f6eb522fb8e79fa028b5c5cf6e644ecd8343fa9e924b022c04"],
  ["chrono_rift","medium",1,768,768,"da9127bc5b4dd9730e4b1968875fb79c2a981a1334c8a12da1f6d33d4eba919c"],
  ["chrono_rift","medium",1.6,768,480,"e75a43422ace5065e8bdbfe57d024836c7f01819ec6347e856f35a37011e1fcc"],
  ["chrono_rift","high",0.47,481,1024,"ee15e1858b865d69832218ca979a094fdb976e57aeebb6db5a9a3b3eb9a451c1"],
  ["chrono_rift","high",1,1024,1024,"41361e3f50dc5110f9572214c23c3729ab87e3052e2b05406298a23c41ad0c50"],
  ["chrono_rift","high",1.6,1024,640,"7ee9b20b96305e8c77a32987247c2bdedb40434734cb5aff3910e5029735055e"],
  ["chrono_rift","low",0.1,96,384,"b5ceded756670b32fef0a17dcf22d6a09c896caf6f7540ea4e01b5e070320fb9"],
  ["chrono_rift","high",10,1024,205,"ffcfe0253221e20cc961deeaefadc383dafe85f4be9c86f2f76193d102741d3c"],
  ["jade_expanse","low",0.47,180,384,"d7df763b167effd79a3f20a926e41a3ffc34f3f1f2b85b261601ff9840969e31"],
  ["jade_expanse","low",1,384,384,"72820f1ab2db7205c78ad177231fa71435e02503fc8a6337b632c9c6138211b1"],
  ["jade_expanse","low",1.6,384,240,"78a04db884ca0f25cfa1890c70e36edbb2948e00add1c874975d79426f5eb369"],
  ["jade_expanse","medium",0.47,361,768,"38ff79abbde17cce4bd1b550d33c3299cdf03d93d9313d7e4296f42a52c8abff"],
  ["jade_expanse","medium",1,768,768,"5ab585b85a7051e805a890d95e0674fb8d6b75efed82f32be9e64085cdd7f81f"],
  ["jade_expanse","medium",1.6,768,480,"2f6ed3726b1fe4dfcdb4fa06460932d26c652fe113fb0982a8a1fed6399c0406"],
  ["jade_expanse","high",0.47,481,1024,"5d755342cb4905ca2832d928d0d71b402302611ebe2a2977fecc758358e219b0"],
  ["jade_expanse","high",1,1024,1024,"e7b1950518c1b4cab2c799ed8b0ad95920b9c742504460eeb4a04481d0c42d18"],
  ["jade_expanse","high",1.6,1024,640,"90a69f9d49348dc175f2db588008ffb61b58ce0c9914389f38f6d65d88be335d"],
  ["jade_expanse","low",0.1,96,384,"e7aa69b79068b24e28d98f417473718288b3ca1cf20559c87c63207f6a4774df"],
  ["jade_expanse","high",10,1024,205,"08c766de5fb3ea8d4e698d2c6331eb14a8852cecd75cb745e30b1d9eccbf6252"]
];

describe('星图清晰度与平移约束', () => {
  it('窄窗口不等同于低性能，仍保留高密度绘制；低内存与像素预算有上限', () => {
    const quality = resolveStarmapQuality({ width: 432, memory: 8 });
    expect(quality).toBe('medium');
    expect(getStarmapPixelRatio(quality, 2, 432, 988)).toBeGreaterThan(1.5);
    expect(resolveStarmapQuality({ width: 1920, memory: 2 })).toBe('low');
    const ratio = getStarmapPixelRatio('high', 3, 2560, 1440);
    expect(2560 * 1440 * ratio * ratio).toBeLessThanOrEqual(6000001);
    expect(getStarmapPixelRatio('medium', 1, 432, 988)).toBe(1);
  });

  it('经营星图鼠标与触摸均平移，关闭旋转和缩放；重复配置不放开约束', () => {
    const controls = { mouseButtons: {}, touches: {}, object: { position: new Vector3(0, 105, 130) }, target: new Vector3() };
    configureStarmapControls(controls, true);
    expect(controls).toMatchObject({ enableRotate: false, enableZoom: false, enablePan: true, screenSpacePanning: false });
    expect(controls.mouseButtons.LEFT).toBe(MOUSE.PAN);
    expect(controls.touches.ONE).toBe(TOUCH.PAN);
    expect(controls.minDistance).toBe(controls.maxDistance);
    expect(controls.minDistance).toBeCloseTo(Math.hypot(105, 130));
    configureStarmapControls(controls);
    expect(controls.enableRotate).toBe(false);
    expect(controls.enableZoom).toBe(false);
    expect(controls.minDistance).toBe(controls.maxDistance);
  });

  it('聚焦航路或星球只改变水平位置，保留高度和观察方向', () => {
    const camera = { position: new Vector3(12, 105, 138) };
    const controls = { target: new Vector3(12, -2, 8), update() {} };
    const offset = camera.position.clone().sub(controls.target);
    panStarmapCameraTo(camera, controls, new Vector3(-36, 9, -24));
    expect(camera.position.y).toBe(105);
    expect(controls.target.y).toBe(-2);
    expect(camera.position.clone().sub(controls.target).toArray()).toEqual(offset.toArray());
    expect(controls.target.toArray()).toEqual([-36, -2, -24]);
  });

  it('低画质仍有非纯色尘埃带，星系配色不同，重建确定且无透明裂缝', () => {
    const warm = createGalaxyBackdropData('milky_way', 'low');
    const repeated = createGalaxyBackdropData('milky_way', 'low');
    const cold = createGalaxyBackdropData('andromeda', 'low');
    expect(warm.data).toEqual(repeated.data);
    expect(warm.data).not.toEqual(cold.data);
    let min = 255, max = 0, opaque = true;
    for (let i = 0; i < warm.data.length; i += 4) {
      opaque &&= warm.data[i + 3] === 255;
      min = Math.min(min, warm.data[i]); max = Math.max(max, warm.data[i]);
    }
    expect(max - min).toBeGreaterThan(60);
    expect(opaque).toBe(true);
    const portrait = createGalaxyBackdropData('milky_way', 'low', .5);
    expect(portrait.width / portrait.height).toBeCloseTo(.5);
  });
  it('背景缓存优化保留全部像素、尺寸和星点，覆盖四种星系与画质/比例组合', () => {
    for (const [galaxyId, quality, aspect, width, height, sha256] of backdropSnapshots) {
      const backdrop = createGalaxyBackdropData(galaxyId, quality, aspect);
      const scene = [galaxyId, quality, aspect].join(':');
      expect([backdrop.width, backdrop.height], scene).toEqual([width, height]);
      expect(createHash('sha256').update(backdrop.data).digest('hex'), scene).toBe(sha256);
    }
  });

});
