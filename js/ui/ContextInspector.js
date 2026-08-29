// js/ui/ContextInspector.js — workspace-scoped Context Inspector 兼容门面

import { createContextInspectorController } from './ContextInspectorController.js';
import { createContextInspectorSession } from './ContextInspectorSession.js';

const _session = createContextInspectorSession();
const _controller = createContextInspectorController({ session: _session });

export function init(options) { return _controller.init(options); }
export function open(options) { return _controller.open(options); }
export function close(options) { return _controller.close(options); }
export function activateWorkspace(workspaceId, options) {
  return _controller.activateWorkspace(workspaceId, options);
}
export function replaceContext(context, options) {
  return _controller.replaceContext(context, options);
}
export function clearContext(workspaceId, options) {
  return _controller.clearContext(workspaceId, options);
}
export function getContext(workspaceId) { return _controller.getContext(workspaceId); }
export function getCurrentRevision() { return _controller.getCurrentRevision(); }
export function reconcileRevision(revision, options) {
  return _controller.reconcileRevision(revision, options);
}
export function registerRenderer(workspaceId, renderer) {
  return _controller.registerRenderer(workspaceId, renderer);
}
export const registerAdapter = registerRenderer;
export function render() { return _controller.render(); }
export function getSnapshot() { return _controller.getSnapshot(); }
export function dispose() { return _controller.dispose(); }
