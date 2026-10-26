// The work folder readBacklog is tested on: the recordings of tests/fixtures/dev/learn loaded into FakeFiles, the
// state and refused.md paths, and the fields the harness's script records for a row.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import type { WorkFolder } from "../../../../src/shared/application/dev/resolve-work-folder.ts";
import type { LearnRow } from "../../../../src/shared/domain/shared-memory/verdict-rows.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

const root = fileURLToPath(new URL("../../../fixtures/dev/learn/", import.meta.url));

/** A file the harness's script recorded under tests/fixtures/dev/learn. */
export const recorded = (name: string): string => readFileSync(join(root, name), "utf8");

export const W = `${WORKSPACE}/workbench`;
export const WORK: WorkFolder = { folder: "workbench", vfsPath: W, outcome: "default", request: null, exists: true, note: null };
export const ORKEON_STATE = `${WORKSPACE}/.orkeon/dev-learn-state.json`;
export const HARNESS_STATE = `${WORKSPACE}/.claude/local/dev-learn-state.json`;
export const REFUSED = `${WORKSPACE}/.orkeon/memory/refused.md`;

/** The fixture's work folder as FakeFiles holds it: each folder listed, each file readable. */
export function fixtureFiles(): FakeFiles {
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

/** The fields of a row the harness's script records. */
export const project = (r: LearnRow) =>
  ({ id: r.id, batch: r.batch, severity: r.severity, axis: r.axis, gap: r.gap, evidence: r.evidence, fix: r.fix });

/** The fixture's work folder, the harness state recorded and an Orkeon Code state treating c936075d95. */
export function filesWithBothStates(): FakeFiles {
  const files = fixtureFiles();
  files.files.set(HARNESS_STATE, recorded("harness-state.json"));
  files.files.set(ORKEON_STATE, JSON.stringify({ version: 1, treated: ["c936075d95"], decisions: [] }));
  return files;
}

/** The fixture's work folder with LEDGER-VERIFY-F1.md failing to read. */
export function filesWithUnreadableVerdict(): FakeFiles {
  const files = fixtureFiles();
  files.readErrors.set(`${W}/ledger/LEDGER-VERIFY-F1.md`, new Error("permission denied\nmore"));
  return files;
}

/** The fixture's work folder with an Orkeon Code state that is no JSON and a harness state of the wrong shape. */
export function filesWithInvalidStates(): FakeFiles {
  const files = fixtureFiles();
  files.files.set(ORKEON_STATE, "{ not json");
  files.files.set(HARNESS_STATE, JSON.stringify({ treated: 3 }));
  return files;
}

/** The fixture's work folder with a refused.md holding one motif and one bad line. */
export function filesWithRefused(): FakeFiles {
  const files = fixtureFiles();
  files.files.set(REFUSED, "# Refused motifs\n\nrounding-in-handlers | ledger | 2026-10-01 | Rounding inside handlers\nnot a line\n");
  return files;
}

/** The fixture's work folder with a refused.md at the default place and another under docs/memory/. */
export function filesWithTwoRefused(): FakeFiles {
  const files = fixtureFiles();
  files.files.set(REFUSED, "rounding-in-handlers | ledger | 2026-10-01 | Rounding inside handlers\n");
  files.files.set(`${WORKSPACE}/docs/memory/refused.md`, "empty-exports | ledger | 2026-10-02 | Exports skip the empty case\nbad\n");
  return files;
}

/** A work folder listing `count` code folders, none of them listed in turn. */
export function workListing(count: number): FakeFiles {
  const files = new FakeFiles();
  files.listings.set(W, Array.from({ length: count }, (_, i) => `c${i}/`));
  return files;
}

/** A work folder with one code folder `full` listing `count` notes. */
export function fullFolder(count: number): FakeFiles {
  const files = new FakeFiles();
  files.listings.set(W, ["full/"]);
  files.listings.set(`${W}/full`, Array.from({ length: count }, (_, i) => `note-${i}.txt`));
  return files;
}
