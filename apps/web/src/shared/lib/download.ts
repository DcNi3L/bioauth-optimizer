export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}

/** CSV с разделителем «;» и BOM — корректно открывается в Excel с русской локалью. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]): void {
  const cell = (v: string | number | null) => {
    if (v === null) return '';
    const s = typeof v === 'number' ? String(v) : v;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  downloadBlob(filename, new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
