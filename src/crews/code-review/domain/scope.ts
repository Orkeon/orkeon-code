// Pure review scope — what `/review` looks at, decided without IO.
//
// B-3: the crew's declared input contract is `{ files?: string[], commit?: string }`
// (crew.ork.ts header) and baseline 03 §CodeReview Crew explicitly covers
// reviewing NAMED FILES. But `resolveCommitRange` only ever read `inputs.commit`,
// so a `files` argument was silently ignored and every review fell back to
// `--staged`. A caller asking to review two files got a review of whatever
// happened to be staged, with nothing saying the request had been dropped.
//
// The second half of this module is not in B-3's acceptance and is here because
// B-3 could not be written safely without it: `git diff ${range}` interpolates
// caller input into a shell string (`shared/infrastructure/shell.ts` passes the
// command through verbatim), so `commit` was already an injection point and
// `files` would have been a second one. Both are validated, and a rejected value
// is REPORTED rather than dropped — a silently ignored path is the very defect
// this item exists to fix.

/** Characters a git ref may contain here. Deliberately narrower than git's own rule. */
const SAFE_REF = /^[A-Za-z0-9._/~^-]+$/;

/** Characters a repo-relative path may contain. No whitespace, no shell metacharacters. */
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/;

/** What the scope is resolved from: the crew's `commit` and `files` inputs, as the caller gave them. */
export interface ReviewInputs {
  commit?: unknown;
  files?: unknown;
}

export interface ReviewScope {
  /** The git diff range: `--staged`, or `<commit>~1..<commit>`. */
  range: string;
  /** Validated repo-relative paths restricting the diff; empty = whole range. */
  paths: string[];
  /** The full argument string for `git diff …` — range, then `-- <paths>`. */
  diffArgs: string;
  /** Human-readable scope, for the report header and the log. */
  describe: string;
  /** Inputs refused, with the reason. Never silent. */
  rejected: Array<{ value: string; reason: string }>;
}

/** `<commit>~1..<commit>` for a named commit, else `--staged`. Unchanged since B-3. */
export function resolveCommitRange(inputs?: ReviewInputs | null): string {
  return inputs?.commit ? `${inputs.commit}~1..${inputs.commit}` : "--staged";
}

function validatePaths(raw: unknown): { paths: string[]; rejected: Array<{ value: string; reason: string }> } {
  const paths: string[] = [];
  const rejected: Array<{ value: string; reason: string }> = [];
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  for (const item of list) {
    const p = String(item ?? "").trim();
    if (p.length === 0) continue;
    if (p.startsWith("/")) {
      rejected.push({ value: p, reason: "absolute path — review paths are repo-relative" });
      continue;
    }
    if (p.split("/").includes("..")) {
      rejected.push({ value: p, reason: "'..' segment — would escape the repository" });
      continue;
    }
    if (!SAFE_PATH.test(p)) {
      rejected.push({
        value: p,
        reason: "contains a character that is unsafe in a shell argument " +
          "(allowed: letters, digits, '.', '_', '-', '/')",
      });
      continue;
    }
    if (!paths.includes(p)) paths.push(p);
  }
  return { paths, rejected };
}

/**
 * Resolves what to review.
 *
 * With no `files`, the result is byte-identical to the pre-B-3 behaviour: the
 * range alone, so `git diff --staged` and `git diff --staged --name-only` are the
 * exact commands that used to run.
 */
export function resolveReviewScope(inputs?: ReviewInputs | null): ReviewScope {
  const rejected: Array<{ value: string; reason: string }> = [];

  let range = "--staged";
  const commit = String(inputs?.commit ?? "").trim();
  if (commit.length > 0) {
    if (SAFE_REF.test(commit)) {
      range = `${commit}~1..${commit}`;
    } else {
      rejected.push({
        value: commit,
        reason: "not a plausible git ref (allowed: letters, digits, '.', '_', '-', '/', '~', '^') " +
          "— reviewing the staged changes instead",
      });
    }
  }

  const { paths, rejected: pathRejects } = validatePaths(inputs?.files);
  rejected.push(...pathRejects);

  // `--` separates revisions from pathspecs; without it git would try to resolve
  // a path that happens to look like a ref.
  const diffArgs = paths.length > 0 ? `${range} -- ${paths.join(" ")}` : range;
  const where = range === "--staged" ? "staged changes" : `commit ${range}`;
  const describe = paths.length > 0
    ? `${where}, restricted to ${paths.length} path(s): ${paths.join(", ")}`
    : where;

  return { range, paths, diffArgs, describe, rejected };
}
