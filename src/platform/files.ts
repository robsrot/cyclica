/**
 * Saving files out of the app and reading files in. Everything happens on the device.
 *
 * On iPhone the share sheet is the dependable route: "Save to Files" lets you pick iCloud Drive or any provider.
 * If sharing files isn't supported (e.g. some desktop browsers), the files are downloaded instead.
 */

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

export async function saveFiles(files: { name: string; text: string; type: string }[], title: string): Promise<SaveResult> {
  const fileObjects = files.map((f) => new File([f.text], f.name, { type: f.type }));
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: fileObjects })) {
    try {
      await nav.share({ files: fileObjects, title });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Some browsers claim support but refuse at runtime: fall back to downloading.
    }
  }
  for (const f of fileObjects) download(f);
  return 'downloaded';
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Refuses implausibly large files before reading them into memory. */
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

export async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('This file is too large to be a Cyclica backup.');
  return file.text();
}
