// Normaliser for tool results whose property casing varies — .NET-bridged CLR
// types come back PascalCase, pure-JS tools camel/snake_case. Centralises the
// `r.stdout ?? r.Stdout` / `pick(...,"messages","Messages")` dual-casing that
// was duplicated inline across every crew (git-commit:14-16, code-review:12,
// project-init:9, session-compact:10, init-verifiers:10). Pure — no IO. The
// adapters of this folder read every result through it.
//
// Run tests: node --test src/shared/infrastructure/orkeon/tool-results.test.ts

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
