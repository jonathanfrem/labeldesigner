const PROJECT_FILE_TYPE = {
  description: 'Label project',
  accept: { 'application/json': ['.lbl.json'] },
};

export function isFileSystemAccessSupported(): boolean {
  return typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function';
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Returns null if the user cancelled the picker. */
export async function pickSaveHandle(suggestedName: string): Promise<FileSystemFileHandle | null> {
  try {
    return await window.showSaveFilePicker!({ suggestedName, types: [PROJECT_FILE_TYPE] });
  } catch (err) {
    if (isAbortError(err)) return null;
    throw err;
  }
}

/** Returns null if the user cancelled the picker. */
export async function pickOpenHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const [handle] = await window.showOpenFilePicker!({ types: [PROJECT_FILE_TYPE] });
    return handle ?? null;
  } catch (err) {
    if (isAbortError(err)) return null;
    throw err;
  }
}

export async function writeToHandle(handle: FileSystemFileHandle, contents: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(contents);
  await writable.close();
}

export async function readFromHandle(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

/**
 * A handle loaded back out of IndexedDB loses its permission grant on a
 * fresh page load — the browser requires re-confirming intent before this
 * app can read or write it again.
 */
export async function verifyPermission(handle: FileSystemFileHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  const descriptor = { mode };
  if ((await handle.queryPermission(descriptor)) === 'granted') return true;
  return (await handle.requestPermission(descriptor)) === 'granted';
}
