// The inputs, the checkout answers, the work folders and the written source the shared steps of /dev-spec and
// /dev-change are tested on. The written source is tests/fixtures/dev/plan/SPEC-prune.md.
import { readFileSync } from "node:fs";

import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { MAX_CODE_CHARS, MAX_REQUEST_CHARS } from "../../../../src/shared/application/dev/source-step.ts";
import { GIT_TOPLEVEL } from "../../../../src/shared/application/dev/resolve-work-folder.ts";
import type { WorkFolder } from "../../../../src/shared/application/dev/resolve-work-folder.ts";
import type { Decision, Question } from "../../../../src/shared/domain/dev/questions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const STEP = "dev-spec";

export const WORK: WorkFolder = {
  folder: "workbench", vfsPath: `${WORKSPACE}/workbench`, outcome: "applied", request: null, exists: true, note: null,
};

/** WORK outside the mounts, as from a linked worktree. */
export const WORK_OUTSIDE: WorkFolder = { ...WORK, folder: "/home/dev/repo/workbench", vfsPath: null, outcome: "main-worktree" };

export interface InputCase { name: string; value: unknown; expected: string | { refused: string } }

export const CODE_CASES: readonly InputCase[] = [
  { name: "takes a code as it is given", value: "prune", expected: "prune" },
  {
    name: "refuses a code one character over the limit", value: "a".repeat(MAX_CODE_CHARS + 1),
    expected: { refused: "dev-spec: invalid crew input: code" },
  },
  { name: "refuses a code that is not a string", value: 42, expected: { refused: "dev-spec: invalid crew input: code" } },
  { name: "refuses a code that climbs out of the folder", value: "a..b", expected: { refused: "dev-spec: invalid crew input: code" } },
];

export const TEXT_CASES: readonly InputCase[] = [
  { name: "reads an absent text as no text", value: undefined, expected: "" },
  { name: "reads an empty text as no text, without a refusal", value: "", expected: "" },
  { name: "trims the text given", value: "  prune old entries \n", expected: "prune old entries" },
  { name: "refuses a text that is not a string", value: 7, expected: { refused: "dev-spec: invalid crew input: request" } },
  {
    name: "refuses a text one character over the limit", value: "x".repeat(MAX_REQUEST_CHARS + 1),
    expected: { refused: "dev-spec: invalid crew input: request" },
  },
];

export interface ToplevelCase { name: string; shell: () => FakeShell; expected: string | null }

/** A shell whose `git rev-parse --show-toplevel` answers `answer`, or throws when `answer` is an Error. */
export function toplevel(answer: { exitCode?: number; stdout?: string } | Error): FakeShell {
  const shell = new FakeShell();
  if (answer instanceof Error) shell.errors[GIT_TOPLEVEL] = answer;
  else shell.results[GIT_TOPLEVEL] = answer;
  return shell;
}

export const TOPLEVEL_CASES: readonly ToplevelCase[] = [
  { name: "lets a run from the checkout go on", shell: () => toplevel({ stdout: `${WORKSPACE}\n` }), expected: null },
  {
    name: "refuses a run from another work tree, naming it", shell: () => toplevel({ stdout: "/tmp/other\n" }),
    expected: `dev-spec: run from the checkout at ${WORKSPACE} (git reports /tmp/other)`,
  },
  {
    name: "refuses a run outside any git work tree", shell: () => toplevel({ exitCode: 128, stdout: "" }),
    expected: `dev-spec: run from the checkout at ${WORKSPACE} (git reports no work tree)`,
  },
  {
    name: "refuses a run whose git command the runtime refuses", shell: () => toplevel(new Error("shell refused")),
    expected: `dev-spec: run from the checkout at ${WORKSPACE} (git reports no work tree)`,
  },
];

/** Files whose work folder holds the code prune, listing `names`. */
export function pruneFolder(names: string[]): FakeFiles {
  const files = new FakeFiles();
  files.listings.set(`${WORKSPACE}/workbench/prune`, names);
  return files;
}

