import { expect } from '@playwright/test';

// 校验实际生产包图片能加载，且与真实剧情节点的发言人一致。
export async function expectStoryPortrait(surface, speaker) {
  const portrait = surface.getByRole('img', { name: `${speaker}的视频通讯形象`, exact: true });
  await expect(portrait).toBeVisible();
  await expect.poll(() => portrait.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
}
