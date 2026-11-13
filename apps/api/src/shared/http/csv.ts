/** Защита от CSV-инъекции: ячейка, начинающаяся с = + - @, открывается в Excel как формула. */
export function csvCell(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) s = '';
  else if (typeof value === 'string') s = value;
  else s = JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Таблица CSV с заголовком и BOM, чтобы Excel узнал UTF-8. */
export function csvTable<T>(columns: readonly (keyof T & string)[], rows: readonly T[]): string {
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','));
  return '\uFEFF' + lines.join('\n') + '\n';
}
