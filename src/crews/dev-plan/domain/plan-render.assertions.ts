// Checks on the files the plan renderer writes.
import { ok, strictEqual } from "node:assert";

/** `text` ends with a table row and one line break, and no line ends with a space. */
export function assertTidyFile(text: string): void {
  ok(text.endsWith("|\n") && !text.endsWith("\n\n"), `the file does not end with one line break after a row: …${JSON.stringify(text.slice(-40))}`);
  ok(text.split("\n").every((l) => l === l.trimEnd()), "a line ends with a space");
}

/** `text` holds every part of `parts`, word for word. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `the render lacks ${JSON.stringify(part)}`);
}

/** Under the ## Decisions of `sheet`, one line holds each of `marks`, and it is a bullet. */
export function assertOneBulletEach(sheet: string, marks: readonly string[]): void {
  const decisions = sheet.slice(sheet.indexOf("## Decisions\n") + "## Decisions\n".length).split("\n## ")[0];
  for (const mark of marks) {
    const lines = decisions.split("\n").filter((l) => l.includes(mark));
    strictEqual(lines.length, 1, `${lines.length} decision lines hold "${mark}"`);
    ok(lines[0].startsWith("- "), lines[0]);
  }
}
