import { MAX_DATASET_ROWS } from '@bioauth/contracts';
import { Injectable } from '@nestjs/common';

import { ValidationError } from '../../../shared/errors';
import type { ScoreFileParser, ScoreSamples } from '../application/ports';

const SCORE_HEADERS = new Set(['score', 'оценка', 'similarity', 's']);
const LABEL_HEADERS = new Set(['label', 'метка', 'class', 'type']);
const GENUINE = new Set(['genuine', 'g', '1', 'true', 'законный', 'mated']);
const IMPOSTOR = new Set([
  'impostor',
  'imposter',
  'i',
  '0',
  'false',
  'злоумышленник',
  'nonmated',
  'non-mated',
]);

/**
 * CSV с колонками score,label. Поддерживаются BOM, разделители «,», «;», табуляция,
 * десятичная запятая (если разделитель не запятая). Ошибка указывает номер строки.
 */
@Injectable()
export class CsvScoreFileParser implements ScoreFileParser {
  parse(content: Buffer): ScoreSamples {
    let text = content.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const lines = text.split(/\r?\n/);
    let lineNo = 0;
    while (lineNo < lines.length && lines[lineNo]!.trim() === '') lineNo++;
    if (lineNo >= lines.length) throw new ValidationError('файл не содержит данных', 'file');

    const headerLine = lines[lineNo]!;
    const delimiter = headerLine.includes(';') ? ';' : headerLine.includes('\t') ? '\t' : ',';
    const header = headerLine.split(delimiter).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    const scoreCol = header.findIndex((h) => SCORE_HEADERS.has(h));
    const labelCol = header.findIndex((h) => LABEL_HEADERS.has(h));
    if (scoreCol < 0 || labelCol < 0) {
      throw new ValidationError('строка 1: нужен заголовок с колонками score и label', 'file');
    }

    const genuine: number[] = [];
    const impostor: number[] = [];
    for (let k = lineNo + 1; k < lines.length; k++) {
      const raw = lines[k]!;
      if (raw.trim() === '') continue;
      const cells = raw.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
      const where = `строка ${k + 1}`;
      const scoreText = cells[scoreCol];
      const labelText = cells[labelCol]?.toLowerCase();
      if (scoreText === undefined || labelText === undefined) {
        throw new ValidationError(`${where}: не хватает колонок`, 'file');
      }
      const score = Number(delimiter === ',' ? scoreText : scoreText.replace(',', '.'));
      if (scoreText === '' || !Number.isFinite(score)) {
        throw new ValidationError(`${where}: «${scoreText}» не является числом`, 'file');
      }
      if (GENUINE.has(labelText)) genuine.push(score);
      else if (IMPOSTOR.has(labelText)) impostor.push(score);
      else
        throw new ValidationError(
          `${where}: неизвестная метка «${cells[labelCol]}» (ожидается genuine или impostor)`,
          'file',
        );
      if (genuine.length + impostor.length > MAX_DATASET_ROWS) {
        throw new ValidationError(`в файле больше ${MAX_DATASET_ROWS} строк`, 'file');
      }
    }
    if (genuine.length === 0)
      throw new ValidationError('нет оценок законных пользователей (genuine)', 'file');
    if (impostor.length === 0) throw new ValidationError('нет оценок злоумышленников (impostor)', 'file');
    return { genuine: Float64Array.from(genuine), impostor: Float64Array.from(impostor) };
  }
}
