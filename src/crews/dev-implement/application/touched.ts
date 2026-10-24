// The files a batch's roles changed, as code observed them, kept beside Orkeon's own state
// (`.orkeon/dev/<code>/implement-F<n>.json`, outside git) so that the close commits these files
// and no other, whichever run of the batch made them.
import type { Files } from "../../../shared/application/ports.ts";
import { contentHash } from "./observe.ts";

/** The mark of a verdict file's text: its hash, or "none" when there is no verdict file. */
export function verdictMarkOf(text: string | null): string {
  return text === null ? "none" : contentHash(text);
}

/** The mark of the batch's verdict file as it is now. */
export async function currentVerdictMark(files: Pick<Files, "read">, verdictPath: string): Promise<string> {
  try {
    return verdictMarkOf(await files.read(verdictPath));
  } catch {
    return verdictMarkOf(null);
  }
}

export function touchedPath(code: string, batch: string): string {
  return `/workspace/.orkeon/dev/${code}/implement-${batch}.json`;
}

export interface TouchedRecord {
  touched: string[];
  /** The hash of the batch's verdict file when the list was last written ("none" without one): the close
   *  wants a verdict written since, so an audit older than the last change never commits it. */
  verdictMark: string | null;
}

export async function readTouchedRecord(files: Pick<Files, "read">, code: string, batch: string): Promise<TouchedRecord> {
  try {
    const parsed = JSON.parse(await files.read(touchedPath(code, batch))) as { touched?: unknown; verdictMark?: unknown };
    return {
      touched: Array.isArray(parsed.touched) ? parsed.touched.filter((p): p is string => typeof p === "string") : [],
      verdictMark: typeof parsed.verdictMark === "string" ? parsed.verdictMark : null,
    };
  } catch {
    return { touched: [], verdictMark: null };
  }
}

export async function readTouched(files: Pick<Files, "read">, code: string, batch: string): Promise<string[]> {
  return (await readTouchedRecord(files, code, batch)).touched;
}

/** Writes the list, sorted; a write that fails is said by the close, which then finds none. */
export async function recordTouched(
  files: Pick<Files, "write">, code: string, batch: string, touched: readonly string[], verdictMark: string,
): Promise<void> {
  try {
    await files.write(touchedPath(code, batch), `${JSON.stringify({ batch, touched: [...new Set(touched)].sort(), verdictMark }, null, 2)}\n`);
  } catch {
    // the close says it found no list
  }
}
