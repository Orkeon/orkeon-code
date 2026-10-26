// Normaliser for tool results whose property casing varies — .NET-bridged CLR
// types come back PascalCase, pure-JS tools camel/snake_case. Centralises the
// `r.stdout ?? r.Stdout` / `pick(...,"messages","Messages")` dual-casing that
// was duplicated inline across every crew (git-commit:14-16, code-review:12,
// project-init:9, session-compact:10, init-verifiers:10). Pure — no IO. The
// adapters of this folder read every result through it, and the failures of a
// tool call: the runtime wraps the tool's own message, which is all a user reads.
//
// Run tests: node --test src/shared/infrastructure/orkeon/tool-results.test.ts

import type { ToolOutcome } from "../../application/ports.ts";

/** First defined property among the given candidate names (any casing). */
export function pick(obj: any, ...names: string[]): any {
  if (!obj) return undefined;
  for (const n of names) {
    if (obj[n] !== undefined) return obj[n];
  }
  return undefined;
}

/** `stdout` of a shell_command result (snake or Pascal), as a string. */
export function shOut(r: any): string {
  return String(pick(r, "stdout", "Stdout") ?? "");
}

/** `stderr` of a shell_command result (snake or Pascal), as a string. */
export function shErr(r: any): string {
  return String(pick(r, "stderr", "Stderr") ?? "");
}

/** `exit_code` of a shell_command result (snake/camel/Pascal); -1 if absent. */
export function shCode(r: any): number {
  return Number(pick(r, "exit_code", "exitCode", "ExitCode") ?? -1);
}

/** `content` / `text` of a file_read result (snake or Pascal), as a string; a
 *  result that is itself a string is the content. */
export function fileContent(r: any): string {
  if (typeof r === "string") return r;
  return String(pick(r, "content", "Content", "text", "Text") ?? "");
}

/** Coerce a value to an array (returns [] for null/undefined/non-array). */
export function asArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * Entry names from a directory_read result. The real tool shape is
 * `{ Files: [{Name,Path}], Directories: [{Name,Path}] }`; the older
 * `{ entries|Entries|items }` shape is tolerated too. Names + casing vary.
 */
export function entryNames(listing: any): string[] {
  const files = asArray(pick(listing, "files", "Files"));
  const dirs = asArray(pick(listing, "directories", "Directories"));
  const legacy = asArray(pick(listing, "entries", "Entries", "items"));
  return [...files, ...dirs, ...legacy].map((e: any) =>
    String(pick(e, "name", "Name", "path", "Path") ?? e));
}

/** A tool result as text: a string as it is; else the first string field among
 *  text, content and result (either case); else its JSON; nothing for no result. */
export function resultText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "object") {
    for (const key of ["text", "content", "result", "Text", "Content", "Result"]) {
      const field = (raw as Record<string, unknown>)[key];
      if (typeof field === "string") return field;
    }
  }
  return JSON.stringify(raw);
}

/**
 * A failed tool call as one readable line: the tool's own message, without what the
 * runtime wraps it in ("One or more errors occurred. (tools.transcribeAudio failed
 * [path=…]: Error executing tool transcribe_audio: …)").
 */
export function failureText(error: unknown): string {
  let text = (error instanceof Error ? error.message : String(error)).trim();
  const executing = /Error executing tool [\w.-]+: ([\s\S]*)$/.exec(text);
  const failed = /tools\.\w+ failed \[[^\]]*\]: ([\s\S]*)$/.exec(text);
  if (executing) text = executing[1];
  else if (failed) text = failed[1];
  text = text.split("\n")[0].trim();
  const count = (c: string) => text.split(c).length - 1;
  while (text.endsWith(")") && count(")") > count("(")) text = text.slice(0, -1);
  return text.trim();
}

/** A call read as text: its result's text, or its failure's own message. Never throws. */
export async function toolOutcome(call: () => Promise<unknown>): Promise<ToolOutcome> {
  try {
    return { ok: true, text: resultText(await call()) };
  } catch (error) {
    return { ok: false, failure: failureText(error) };
  }
}

/** A call whose failure is rethrown with the tool's own message (failureText): what an
 *  adapter's caller shows of it reads the same as a failed tool call. */
export async function withToolMessage<T>(call: () => Promise<T> | T): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new Error(failureText(error));
  }
}
