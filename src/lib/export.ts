import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { listTransactions, readBackupData } from '@/db/repositories';

import { buildBackup, type Backup } from './backup';
import { toCsv } from './csv';
import { today } from './dates';
import { toMajor } from './money';

/**
 * Exports every transaction as CSV. On native the file goes through the share
 * sheet (Files, Drive, email, ...); on web it is downloaded.
 * Returns the number of exported rows.
 */
export async function exportTransactionsCsv(db: SQLiteDatabase, currency: string): Promise<number> {
  const rows = await listTransactions(db);
  const csv = toCsv(
    ['Date', 'Type', 'Amount', 'Currency', 'Category', 'Account', 'To account', 'Labels', 'Note'],
    rows.map((t) => [
      t.occurredOn,
      t.type,
      // Signed so a spreadsheet SUM gives net cash flow; transfers are neutral.
      t.type === 'expense' ? -toMajor(t.amount, currency) : toMajor(t.amount, currency),
      currency,
      t.categoryName ?? '',
      t.accountName,
      t.toAccountName ?? '',
      t.labels.map((label) => label.name).join('; '),
      t.note,
    ])
  );
  await saveTextFile(`expenses-${today()}.csv`, csv, 'text/csv', 'public.comma-separated-values-text');
  return rows.length;
}

/**
 * Writes a complete backup (all tables, plus currency and theme) as JSON and
 * hands it to the share sheet / browser download.
 */
export async function exportBackup(db: SQLiteDatabase, currency: string, theme: Backup['theme']): Promise<void> {
  const backup = buildBackup(await readBackupData(db), currency, theme);
  await saveTextFile(`mero-paisa-backup-${today()}.json`, JSON.stringify(backup), 'application/json', 'public.json');
}

async function saveTextFile(filename: string, text: string, mimeType: string, uti: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, UTI: uti });
  }
}
