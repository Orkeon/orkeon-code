// Motifs, a proposals file and the lines expected of them, for the /dev-learn proposals model.
import type { Motif, ProposalsFile } from "../../../../src/shared/domain/dev/learn-proposals.ts";

/** A motif a repository file owns. */
export const REPO_MOTIF: Motif = {
  id: "3f2a9c1e", title: "Refusal paths go untested", topic: "refusal-paths-untested",
  rows: ["68abc1ec48", "0b1c2d3e4f", "9a8b7c6d5e"], batches: ["ledger/F1", "ledger/F3", "invoices/F2"],
  preventiveLine: "Each refusal text of a command has a test that triggers it.",
  owner: { kind: "repository", path: "CONTRIBUTING.md" }, check: "test", status: "new",
  linesRemoved: [], linesAdded: ["Every refusal a command prints has a test that makes it print."],
  novelty: "No rule names refusal texts.", keyTerm: "refusal", reconcile: "'refusal' not found in CONTRIBUTING.md",
};

/** A motif a harness file owns, refining a line. */
export const HARNESS_MOTIF: Motif = {
  ...REPO_MOTIF, id: "77b0d2aa", title: "Axis names drift",
  owner: { kind: "harness", path: ".devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md" },
  check: "rule", status: "refines",
  linesRemoved: ["Name the axis."], linesAdded: ["Name the axis with one of the listed words.", "Keep the case."],
};

/** A proposals file: one axis with both motifs and a dropped one, one axis without a proposal. */
export const FILE: ProposalsFile = {
  version: 1, date: "2026-10-22", work: "workbench",
  read: { files: 9, gaps: 14, batches: 5, treatedOrkeon: 2, treatedHarness: 1, refused: 2 },
  axes: [
    {
      axis: "Test", batches: 4, gaps: 7, shownRows: ["68abc1ec48", "0b1c2d3e4f", "9a8b7c6d5e"], hiddenRows: 3,
      outcome: "proposed", motifs: [REPO_MOTIF, HARNESS_MOTIF],
      dropped: [{ title: "Wording of help texts", filter: "recurrence", reason: "2 batches (ledger/F1, ledger/F2)" }],
    },
    {
      axis: "Plan", batches: 3, gaps: 4, shownRows: ["1111111111"], hiddenRows: 0, outcome: "no-proposal",
      reason: "motif 1: row 'abc' is not one of the rows given", motifs: [], dropped: [],
    },
  ],
};

/** Folder names the learn folder pattern refuses. */
export const NOT_LEARN_FOLDERS: readonly string[] = ["learn-2026-10-2", "learn-2026-10-22x", "xlearn-2026-10-22", "learn-latest"];

/** The file with the second motif of its first axis patched. */
const motif = (patch: object): unknown =>
  ({ ...FILE, axes: [{ ...FILE.axes[0], motifs: [REPO_MOTIF, { ...HARNESS_MOTIF, ...patch }] }] });

export interface ShapeCase {
  value: unknown;
  field: string;
}

/** Each value of the wrong shape and the first field it names. */
export const WRONG_SHAPES: readonly ShapeCase[] = [
  { value: [], field: "the top level" },
  { value: { ...FILE, version: 2 }, field: "version" },
  { value: { ...FILE, date: 5 }, field: "date" },
  { value: { ...FILE, read: { ...FILE.read, gaps: -1 } }, field: "read.gaps" },
  { value: { ...FILE, read: null }, field: "read" },
  { value: { ...FILE, axes: {} }, field: "axes" },
  { value: { ...FILE, axes: [{ ...FILE.axes[0], outcome: "done" }] }, field: "axes[0].outcome" },
  { value: { ...FILE, axes: [FILE.axes[0], { ...FILE.axes[1], reason: 3 }] }, field: "axes[1].reason" },
  { value: { ...FILE, axes: [{ ...FILE.axes[0], shownRows: [1] }] }, field: "axes[0].shownRows" },
  { value: motif({ id: "3F2A9C1E" }), field: "axes[0].motifs[1].id" },
  { value: motif({ owner: { kind: "team", path: "x" } }), field: "axes[0].motifs[1].owner.kind" },
  { value: motif({ owner: "x" }), field: "axes[0].motifs[1].owner" },
  { value: motif({ check: "lint" }), field: "axes[0].motifs[1].check" },
  { value: motif({ linesAdded: "x" }), field: "axes[0].motifs[1].linesAdded" },
  {
    value: { ...FILE, axes: [{ ...FILE.axes[0], dropped: [{ title: "t", filter: "other", reason: "r" }] }] },
    field: "axes[0].dropped[0].filter",
  },
];

/** The file with its first axis holding one motif of a 10-digit id. */
export const TEN_DIGIT_ID_FILE = { ...FILE, axes: [{ ...FILE.axes[0], motifs: [{ ...REPO_MOTIF, id: "3f2a9c1e00" }] }] };

export interface DeployedCase {
  path: string;
  deployed: string;
}

/** A pack's claude folder, mapped onto .claude/ of the checkout. */
export const DEPLOYED_PATHS: readonly DeployedCase[] = [
  {
    path: ".devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md",
    deployed: ".claude/skills/dev-verify/references/audit-axes.md",
  },
  { path: ".devcontainer/harness/packs/repo-x/claude/rules/naming.md", deployed: ".claude/rules/naming.md" },
];

/** Paths outside a pack's claude folder, or escaping it. */
export const NOT_DEPLOYED: readonly string[] = [
  "CONTRIBUTING.md", ".claude/rules/naming.md", ".devcontainer/harness/packs/dev/skills/x.md",
  ".devcontainer/harness/packs/dev/claude/", "x/.devcontainer/harness/packs/dev/claude/rules/a.md",
  ".devcontainer/harness/packs/dev/claude/../../etc/passwd", "",
];

export const HARNESS_PATCH: readonly string[] = [
  "file: .devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md",
  "- Name the axis.",
  "+ Name the axis with one of the listed words.",
  "+ Keep the case.",
];

export const HARNESS_ACCEPT: readonly string[] = [
  "accepted 77b0d2aa — Axis names drift: a harness file is never edited here; apply this in the orkeon-workshop repository:",
  "  file: .devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md",
  "  - Name the axis.",
  "  + Name the axis with one of the listed words.",
  "  + Keep the case.",
];

export const REPO_PATCH: readonly string[] = [
  "file: CONTRIBUTING.md",
  "+ Every refusal a command prints has a test that makes it print.",
];

export const REPO_ACCEPT: readonly string[] = [
  "accepted 3f2a9c1e — Refusal paths go untested: CONTRIBUTING.md is not edited by /dev-learn; make the change in a batch (/dev-spec <code> refactor, or by hand):",
  "  file: CONTRIBUTING.md",
  "  + Every refusal a command prints has a test that makes it print.",
];
