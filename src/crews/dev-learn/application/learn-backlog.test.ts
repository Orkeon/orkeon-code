// readBacklog over FakeFiles loaded from tests/fixtures/dev/learn: the rows the
// harness's script recorded, the treated rows of both states, and each read that
// fails turned into a warning. Run:
//   node --test src/crews/dev-learn/application/learn-backlog.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import type { WorkFolder } from "../../../shared/application/dev/resolve-work-folder.ts";
import type { LearnRow } from "../../../shared/domain/shared-memory/verdict-rows.ts";
import { FOLDER_LIST_CAP, WORK_LIST_CAP, readBacklog } from "./learn-backlog.ts";

const root = fileURLToPath(new URL("../../../../tests/fixtures/dev/learn/", import.meta.url));
const recorded = (name: string): string => readFileSync(join(root, name), "utf8");
const W = "/workspace/workbench";
const WORK: WorkFolder = { folder: "workbench", vfsPath: W, outcome: "default", request: null, exists: true, note: null };
const ORKEON_STATE = "/workspace/.orkeon/dev-learn-state.json";
const HARNESS_STATE = "/workspace/.claude/local/dev-learn-state.json";
const REFUSED = "/workspace/.orkeon/memory/refused.md";

/** The fixture's work folder as FakeFiles holds it: each folder listed, each file readable. */
function fixtureFiles(): FakeFiles {
  const files = new FakeFiles();
  const work = join(root, "workbench");
  const codes = readdirSync(work);
  files.listings.set(W, codes.map((c) => `${c}/`));
  for (const code of codes) {
    if (!statSync(join(work, code)).isDirectory()) continue;
    const names = readdirSync(join(work, code));
    files.listings.set(`${W}/${code}`, names);
    for (const name of names) files.files.set(`${W}/${code}/${name}`, readFileSync(join(work, code, name), "utf8"));
  }
  return files;
}

const project = (r: LearnRow) =>
  ({ id: r.id, batch: r.batch, severity: r.severity, axis: r.axis, gap: r.gap, evidence: r.evidence, fix: r.fix });

describe("readBacklog", () => {
  it("reads the same rows as the harness's script, hidden folders skipped, _archive read", async () => {
    const b = await readBacklog(fixtureFiles(), WORK);
    deepStrictEqual(b.rows.map(project), JSON.parse(recorded("rows.py.json")));
    strictEqual(b.files, 7);
    deepStrictEqual(b.untreated.length, b.rows.length);
    deepStrictEqual(b.warnings, []);
    deepStrictEqual(b.orkeon, { version: 1, treated: [], decisions: [] });
    deepStrictEqual(b.harness, { treated: [], refused: [] });
    deepStrictEqual(b.refused, []);
  });

  it("leaves out the rows either state treats", async () => {
    const files = fixtureFiles();
    files.files.set(HARNESS_STATE, recorded("harness-state.json"));
    files.files.set(ORKEON_STATE, JSON.stringify({ version: 1, treated: ["c936075d95"], decisions: [] }));
    const b = await readBacklog(files, WORK);
    const ids = b.untreated.map((r) => r.id);
    ok(!ids.includes("4e865d8344") && !ids.includes("c936075d95"));
    strictEqual(ids.length, b.rows.length - 2);
    deepStrictEqual(b.harness.refused, ["Rounding inside handlers", "keep: Each command returns a CommandView."]);
  });

  it("warns on a verdict file it cannot read and goes on", async () => {
    const files = fixtureFiles();
    files.readErrors.set(`${W}/ledger/LEDGER-VERIFY-F1.md`, new Error("permission denied\nmore"));
    const b = await readBacklog(files, WORK);
    deepStrictEqual(b.warnings, ["workbench/ledger/LEDGER-VERIFY-F1.md cannot be read (permission denied)"]);
    strictEqual(b.files, 6);
    ok(!b.rows.some((r) => r.batch === "ledger/F1"));
  });

  it("reads an invalid Orkeon Code state as empty, with a warning", async () => {
    const files = fixtureFiles();
    files.files.set(ORKEON_STATE, "{ not json");
    files.files.set(HARNESS_STATE, JSON.stringify({ treated: 3 }));
    const b = await readBacklog(files, WORK);
    deepStrictEqual(b.orkeon, { version: 1, treated: [], decisions: [] });
    deepStrictEqual(b.harness, { treated: [], refused: [] });
    strictEqual(b.warnings.length, 1);
    ok(b.warnings[0].startsWith(".orkeon/dev-learn-state.json is not JSON ("), b.warnings[0]);
  });

  it("keeps the refused motifs and warns on each bad line of refused.md", async () => {
    const files = fixtureFiles();
    files.files.set(REFUSED, "# Refused motifs\n\nrounding-in-handlers | ledger | 2026-10-01 | Rounding inside handlers\nnot a line\n");
    const b = await readBacklog(files, WORK);
    deepStrictEqual(b.refused.map((m) => m.topic), ["rounding-in-handlers"]);
    deepStrictEqual(b.warnings, ['.orkeon/memory/refused.md:line 4: not "topic | project | date | motif"']);
  });

  it("warns when the work folder's listing reaches its cap", async () => {
    const files = new FakeFiles();
    files.listings.set(W, Array.from({ length: WORK_LIST_CAP + 5 }, (_, i) => `c${i}/`));
    const b = await readBacklog(files, WORK);
    deepStrictEqual(b.warnings, [`workbench/ lists ${WORK_LIST_CAP} entries or more: later folders are not read`]);
    strictEqual(b.rows.length, 0);
  });

  it("warns when one code folder's listing reaches its cap", async () => {
    const files = new FakeFiles();
    files.listings.set(W, ["full/"]);
    files.listings.set(`${W}/full`, Array.from({ length: FOLDER_LIST_CAP }, (_, i) => `note-${i}.txt`));
    const b = await readBacklog(files, WORK);
    deepStrictEqual(b.warnings, [`workbench/full/ lists ${FOLDER_LIST_CAP} entries or more: later files are not read`]);
    strictEqual(b.rows.length, 0);
  });
});
