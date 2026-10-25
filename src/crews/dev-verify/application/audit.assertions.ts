// Checks on the prompts runAudit sent and the logs it wrote.
import { ok } from "node:assert";
import type { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FOLDER } from "./audit.fixtures.ts";

/** `text` holds each of `parts` as written. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `the text lacks ${JSON.stringify(part)}:\n${text}`);
}

/** The validations log of the capture folder starts with `start`. */
export function assertValidationsLog(files: FakeFiles, start: string): void {
  const log = files.files.get(`${FOLDER}/validations.txt`) ?? "";
  ok(log.startsWith(start), `validations.txt does not start with ${JSON.stringify(start)}:\n${log}`);
}
