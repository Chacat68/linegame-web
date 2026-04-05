# 3D星空图使用指南 / 3D Star Map Guide

## 功能概述 / Overview

蓝脉航路现在支持3D星空图功能，用户可以在传统的2D地图和新的3D星空视图之间切换。3D视图提供了更加沉浸式的星系探索体验，支持拖拽旋转、缩放等交互操作。

The Aether Trade Route now supports 3D star map functionality. Users can switch between the traditional 2D map and the new 3D star view. The 3D view provides a more immersive galaxy exploration experience with drag-to-rotate, zoom, and other interactive features.

## 使用方法 / Usage

### 切换视图 / Toggle View

在星图界面的左侧按钮组中，点击 **🌐 3D视图** 按钮即可切换到3D模式。再次点击（显示为 **📊 2D视图**）可切换回2D模式。

Click the **🌐 3D View** button in the button group on the left side of the star map interface to switch to 3D mode. Click again (shown as **📊 2D View**) to switch back to 2D mode.

### 3D视图控制 / 3D View Controls

#### 鼠标操作 / Mouse Controls

- **左键拖拽**: 旋转镜头视角
  - **Left Click + Drag**: Rotate camera view

- **滚轮滚动**: 缩放视图
  - **Mouse Wheel**: Zoom in/out

- **右键拖拽**: 平移视图
  - **Right Click + Drag**: Pan view

- **鼠标悬停**: 高亮星球/星系，显示详情面板
  - **Mouse Hover**: Highlight planet/galaxy and show detail panel

- **左键点击星球**: 跳转到该星球
  - **Left Click on Planet**: Travel to that planet

- **左键点击星系**: 跳转到该星系（在星系总览模式下）
  - **Left Click on Galaxy**: Jump to that galaxy (in galaxy overview mode)

### 视觉特性 / Visual Features

1. **3D星空背景**: 1000+颗动态星星，缓慢旋转营造太空感
   - **3D Starfield Background**: 1000+ dynamic stars with slow rotation for space ambiance

2. **星球深度**: 星球按照其坐标在3D空间中分布，具有真实的深度感
   - **Planet Depth**: Planets are distributed in 3D space with realistic depth

3. **发光效果**: 当前所在星球具有脉动的发光效果
   - **Glow Effects**: Current planet has pulsing glow effect

4. **连接线**: 显示附近星球之间的航线连接
   - **Connection Lines**: Show travel routes between nearby planets

5. **文字标签**: 星系名称以3D精灵形式显示
   - **Text Labels**: Galaxy names displayed as 3D sprites

## 技术细节 / Technical Details

### 使用的技术 / Technologies Used

- **Babylon.js**: 3D渲染引擎
  - 3D rendering engine

- **ArcRotateCamera (内置轨道控制)**: 轨道相机控制器，支持拖拽旋转
  - ArcRotateCamera - built-in orbit camera controller for drag-to-rotate

- **Scene Picking**: 鼠标拾取和交互
  - Mouse picking and interaction

- **WebGL**: 硬件加速渲染
  - Hardware-accelerated rendering

### 性能优化 / Performance Optimization

- 独立的动画循环，仅在3D模式激活时运行
  - Separate animation loop, runs only when 3D mode is active

- 设备像素比支持，自动适配高DPI显示器
  - Device pixel ratio support for HiDPI displays

- 响应式调整，窗口大小改变时自动重新计算
  - Responsive resizing when window size changes

- 动作级别设置支持（完整/减弱/关闭）
  - Motion level settings support (full/reduced/off)

### 文件结构 / File Structure

```
js/ui/Renderer3DAdvanced.js # 增强型3D渲染器主模块 / Main advanced 3D renderer module
js/core/GameManager.js    # 集成3D渲染循环 / Integrated 3D render loop
js/ui/MapUI.js            # 3D切换按钮处理 / 3D toggle button handler
index.html                # Babylon.js导入和3D画布 / Babylon.js import and 3D canvas
```

## 已知限制 / Known Limitations

1. 3D模式下暂不支持市场价格矩阵覆盖层的显示（可切换回2D查看）
   - Market price matrix overlay not displayed in 3D mode (switch to 2D to view)

2. 星球位置基于2D坐标转换，深度使用数学函数生成
   - Planet positions based on 2D coordinates conversion, depth generated using math functions

3. 需要WebGL支持的浏览器（现代浏览器均支持）
   - Requires WebGL-capable browser (supported by all modern browsers)

## 未来改进方向 / Future Improvements

- [ ] 添加自定义相机路径动画
- [ ] 支持VR/AR模式
- [ ] 更多3D特效（粒子系统、光束等）
- [ ] 星球表面细节纹理
- [ ] 真实的轨道运动动画
- [ ] 自定义星系布局编辑器

## 故障排除 / Troubleshooting

### 3D视图显示空白
- 检查浏览器是否支持WebGL
- 检查浏览器控制台是否有错误信息
- 尝试刷新页面

### 性能问题
- 在设置中调整动作级别为"减弱"或"关闭"
- 关闭浏览器的其他标签页释放内存
- 切换回2D视图

### 鼠标交互无响应
- 确认已切换到3D视图模式
- 检查鼠标是否悬停在星球/星系上
- 尝试调整相机角度查看其他区域
