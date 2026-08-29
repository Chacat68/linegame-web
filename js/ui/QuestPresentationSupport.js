// js/ui/QuestPresentationSupport.js — 任务投影共享安全转义

export function escapeQuestHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeQuestHtmlAttr(value) {
  return escapeQuestHtml(value);
}
