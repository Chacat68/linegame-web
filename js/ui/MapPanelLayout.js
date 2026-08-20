// js/ui/MapPanelLayout.js — 星图详情面板的纯几何布局模型

function _finite(value, fallback) {
  var number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function _clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function _freezeLayout(value) {
  return Object.freeze({
    embedded: !!value.embedded,
    left: value.left == null ? null : value.left,
    mode: value.mode,
    top: value.top == null ? null : value.top,
    width: value.width == null ? null : value.width,
  });
}

/**
 * 计算星图详情面板位置。输入只包含测量值，不读取 DOM，也不修改元素样式。
 */
export function buildMapPanelLayout(options) {
  var opts = options || {};
  var mode = opts.mode === 'galaxy' ? 'galaxy' : 'planet';
  if (opts.embedded) {
    return _freezeLayout({ embedded: true, mode: mode });
  }

  var containerWidth = Math.max(0, _finite(opts.containerWidth, 0));
  var containerHeight = Math.max(0, _finite(opts.containerHeight, 0));

  if (mode === 'galaxy') {
    var hubWidth = Math.min(340, Math.max(280, containerWidth - 16));
    return _freezeLayout({
      embedded: false,
      left: Math.max(8, containerWidth - hubWidth - 14),
      mode: mode,
      top: 12,
      width: hubWidth,
    });
  }

  var pinned = !!opts.pinned;
  var preferredWidth = pinned ? 360 : 300;
  var minimumWidth = pinned ? 240 : 220;
  var panelWidth = Math.min(preferredWidth, Math.max(minimumWidth, containerWidth - 16));
  var screenPosition = opts.screenPosition && typeof opts.screenPosition === 'object'
    ? opts.screenPosition
    : null;
  var anchor = opts.anchor && typeof opts.anchor === 'object'
    ? opts.anchor
    : { x: 0.5, y: 0.5 };
  var nodeX = screenPosition && Number.isFinite(Number(screenPosition.x))
    ? Number(screenPosition.x)
    : _finite(anchor.x, 0.5) * containerWidth;
  var nodeY = screenPosition && Number.isFinite(Number(screenPosition.y))
    ? Number(screenPosition.y)
    : _finite(anchor.y, 0.5) * containerHeight;
  var maxLeft = Math.max(8, containerWidth - panelWidth - 8);
  var placeRight = nodeX < containerWidth * 0.58;
  var left = placeRight ? nodeX + 14 : nodeX - panelWidth - 14;
  left = _clamp(left, 8, maxLeft);

  var panelHeight = Math.max(160, _finite(opts.panelHeight, 0));
  var commandSurfaceTop = containerHeight;
  var surfaceTops = Array.isArray(opts.commandSurfaceTops) ? opts.commandSurfaceTops : [];
  surfaceTops.forEach(function (value) {
    var top = Number(value);
    if (Number.isFinite(top)) commandSurfaceTop = Math.min(commandSurfaceTop, top);
  });
  var maxTop = Math.max(8, Math.min(
    containerHeight - panelHeight - 8,
    commandSurfaceTop - panelHeight - 12
  ));
  var top = _clamp(nodeY - panelHeight * 0.5, 8, maxTop);

  return _freezeLayout({
    embedded: false,
    left: left,
    mode: mode,
    top: top,
    width: panelWidth,
  });
}
