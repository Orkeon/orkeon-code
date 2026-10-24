// harvestAfterGaps over fixture verdict files in a LiveListingFiles work folder (M-7): the candidates a recurring
// gap justifies, the /dev-learn nudge at two batches, nothing below, nothing on a failure. Run:
//   node --test src/shared/application/shared-memory/harvest-after-gaps.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { harvestAfterGaps, learnNudge } from "./harvest-after-gaps.ts";
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import { LEARN_STATE_FILE } from "../../domain/dev/learn-state.ts";
import { collectLearnRows } from "../../domain/shared-memory/verdict-rows.ts";
import { LiveListingFiles } from "../../../../tests/doubles/live-listing-files.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const W = "/workspace/workbench";
const work = { folder: "workbench", vfsPath: W };
const layout = memoryLayout(".orkeon/memory");
const GAP = "the empty cart is never tested";

const verdict = (prefix: string, batch: string, gaps: readonly string[], verdictWord = "GAPS"): string => [
  `# ${prefix}-VERIFY-${batch} — 2026-10-18 15:00 — fast`, "", `## Verdict — ${verdictWord}`, "",
  "| Severity | Axis | Gap | Evidence | Expected fix |", "|----------|------|-----|----------|--------------|",
  ...gaps.map((g, i) => `| Major | Tests | ${g} | \`src/${prefix.toLowerCase()}/cart.ts:${i + 3}\` | add the empty-cart test |`), "",
].join("\n");

function setup(folders: Record<string, string[]>) {
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

describe("harvestAfterGaps", () => {
  it("writes one mistake candidate for a gap that recurs in three batches, names it, and nudges /dev-learn", async () => {
    const f = setup({ a: [GAP], b: [GAP], c: [GAP] });
    const lines = await harvestAfterGaps(f.deps, work);
    const candidate = `${layout.candidates}/shop-mistake-20261024-the-empty-cart-is-never-tested.md`;
    ok(f.files.files.has(candidate), [...f.files.files.keys()].join("\n"));
    ok(f.files.files.get(candidate)?.includes("status: candidate"));
    strictEqual(lines.length, 2, lines.join("\n"));
    ok(lines[0].startsWith("shared memory: 1 mistake candidate harvested from the audits ("), lines[0]);
    ok(lines[0].endsWith("→ /memory-admit decides each one."), lines[0]);
    strictEqual(lines[1], "→ 3 untreated verdict gaps across 3 batches: /dev-learn turns those that recur into rules (in a fresh session).");
    for (const w of f.files.writes) ok(w.path.startsWith(`${layout.candidates}/`), w.path);
  });

  it("at two batches: no candidate (the threshold is three) but the nudge", async () => {
    const f = setup({ a: [GAP], b: [GAP] });
    const lines = await harvestAfterGaps(f.deps, work);
    strictEqual(f.files.writes.length, 0);
    deepStrictEqual(lines, ["→ 2 untreated verdict gaps across 2 batches: /dev-learn turns those that recur into rules (in a fresh session)."]);
  });

  it("one batch: nothing to say; a work folder without a GAPS row: nothing read further", async () => {
    deepStrictEqual(await harvestAfterGaps(setup({ a: [GAP, "another gap"] }).deps, work), []);
    deepStrictEqual(await harvestAfterGaps(setup({}).deps, work), []);
    deepStrictEqual(await harvestAfterGaps(setup({ a: [GAP] }).deps, { folder: "x", vfsPath: null }), []);
  });

  it("leaves out the rows /dev-learn treated from the nudge, not from the harvest", async () => {
    const f = setup({ a: [GAP], b: [GAP], c: [GAP] });
    const rows = collectLearnRows([...f.files.files].map(([path, text]) => ({ code: path.split("/")[3], name: path.split("/")[4], text })));
    f.files.files.set(`/workspace/${LEARN_STATE_FILE}`, JSON.stringify({ version: 1, treated: rows.slice(0, 2).map((r) => r.id), decisions: [] }));
    const lines = await harvestAfterGaps(f.deps, work);
    strictEqual(lines.length, 1, lines.join("\n"));
    ok(lines[0].startsWith("shared memory: 1 mistake candidate"));
  });

  it("costs the lines, never the verdict, when the memory cannot be written, and says why in the log", async () => {
    const f = setup({ a: [GAP], b: [GAP], c: [GAP] });
    f.files.writeFailures.set(`${layout.candidates}/shop-mistake-20261024-the-empty-cart-is-never-tested.md`, new Error("denied by a rule"));
    const lines = await harvestAfterGaps(f.deps, work);
    ok(!lines.some((l) => l.startsWith("shared memory:")), lines.join("\n"));
    ok(f.log.lines.some((l) => l.startsWith("warn: shared memory: harvest: ") && l.includes("denied by a rule")), f.log.lines.join("\n"));
  });

  it("returns no line and warns once when a dependency throws", async () => {
    const f = setup({ a: [GAP], b: [GAP], c: [GAP] });
    const lines = await harvestAfterGaps({ ...f.deps, clock: () => { throw new Error("no clock"); } }, work);
    deepStrictEqual(lines, []);
    ok(f.log.lines.some((l) => l === "warn: shared memory: harvest after the verdict failed (no clock)"), f.log.lines.join("\n"));
  });
});

describe("learnNudge", () => {
  it("is empty below two batches", () => {
    strictEqual(learnNudge([]), "");
  });
});
