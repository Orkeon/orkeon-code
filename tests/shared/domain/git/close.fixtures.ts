// The git answers, statuses and pull request facts the close rules are tested on.

export const NOT_IDENTS: readonly string[] = [
  "", "Ada 1700000000 +0100", "Ada <> 1700000000 +0100", "ada <ada@box.(none)> 1700000000 +0100",
];

export const GIT_REASON = "fatal: unable to auto-detect email address";

export const IDENTITY_COMMANDS = [
  "git config --global user.name \"<your name>\"",
  "git config --global user.email <your email>",
];

export const RENAME_STATUS = " M a.ts\nR  old.ts -> new.ts\n?? \"with space.md\"\n D gone.ts\nMM a.ts\n";

export const MERGE_FAILURES: ReadonlyArray<{ name: string; stderr: string; notFastForward: boolean }> = [
  { name: "the refusal", stderr: "fatal: Not possible to fast-forward, aborting.", notFastForward: true },
  { name: "another failure", stderr: "error: Your local changes would be overwritten by merge.", notFastForward: false },
];

export const STAGED_STATUS = "D  gone.ts\nR  old.ts -> new.ts\n D kept.ts\nRM a.ts -> b.ts\n";

/** A tree with a source change, a plan of the work folder, a new source and a doc change. */
export const STATUS = " M src/a.ts\n?? workbench/code/PLAN.md\n?? src/new.ts\n M docs/x.md\n";

export const UNSAFE_STATUS = "?? \"a\\\"b.ts\"\n?? ok.ts\n?? x;y.ts\n";

export const UNSAFE_ARGS: readonly string[] = ["a'b", "a\"b", "a\\b", "a\nb", "a;b", "a|b", "a&&b", "a$(b)", "a`b`", ""];
export const SAFE_ARGS: readonly string[] = ["src/a b.ts", "feat/x-1", "a&b", "a$b"];

export const QUOTED: ReadonlyArray<{ arg: string; quoted: string }> = [
  { arg: "a b", quoted: "'a b'" },
  { arg: "it's", quoted: "'it'\\''s'" },
];

export const DEFAULT_BRANCHES: ReadonlyArray<{ name: string; out: string; branch: string | null }> = [
  { name: "origin/main", out: "origin/main\n", branch: "main" },
  { name: "origin/HEAD unset", out: "", branch: null },
];

export const SLUGS: ReadonlyArray<{ branch: string; slug: string }> = [
  { branch: "feat/Dev workflow#2", slug: "feat-Dev-workflow-2" },
  { branch: "///", slug: "change" },
];

export const PR_HEADINGS = [
  "## Batch", "## Files, per layer", "## Validations", "## Assumptions to validate", "## Audit", "## Not run",
];

export const SHORT_PR = { batch: "`feat/x` — fix(api): handle null", layers: [{ layer: "Changed", paths: ["src/a.ts", "b.md"] }] };

export const FULL_PR = {
  batch: "F1", layers: [], validations: ["`npm test` — exit 0"], assumptions: [{ id: "H1", assumption: "a", by: "b" }],
  audit: "Verdict: **VALID**", notRun: "None.",
};

export const PR_COMMANDS = [
  {
    name: "with the base, the title single-quoted",
    pr: { base: "main", head: "feat/x", title: "fix: it's done", bodyFile: "workbench/pr-feat-x/PR.md" },
    command: "gh pr create --base main --head feat/x --title 'fix: it'\\''s done' --body-file workbench/pr-feat-x/PR.md",
  },
  {
    name: "without a base known",
    pr: { base: null, head: "feat/x", title: "t", bodyFile: "/abs path/PR.md" },
    command: "gh pr create --head feat/x --title 't' --body-file '/abs path/PR.md'",
  },
];

export const PUSHED_CHECKS: ReadonlyArray<{ name: string; out: string; pushed: boolean }> = [
  { name: "one hash", out: "abc\nabc\n", pushed: true },
  { name: "two hashes", out: "abc\ndef\n", pushed: false },
  { name: "HEAD alone", out: "abc\n", pushed: false },
  { name: "nothing", out: "", pushed: false },
];
