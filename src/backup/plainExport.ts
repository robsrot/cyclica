/**
 * Plain, UNENCRYPTED export for reading your data elsewhere (a spreadsheet, a clinician, another app).
 * One JSON file with everything, plus one CSV file per record kind.
 */
import { APP_VERSION } from '../app/version';
import type { BaseRecord } from '../domain/model/base';

export interface ExportFile {
  name: string;
  text: string;
  type: string;
}

const FIRST_COLUMNS = ['id', 'kind', 'createdAt', 'updatedAt'];

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Quote when needed; also neutralise spreadsheet formula injection (cells starting with = + - @).
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(records: BaseRecord[]): string {
  const keys = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) keys.add(k);
  const columns = [
    ...FIRST_COLUMNS.filter((c) => keys.has(c)),
    ...[...keys].filter((k) => !FIRST_COLUMNS.includes(k)).sort(),
  ];
  const lines = [columns.join(',')];
  const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const r of sorted) lines.push(columns.map((c) => csvCell((r as Record<string, unknown>)[c])).join(','));
  // \r\n line endings and a BOM so Excel and Numbers open UTF-8 (umlauts) correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function buildPlainExport(records: BaseRecord[], date = new Date()): ExportFile[] {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  const files: ExportFile[] = [
    {
      name: `cyclica-export-${stamp}.json`,
      type: 'application/json',
      text: JSON.stringify(
        {
          note: 'Unencrypted export from Cyclica. Anyone with this file can read it.',
          app: 'Cyclica',
          appVersion: APP_VERSION,
          exportedAt: date.toISOString(),
          recordCount: records.length,
          records,
        },
        null,
        2,
      ),
    },
  ];
  const byKind = new Map<string, BaseRecord[]>();
  for (const r of records) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  for (const [kind, list] of [...byKind.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    files.push({ name: `cyclica-export-${stamp}-${kind}.csv`, type: 'text/csv', text: toCsv(list) });
  }
  return files;
}