/** Files holding `text` at `path` of the checkout. */
export function checkoutFile(path: string, text: string): FakeFiles {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/${path}`, text);
  return files;
}

/** Files where docs/brief.md cannot be read. */
export function unreadableBrief(): FakeFiles {
  const files = new FakeFiles();
  files.readErrors.set(`${WORKSPACE}/docs/brief.md`, new Error("permission denied\nmore detail"));
  return files;
}

export interface RequestCase { name: string; files: () => FakeFiles; request: string; expected: { text: string; from: string } | { refused: string } }

export const REQUEST_CASES: readonly RequestCase[] = [
  {
    name: "takes a request that names no file as the text itself", files: () => new FakeFiles(),
    request: "prune old entries", expected: { text: "prune old entries", from: "" },
  },
  {
    name: "reads a request naming a .md file of the checkout whole", files: () => checkoutFile("docs/brief.md", "The brief.\n"),
    request: "docs/brief.md", expected: { text: "The brief.\n", from: "docs/brief.md" },
  },
  {
    name: "reads a request given as an absolute path under the checkout", files: () => checkoutFile("docs/brief.txt", "Brief."),
    request: `${WORKSPACE}/docs/brief.txt`, expected: { text: "Brief.", from: "docs/brief.txt" },
  },
  {
    name: "refuses a path that climbs out of the checkout", files: () => new FakeFiles(),
    request: "../secrets.md", expected: { refused: `dev-spec: ../secrets.md is outside the checkout: give a path under ${WORKSPACE}` },
  },
  {
    name: "refuses a file that holds only blanks", files: () => checkoutFile("docs/brief.md", "  \n"),
    request: "docs/brief.md", expected: { refused: "dev-spec: docs/brief.md is empty" },
  },
  {
    name: "refuses a file that cannot be read, with the first line of the reason", files: unreadableBrief,
    request: "docs/brief.md", expected: { refused: "dev-spec: docs/brief.md cannot be read (permission denied)" },
  },
];

/** A request file longer than MAX_REQUEST_CHARS. */
export const LONG_BRIEF = "y".repeat(MAX_REQUEST_CHARS + 500);

/** The source written by /dev-spec for prune: code prune, four ids, one open question, no decision. */
export const SPEC_PRUNE = readFileSync(new URL("../../../fixtures/dev/plan/SPEC-prune.md", import.meta.url), "utf8");

const OPEN_QUESTION: Question = {
  id: "Q-01", severity: "Major", question: "Does a prune with no cut-off refuse, or use a default age?",
  impact: "the command line", options: ["refuse", "90 days"],
};
const DECISION: Decision = { id: "1", question: "Is a dry run needed?", answer: "yes", date: "2026-10-22" };

interface Expect { code: string; ids: readonly string[]; open: readonly Question[]; decisions: readonly Decision[] }

/** What /dev-spec wrote into SPEC_PRUNE. */
export const WRITTEN: Expect = { code: "prune", ids: ["UC-01", "BR-01", "BR-02", "BR-03"], open: [OPEN_QUESTION], decisions: [] };

export interface SelfCheckCase { name: string; expect: Expect; problems: string[] }

export const SELF_CHECK_CASES: readonly SelfCheckCase[] = [
  { name: "finds no problem in a source that reads back as written", expect: WRITTEN, problems: [] },
  {
    name: "says the title does not read the code expected", expect: { ...WRITTEN, code: "trim" },
    problems: ["the title does not read the code trim"],
  },
  {
    name: "says the ids read back differ from the ids written", expect: { ...WRITTEN, ids: ["UC-01"] },
    problems: ["the ids read back are UC-01,BR-01,BR-02,BR-03, not UC-01"],
  },
  {
    name: "says the open questions read back differ in number from those written", expect: { ...WRITTEN, open: [] },
    problems: ["1 open questions read back, 0 written"],
  },
  {
    name: "says the decisions written do not read back", expect: { ...WRITTEN, decisions: [DECISION] },
    problems: ["the decisions do not read back"],
  },
];
