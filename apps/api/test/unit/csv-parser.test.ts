import { CsvScoreFileParser } from '../../src/modules/score-datasets/infrastructure/csv-score-file.parser';
import {
  decodeFloat64,
  encodeFloat64,
} from '../../src/modules/score-datasets/infrastructure/kysely-score-dataset.repository';
import { ValidationError } from '../../src/shared/errors';

const parser = new CsvScoreFileParser();
const parse = (text: string) => parser.parse(Buffer.from(text, 'utf8'));

describe('CsvScoreFileParser', () => {
  it('разбирает стандартный CSV', () => {
    const r = parse('score,label\n0.9,genuine\n0.2,impostor\n0.8,genuine\n');
    expect(Array.from(r.genuine)).toEqual([0.9, 0.8]);
    expect(Array.from(r.impostor)).toEqual([0.2]);
  });

  it('BOM, разделитель «;», десятичная запятая, пустые строки, CRLF, кавычки', () => {
    const r = parse('﻿"label";"score"\r\n\r\ngenuine;0,75\r\nimpostor;0,25\r\n');
    expect(Array.from(r.genuine)).toEqual([0.75]);
    expect(Array.from(r.impostor)).toEqual([0.25]);
  });

  it('метки 1/0 и табуляция', () => {
    const r = parse('score\tlabel\n0.7\t1\n0.1\t0\n');
    expect(r.genuine.length).toBe(1);
    expect(r.impostor.length).toBe(1);
  });

  it('ошибки указывают номер строки', () => {
    expect(() => parse('score,label\n0.9,genuine\nabc,impostor\n')).toThrow(/строка 3/);
    expect(() => parse('score,label\n0.9,genuine\n0.1,кто-то\n')).toThrow(/неизвестная метка/);
    expect(() => parse('a,b\n1,2\n')).toThrow(/заголовок/);
    expect(() => parse('score,label\n0.9,genuine\n')).toThrow(ValidationError);
    expect(() => parse('')).toThrow(/не содержит данных/);
  });

  it('Float64 LE: кодирование без потерь', () => {
    const values = Float64Array.from([0, -1.5, 1e-300, Math.PI, 0.1 + 0.2]);
    const buf = encodeFloat64(values);
    expect(buf.length).toBe(40);
    expect(Array.from(decodeFloat64(buf))).toEqual(Array.from(values));
  });
});
