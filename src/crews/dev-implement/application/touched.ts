// The files a batch's roles changed, as code observed them, kept beside Orkeon's own state
// (`.orkeon/dev/<code>/implement-F<n>.json`, outside git) so that the close commits these files
// and no other, whichever run of the batch made them.
import type { Files } from "../../../shared/application/ports.ts";

export function touchedPath(code: string, batch: string): string {
  return `/workspace/.orkeon/dev/${code}/implement-${batch}.json`;
}

export async function readTouched(files: Pick<Files, "read">, code: string, batch: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await files.read(touchedPath(code, batch))) as { touched?: unknown };
    return Array.isArray(parsed.touched) ? parsed.touched.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** Writes the list, sorted; a write that fails is said by the close, which then finds none. */
export async function recordTouched(files: Pick<Files, "write">, code: string, batch: string, touched: readonly string[]): Promise<void> {
  try {
    await files.write(touchedPath(code, batch), `${JSON.stringify({ batch, touched: [...new Set(touched)].sort() }, null, 2)}\n`);
  } catch {
    // the close says it found no list
  }
}
