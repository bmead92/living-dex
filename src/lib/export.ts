import { getSet } from './catalog';
import { cardNumber, finishLabel, officialOf } from './cards';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Scan } from './db';
import { priceFrom } from './prices';

export type ExportFormat = 'csv' | 'list';

type Exportable = Pick<
  Scan,
  | 'quantity'
  | 'name'
  | 'set_code'
  | 'set_name'
  | 'collector_number'
  | 'finish'
  | 'condition'
  | 'rarity'
  | 'price_cents'
  | 'market_cents'
  | 'low_cents'
  | 'card_id'
  | 'market_url'
  | 'other_prices'
>;

const dollars = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2));

function csvField(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS: [string, (s: Exportable) => string | number | null][] = [
  ['Quantity', (s) => s.quantity ?? 1],
  ['Name', (s) => s.name],
  ['Set', (s) => s.set_name],
  ['Set Code', (s) => getSet(s.set_code)?.code ?? ''],
  ['Number', (s) => cardNumber(s, officialOf(s.set_code))],
  ['Finish', (s) => finishLabel(s.finish)],
  ['Condition', (s) => s.condition],
  ['Rarity', (s) => s.rarity],
  ['Price (USD)', (s) => dollars(s.price_cents)],
  ['Low (USD)', (s) => dollars(s.low_cents)],
  ['Total (USD)', (s) => (s.price_cents == null ? '' : dollars(s.price_cents * (s.quantity ?? 1)))],
  ['Cardmarket (EUR)', (s) => dollars(priceFrom(s, 'cardmarket'))],
  ['TCGdex ID', (s) => s.card_id],
  ['TCGplayer URL', (s) => s.market_url],
];

export function toCsv(scans: Exportable[]): string {
  const header = CSV_COLUMNS.map(([h]) => csvField(h)).join(',');
  const rows = scans.map((s) => CSV_COLUMNS.map(([, get]) => csvField(get(s))).join(','));
  return [header, ...rows].join('\r\n') + '\r\n';
}


const oneLine = (v: string) => v.replace(/\s+/g, ' ').trim();

export function toCardList(scans: Exportable[]): string {
  return (
    scans
      .map(
        (s) =>
          `${s.quantity ?? 1} ${oneLine(s.name)} ${getSet(s.set_code)?.code ?? s.set_code.toUpperCase()} ${s.collector_number}`,
      )
      .join('\n') + '\n'
  );
}

export function exportFileName(format: ExportFormat, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `living-dex-${day}.${format === 'csv' ? 'csv' : 'txt'}`;
}

export async function shareExport(format: ExportFormat, scans: Exportable[]): Promise<void> {
  const content = format === 'csv' ? toCsv(scans) : toCardList(scans);
  const file = new File(Paths.cache, exportFileName(format));
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, {
    mimeType: format === 'csv' ? 'text/csv' : 'text/plain',
    dialogTitle: format === 'csv' ? 'Export collection (spreadsheet)' : 'Export collection (card list)',
    UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'public.plain-text',
  });
}
