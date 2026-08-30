import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('MapUI exploration entry', function () {
  it('主界面不再渲染独立探索终端按钮和浮层', function () {
    const html = readFileSync('index.html', 'utf8');

    expect(html).not.toContain('id="exploration-terminal-btn"');
    expect(html).not.toContain('exploration-terminal-menu-btn');
    expect(html).not.toContain('id="rail-icon-explore"');
    expect(html).not.toContain('id="current-system-exploration-card"');
    expect(html).not.toContain('id="hud-target-detail-open"');
  });

  it('星球详情仍保留直接调查 探索点 的入口', function () {
    const mapUiSource = readFileSync('js/ui/MapUI.js', 'utf8');
    const panelViewSource = readFileSync('js/ui/MapPanelViewController.js', 'utf8');
    const planetPresenterSource = readFileSync('js/ui/MapPlanetDetailPresenter.js', 'utf8');
    const presenterSource = readFileSync('js/ui/MapExplorationPresenter.js', 'utf8');

    expect(mapUiSource).not.toContain("from './MapPlanetDetailPresenter.js'");
    expect(mapUiSource).toContain("from './MapPanelViewController.js'");
    expect(mapUiSource).not.toContain('buildMapPlanetDetailView(stateRef, displayId');
    expect(panelViewSource).toContain("from './MapPlanetDetailPresenter.js'");
    expect(panelViewSource).toContain('buildMapPlanetDetailView(state, displayId');
    expect(planetPresenterSource).toContain("from './MapExplorationPresenter.js'");
    expect(planetPresenterSource).toContain('buildMapExplorationSection(state, sys, planetData');
    expect(mapUiSource).not.toContain('function _buildExplorationSection');
    expect(presenterSource).toContain('export function buildMapExplorationSection');
    expect(presenterSource).toContain("type: 'poi'");
    expect(presenterSource).toContain('调查当前航点探索点');
  });
});
