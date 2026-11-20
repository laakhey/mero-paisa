import { File } from 'expo-file-system';
import { Platform } from 'react-native';

const KINDS = {
  csv: {
    accept: '.csv,text/csv',
    // File providers disagree on the MIME type of .csv, so accept the common ones.
    mimeTypes: ['text/*', 'application/csv', 'application/vnd.ms-excel', 'application/octet-stream'],
  },
  json: {
    accept: '.json,application/json',
    mimeTypes: ['application/json', 'text/*', 'application/octet-stream'],
  },
} as const;

/** Lets the user choose a file and returns its text, or null if they cancel. */
export async function pickTextFile(kind: keyof typeof KINDS): Promise<string | null> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = KINDS[kind].accept;
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) file.text().then(resolve, reject);
        else resolve(null);
      };
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  const picked = await File.pickFileAsync({ mimeTypes: [...KINDS[kind].mimeTypes] });
  if (picked.canceled) return null;
  return picked.result.text();
}
