// js/ui/ContextInspectorPresenter.js — Context Inspector 壳层与空态纯投影

export function getContextInspectorEmptyView(context) {
  var hasContext = !!context;
  return Object.freeze({
    title: hasContext ? '此工作区尚未接入详情' : '尚未选择上下文',
    note: hasContext
      ? '当前选择已记录；详情适配器接入后会显示在这里。'
      : '在当前工作区选择对象后，这里会显示对应信息。',
  });
}

export function getContextInspectorShellView(request) {
  var input = request || {};
  var context = input.context || null;
  var result = input.rendererResult;
  return Object.freeze({
    title: result && result.title
      ? String(result.title)
      : (input.workspaceId === 'map' ? '地图上下文' : '当前上下文'),
    contextType: context ? context.type : '',
    contextId: context ? context.id : '',
    rendererState: input.rendererRegistered ? 'ready' : 'missing',
    empty: getContextInspectorEmptyView(result === false ? null : context),
  });
}
