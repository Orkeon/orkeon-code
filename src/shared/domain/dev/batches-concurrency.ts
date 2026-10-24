// How many batches /dev-batches runs at once: 1 unless asked, a whole number from 1 to 4 (the crew's default child
// gate, and four suites at once on one machine). Above 1, each batch runs under its own worktree as a working
// root (crews/dev-batches/application/run-wave.ts), and only in a session mode that never asks before a shell
// command: two batches asking at once could not both be answered. That is bypassPermissions alone: acceptEdits still
// asks for shell_command, and dontAsk is read-only here (mode-policy.ts), which /dev-batches refuses at any
// concurrency. Read by the command's arguments and by the crew's input. Pure.

export const MAX_CONCURRENCY = 4;

/** The writing modes in which no shell command is asked about (call-guard.ts: acceptEdits still asks for shell_command). */
const SILENT_MODES: readonly string[] = ["bypassPermissions"];

export type Concurrency = { ok: true; value: number } | { ok: false; line: string };

/** `concurrency` as given (absent, a number or a digit string): 1 to 4, or the one line refusing it. */
export function checkConcurrency(raw: unknown): Concurrency {
  if (raw === undefined || raw === null) return { ok: true, value: 1 };
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\s*\d+\s*$/.test(raw) ? Number(raw.trim()) : NaN;
  if (!Number.isSafeInteger(n) || n < 1) return { ok: false, line: `concurrency must be a whole number from 1, not '${String(raw)}'` };
  if (n > MAX_CONCURRENCY) return { ok: false, line: `concurrency ${n} refused: at most ${MAX_CONCURRENCY} batches at once` };
  return { ok: true, value: n };
}

/** Above 1, the line refusing a session mode that asks before shell commands; null when the mode lets it run. */
export function concurrencyModeRefusal(n: number, mode: string): string | null {
  if (n <= 1 || SILENT_MODES.includes(mode.trim())) return null;
  return `concurrency ${n} refused: the session mode ${mode.trim() || "default"} asks before shell commands, and two batches would ask at once: ` +
    "/mode bypassPermissions, or run with --concurrency 1";
}

/** The line refusing a parallel run when git fails in a batch's worktree (the runtime's shell confinement). */
export function concurrencyGitRefusal(n: number): string {
  return `concurrency ${n} refused: git does not work inside a worktree under this shell confinement (Tools:Shell:Confinement:Mode); ` +
    "run with --concurrency 1 (runtime issue Orkeon/orkeon#188)";
}
