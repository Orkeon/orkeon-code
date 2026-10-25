// Checks on what the launchers hold and on what a launch left: its output, its mounts, the files it wrote.
import { ok, strictEqual } from "node:assert";
import { RESERVED, type Mention } from "./launcher.fixtures.ts";

/** `text` holds every snippet of `mentions`; each missing one is named by what it is for. */
export function assertMentions(text: string, mentions: readonly Mention[]): void {
  for (const [snippet, why] of mentions) ok(text.includes(snippet), why);
}

/** `text` (an output) says every one of `snippets`; a missing one shows the whole text. */
export function assertSays(text: string, snippets: readonly string[]): void {
  for (const snippet of snippets) ok(text.includes(snippet), `missing ${JSON.stringify(snippet)} in: ${text}`);
}

/** `text` holds none of `snippets`. */
export function assertLacks(text: string, snippets: readonly string[], why?: string): void {
  for (const snippet of snippets) ok(!text.includes(snippet), why ?? `unexpected ${JSON.stringify(snippet)} in: ${text}`);
}

/** `first` comes before `second` in `text`. */
export function assertBefore(text: string, first: string, second: string, why: string): void {
  ok(text.indexOf(first) < text.indexOf(second), why);
}

/** The mounted roots are each mounted once, and none is a root the runtime keeps for itself. */
export function assertFreeRoots(roots: readonly string[]): void {
  strictEqual(new Set(roots).size, roots.length, "no root mounted twice");
  assertNoReservedRoot(roots);
}

/** None of the mounted roots is a root the runtime keeps for itself. */
export function assertNoReservedRoot(roots: readonly string[]): void {
  ok(!roots.some((root) => RESERVED.test(root)), roots.join(", "));
}

/** No pasted key is in the file setup wrote, and the terminal shows each only as often as it was typed. */
export function assertKeysNotKept(file: string, stdout: string, keys: readonly (readonly [key: string, typed: number])[]): void {
  for (const [key, typed] of keys) {
    ok(!file.includes(key), `${key} is not in the file`);
    strictEqual(stdout.split(key).length - 1, typed, stdout);
  }
}

/** There is at least one line, and each holds `snippet`. */
export function assertEveryLineHolds(lines: readonly string[], snippet: string, what: string): void {
  ok(lines.length > 0, what);
  for (const line of lines) ok(line.includes(snippet), line);
}

/** Every folder of a store carries a UTC date to the second. */
export function assertTrustedAtDates(folders: readonly { trustedAt: string }[]): void {
  ok(folders.every((f) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(f.trustedAt)), JSON.stringify(folders));
}
