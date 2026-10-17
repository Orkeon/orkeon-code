// A JSON file a person may edit by hand (the /config settings, the /agents
// registry), over the Files port: read guarded against malformed content, written
// pretty-printed.

import type { Files } from "./ports.ts";

/**
 * Reads the file. An absent or blank file is the normal first state: no value, not
 * malformed. Malformed JSON, or a read that fails for another reason than absence,
 * yields no value and the `malformed` flag, because writing over a file we could
 * not parse would destroy whatever it did contain.
 */
export async function readJsonFile(
  files: Pick<Files, "read">,
  path: string,
): Promise<{ value: unknown; malformed: boolean }> {
  try {
    const content = (await files.read(path)).trim();
    if (content.length === 0) return { value: undefined, malformed: false };
    return { value: JSON.parse(content), malformed: false };
  } catch (e: any) {
    // A read failure is "absent" in the common case. Distinguishing absent from
    // unreadable needs an error shape the tool does not promise, so the only safe
    // reading is: nothing persisted, and never write over it blindly.
    const message = String(e?.message ?? e);
    const looksMissing = /not found|no such|does not exist/i.test(message);
    return { value: undefined, malformed: !looksMissing };
  }
}

/** Writes the file pretty-printed, with a final newline: a person edits it too. */
export async function writeJsonFile(files: Pick<Files, "write">, path: string, value: unknown): Promise<void> {
  await files.write(path, `${JSON.stringify(value, null, 2)}\n`);
}
