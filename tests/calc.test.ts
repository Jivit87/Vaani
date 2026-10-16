import { describe, expect, it } from 'vitest';
import { calculate, formatNumber } from '../src/agent/calc';

describe('calculate', () => {
  it.each([
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['2 ^ 10', 1024],
    ['2 ** 3 ** 2', 512], // right associative
    ['-3 ^ 2', -9], // unary minus is looser than ^
    ['10 / 4', 2.5],
    ['15% * 240', 36],
    ['200 + 10%', 200.1], // postfix percent is a fraction, not "percent of"
    ['sqrt(144) + abs(-3)', 15],
    ['pow(2, 8)', 256],
    ['max(3, 9) - min(3, 9)', 6],
    ['round(2.6) + floor(2.9) + ceil(2.1)', 8],
    ['1,000 + 5', 1005],
    ['6 × 7', 42],
    ['84 ÷ 4', 21],
    ['2 * pi', 2 * Math.PI],
    ['1e3 + 1', 1001],
  ])('%s = %s', (expr, want) => {
    expect(calculate(expr)).toBeCloseTo(want, 10);
  });

  it.each([
    ['1 / 0', 'division by zero'],
    ['2 +', 'unexpected end'],
    ['(2 + 3', 'missing )'],
    ['2 3', 'trailing'],
    ['foo(2)', 'unknown name'],
    ['sqrt 4', 'needs'],
    ['pow(2)', 'takes 2'],
    ['2; alert(1)', 'unexpected character'],
    ['process.exit()', 'unexpected character'],
    ['sqrt(-1)', 'finite'],
    ['9'.repeat(201), 'too long'],
  ])('rejects %s', (expr, why) => {
    expect(() => calculate(expr)).toThrow(why);
  });

  it('formats without floating point noise', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(1 / 3)).toBe('0.333333333333');
    expect(formatNumber(1747)).toBe('1747');
  });
});
