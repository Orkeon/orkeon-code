// A work folder of verdict files in a LiveListingFiles, and the dependencies harvestAfterGaps runs over.
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import { LEARN_STATE_FILE } from "../../domain/dev/learn-state.ts";
import { collectLearnRows } from "../../domain/shared-memory/verdict-rows.ts";
import { LiveListingFiles } from "../../../../tests/doubles/live-listing-files.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { WORKSPACE } from "../../domain/dev/path-rebase.ts";

export const W = `${WORKSPACE}/workbench`;
export const work = { folder: "workbench", vfsPath: W };
export const OUTSIDE_MOUNTS = { folder: "x", vfsPath: null };
export const layout = memoryLayout(".orkeon/memory");
export const GAP = "the empty cart is never tested";
export const CANDIDATE = `${layout.candidates}/shop-mistake-20261024-the-empty-cart-is-never-tested.md`;
export const NUDGE_THREE =
  "→ 3 untreated verdict gaps across 3 batches: /dev-learn turns those that recur into rules (in a fresh session).";
export const NUDGE_TWO =
  "→ 2 untreated verdict gaps across 2 batches: /dev-learn turns those that recur into rules (in a fresh session).";

/** A verdict file of batch `batch` holding one Major row per gap. */
export const verdict = (prefix: string, batch: string, gaps: readonly string[], verdictWord = "GAPS"): string => [
  `# ${prefix}-VERIFY-${batch} — 2026-10-18 15:00 — fast`, "", `## Verdict — ${verdictWord}`, "",
  "| Severity | Axis | Gap | Evidence | Expected fix |", "|----------|------|-----|----------|--------------|",
  ...gaps.map((g, i) => `| Major | Tests | ${g} | \`src/${prefix.toLowerCase()}/cart.ts:${i + 3}\` | add the empty-cart test |`), "",
].join("\n");

/** One work folder per key, each holding the F1 verdict of its gaps; the project is shop, the clock 2026-10-24. */
export function setup(folders: Record<string, string[]>) {
  const files = new LiveListingFiles();
  for (const [code, gaps] of Object.entries(folders)) {
    files.files.set(`${W}/${code}/${code.toUpperCase()}-VERIFY-F1.md`, verdict(code.toUpperCase(), "F1", gaps));
  }
  const values: Record<string, string> = { "memory.project": "shop" };
  const config = { readValue: async (key: string) => ({ key, value: values[key], source: "file" }) as never };
  const log = new FakeLogger();
  const deps = { files, shell: new FakeShell(), config, clock: () => new Date("2026-10-24T10:00:00Z"), log };
  return { files, log, deps };
}

/** Records the first `count` verdict rows of `files` as treated by /dev-learn. */
export function treatFirstRows(files: LiveListingFiles, count: number): void {
  const rows = collectLearnRows([...files.files].map(([path, text]) => ({ code: path.split("/")[3], name: path.split("/")[4], text })));
  files.files.set(`${WORKSPACE}/${LEARN_STATE_FILE}`, JSON.stringify({ version: 1, treated: rows.slice(0, count).map((r) => r.id), decisions: [] }));
}

export const throwingClock = (): Date => { throw new Error("no clock"); };
