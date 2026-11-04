import { describe, expect, it } from 'vitest';

import { formatNumber, formatPercent, formatSci } from '../format';
import { numberToInput, parseNumber } from '../parse-number';

describe('форматирование чисел', () => {
  it('научная нотация с надстрочным порядком', () => {
    expect(formatSci(5e-11)).toBe('5,0·10⁻¹¹');
    expect(formatSci(1e-6, 1)).toBe('1·10⁻⁶'); // регрессия: significant = 1 ронял страницу (RangeError)
    expect(formatSci(0.00996, 2)).toBe('1,0·10⁻²'); // перенос округления в порядок
    expect(formatSci(0)).toBe('0');
  });

  it('обычные числа с запятой, малые — в научной нотации', () => {
    expect(formatNumber(0.581785716220834)).toBe('0,5818');
    expect(formatNumber(0.019925, 6)).toBe('0,019925');
    expect(formatNumber(5e-11)).toBe('5,0·10⁻¹¹');
    expect(formatNumber(null)).toBe('—');
  });

  it('проценты', () => {
    expect(formatPercent(0.017864420562817)).toBe('1,786 %');
    expect(formatPercent(0.41790539, 1)).toBe('41,8 %');
  });
});

describe('разбор чисел из полей ввода', () => {
  it.each([
    ['0,72', 0.72],
    ['0.72', 0.72],
    ['1e-6', 1e-6],
    ['1,0·10^-6', 1e-6],
    ['5·10⁻⁵', 5e-5],
    [' 10 ', 10],
    ['−0,5', -0.5],
  ])('«%s» → %d', (raw, expected) => {
    expect(parseNumber(raw)).toBeCloseTo(expected, 15);
  });

  it('пустое поле — null, мусор — NaN', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNaN();
    expect(parseNumber('1,2,3')).toBeNaN();
  });

  it('обратное преобразование сохраняет значение', () => {
    for (const x of [0.72, 1e-6, 5e-5, 1000, 0.0001]) expect(parseNumber(numberToInput(x))).toBe(x);
  });
});
