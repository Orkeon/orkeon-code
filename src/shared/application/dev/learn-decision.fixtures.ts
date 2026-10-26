// The checkout /dev-learn decides in: the work folder workbench/ holding one learn-<date>/ folder whose proposals.json
// has an axis Test with two motifs (one owned by the harness, one by the repository), a remote, and a clock at
// 2026-10-24; over FakeFiles, FakeShell, a config store on the files and FakeClock.
import { FakeClock } from "../../../../tests/support/doubles/fake-clock.ts";
import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../../../tests/support/doubles/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import { createConfigStore } from "../config-store.ts";
import type { ProposalsLookup } from "./learn-decision.ts";
import type { WorkFolder } from "./resolve-work-folder.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "./load-dev-context.ts";
import { serializeProposalsFile } from "../../domain/dev/learn-proposals.ts";
import type { AxisProposal, Motif, ProposalsFile } from "../../domain/dev/learn-proposals.ts";
import { parseLearnState } from "../../domain/dev/learn-state.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export const WORK_DIR = `${WORKSPACE}/workbench`;
export const STATE = `${WORKSPACE}/.orkeon/dev-learn-state.json`;
export const REFUSED = `${WORKSPACE}/.orkeon/memory/refused.md`;
export const HARNESS_ID = "3f2a9c1e";
export const REPO_ID = "77b0d2aa";
export const UNKNOWN_ID = "deadbeef";

export const WORK: WorkFolder = {
  folder: "workbench", vfsPath: WORK_DIR, outcome: "applied", request: null, exists: true, note: null,
};

function motif(id: string, kind: "harness" | "repository", rows: string[], title: string, topic: string): Motif {
  const path = kind === "harness"
    ? ".devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md"
    : "CONTRIBUTING.md";
  return {
    id, title, topic, rows, batches: ["demo/F1", "demo/F2", "demo/F3"],
    preventiveLine: "Each refusal path has its own test.", owner: { kind, path },
    check: "test", status: "new", linesRemoved: [], linesAdded: ["Each refusal path has its own test."],
    novelty: "the owner names no refusal path", keyTerm: "refusal", reconcile: "owner read; term not found",
  };
}

/** The proposals of `date`: the axis Test with the harness motif and the repository motif. */
export function proposals(date = "2026-10-21"): ProposalsFile {
  const axis: AxisProposal = {
    axis: "Test", batches: 3, gaps: 4, shownRows: ["68abc1ec48", "1111111111", "2222222222", "3333333333"],
    hiddenRows: 0, outcome: "proposed", dropped: [],
    motifs: [
      motif(HARNESS_ID, "harness", ["68abc1ec48", "1111111111"], "Refusal paths go untested", "refusal-paths-untested"),
      motif(REPO_ID, "repository", ["2222222222"], "Fixtures drift from the format", "fixtures-drift"),
    ],
  };
  return {
    version: 1, date, work: "workbench",
    read: { files: 3, gaps: 4, batches: 3, treatedOrkeon: 0, treatedHarness: 0, refused: 0 }, axes: [axis],
  };
}

/** The lookup readProposals gives over learnDeps(). */
export const LOOKUP: ProposalsLookup = { files: [{ folder: "learn-2026-10-21", file: proposals() }], warnings: [] };

/** Files whose work folder holds a learn-<date>/ folder with its proposals.json for each date, and a folder demo. */
export function learnFolders(dates: readonly string[]): FakeFiles {
  const files = new FakeFiles();
  files.listings.set(WORK_DIR, ["demo", ...dates.map((d) => `learn-${d}`)]);
  for (const d of dates) files.files.set(`${WORK_DIR}/learn-${d}/proposals.json`, serializeProposalsFile(proposals(d)));
  return files;
}

/** learnFolders of the 21st and the 22nd, the 22nd's proposals.json unreadable. */
export function unreadableNewest(): FakeFiles {
  const files = learnFolders(["2026-10-21", "2026-10-22"]);
  files.readErrors.set(`${WORK_DIR}/learn-2026-10-22/proposals.json`, new Error("permission denied\nat read"));
  return files;
}

/** learnFolders of the 21st and the 22nd, the 22nd's proposals.json not JSON. */
export function brokenNewest(): FakeFiles {
  const files = learnFolders(["2026-10-21", "2026-10-22"]);
  files.files.set(`${WORK_DIR}/learn-2026-10-22/proposals.json`, "{ not json");
  return files;
}

/** Eleven learn-<date>/ folders, the 1st to the 11th of October. */
export const ELEVEN_DATES = Array.from({ length: 11 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

/** The checkout: the work folder with learn-2026-10-21/, git ignoring it, a remote, a clock at 2026-10-24. */
export function learnDeps() {
  const files = learnFolders(["2026-10-21"]);
  files.listings.set(WORKSPACE, ["workbench"]);
  const shell = new FakeShell();
  shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE, "workbench/"])] = { exitCode: 0, stdout: ".orkeon/config.json\nworkbench/\n" };
  shell.results["git remote get-url origin"] = { exitCode: 0, stdout: "https://github.com/Orkeon/orkeon-code.git\n" };
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  return { files, shell, config, clock: new FakeClock().now };
}

export type LearnDeps = ReturnType<typeof learnDeps>;

/** learnDeps() with no work folder in the checkout. */
export function noWorkFolder(): LearnDeps {
  const deps = learnDeps();
  deps.files.listings.set(WORKSPACE, []);
  return deps;
}

/** The decisions of the stored state as [motif, decision, date]; throws when it cannot be read. */
export function decisionsOf(deps: LearnDeps): Array<[string, string, string]> {
  const read = parseLearnState(deps.files.files.get(STATE) ?? null);
  if (!read.ok) throw new Error(read.problem);
  return read.state.decisions.map((d) => [d.motif, d.decision, d.date]);
}

export const UNKNOWN_LINE = `dev-learn: no proposal ${UNKNOWN_ID} in the 10 newest workbench/learn-*/ folders`;
export const REFUSED_BY_WORDS_LINE = "refused: flaky-snapshots — left out of future proposals (.orkeon/memory/refused.md)";
