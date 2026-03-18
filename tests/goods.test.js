import { describe, it, expect } from 'vitest';
import { GOODS } from '../js/data/goods.js';

describe('Goods legality and market access', () => {
  it('所有商品都声明合法性和市场访问范围', () => {
    GOODS.forEach(function (good) {
      expect(typeof good.legality).toBe('string');
      expect(Array.isArray(good.marketAccess)).toBe(true);
      expect(good.marketAccess.length).toBeGreaterThan(0);
    });
  });

  it('武器被标记为仅黑市流通商品', () => {
    const weapons = GOODS.find(function (good) { return good.id === 'weapons'; });
    expect(weapons.legality).toBe('illegal');
    expect(weapons.marketAccess).toEqual(['black']);
  });
});