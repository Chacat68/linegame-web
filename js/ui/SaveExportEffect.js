// 原始存档下载不做 JSON 解析，损坏或来自新版本的内容也能完整备份。
export function downloadRawSave(json, slotId) {
  if (typeof json !== 'string') throw new Error('当前没有可导出的存档。');
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'startrader_save_' + slotId + '_' + Date.now() + '.json';
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // 下载开始后再释放，避免浏览器尚未接管 URL 就被撤销。
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
}
