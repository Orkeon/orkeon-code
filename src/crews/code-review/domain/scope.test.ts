// B-3 — the `files` input was declared and dead. Run:
//   node_modules/.bin/tsx --test crews/code-review/domain/scope.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";
import { resolveCommitRange, resolveReviewScope } from "./scope.ts";

describe("resolveReviewScope — ACCEPTANCE 2: absent files keeps today's behaviour", () => {
  it("produces the bare range, byte-identical to the pre-B-3 commands", () => {
    for (const inputs of [{}, { files: [] }, { files: undefined }, { files: null }, undefined]) {
      const s = resolveReviewScope(inputs);
      strictEqual(s.diffArgs, "--staged", JSON.stringify(inputs));
      deepStrictEqual(s.paths, []);
      // `git diff ${diffArgs}` and `git diff ${diffArgs} --name-only` are then
      // exactly the two commands the crew ran before this item.
      strictEqual(`git diff ${s.diffArgs}`, "git diff --staged");
      strictEqual(`git diff ${s.diffArgs} --name-only`, "git diff --staged --name-only");
    }
  });

  it("agrees with resolveCommitRange on the range, for both input shapes", () => {
    strictEqual(resolveReviewScope({}).range, resolveCommitRange({}));
    strictEqual(resolveReviewScope({ commit: "abc123" }).range, resolveCommitRange({ commit: "abc123" }));
  });

  it("keeps the commit range shape", () => {
    strictEqual(resolveReviewScope({ commit: "abc123" }).diffArgs, "abc123~1..abc123");
  });
});

describe("resolveReviewScope — ACCEPTANCE 1: files restricts the diff", () => {
  it("appends the pathspec after a `--` separator", () => {
    const s = resolveReviewScope({ files: ["src/a.ts", "src/b.ts"] });
    strictEqual(s.diffArgs, "--staged -- src/a.ts src/b.ts");
    deepStrictEqual(s.paths, ["src/a.ts", "src/b.ts"]);
  });

  it("needs the `--`, or git would resolve a path that looks like a ref", () => {
    ok(resolveReviewScope({ files: ["main"] }).diffArgs.includes(" -- main"));
  });

  it("combines with a named commit", () => {
    strictEqual(
      resolveReviewScope({ commit: "deadbee", files: ["a.ts"] }).diffArgs,
      "deadbee~1..deadbee -- a.ts",
    );
  });

  it("accepts a single string as well as an array", () => {
    deepStrictEqual(resolveReviewScope({ files: "a.ts" }).paths, ["a.ts"]);
  });

  it("deduplicates and drops blanks without complaining", () => {
    const s = resolveReviewScope({ files: ["a.ts", "a.ts", "", "   "] });
    deepStrictEqual(s.paths, ["a.ts"]);
    deepStrictEqual(s.rejected, [], "a blank is noise, not a rejected request");
  });

  it("describes the scope, so the report header can state what was reviewed", () => {
    ok(resolveReviewScope({}).describe.includes("staged"));
    ok(resolveReviewScope({ files: ["a.ts"] }).describe.includes("a.ts"));
    ok(resolveReviewScope({ commit: "abc" }).describe.includes("abc~1..abc"));
  });
});

describe("resolveReviewScope — shell safety, and never a silent drop", () => {
  // `sh()` passes its command string through verbatim, so both inputs land in a
  // shell. `commit` was already an injection point before B-3; `files` would have
  // been a second one.
  it("refuses a commit ref carrying shell metacharacters, and says so", () => {
    const s = resolveReviewScope({ commit: "x; rm -rf /" });
    strictEqual(s.diffArgs, "--staged", "falls back to the safe default");
    strictEqual(s.rejected.length, 1);
    strictEqual(s.rejected[0].value, "x; rm -rf /");
    ok(s.rejected[0].reason.includes("git ref"), s.rejected[0].reason);
  });

  it("refuses paths carrying shell metacharacters", () => {
    const s = resolveReviewScope({ files: ["ok.ts", "a.ts; cat /etc/passwd", "b$(id).ts", "c`id`.ts", "d|e.ts"] });
    deepStrictEqual(s.paths, ["ok.ts"], "only the safe path survives");
    strictEqual(s.rejected.length, 4);
    for (const r of s.rejected) ok(r.reason.includes("unsafe"), r.reason);
  });

  it("refuses a path with whitespace — it would split into two arguments", () => {
    const s = resolveReviewScope({ files: ["my file.ts"] });
    deepStrictEqual(s.paths, []);
    strictEqual(s.rejected.length, 1);
  });

  it("refuses an absolute path and a '..' escape", () => {
    const s = resolveReviewScope({ files: ["/etc/passwd", "../../secrets.env", "a/../b.ts"] });
    deepStrictEqual(s.paths, []);
    strictEqual(s.rejected.length, 3);
    ok(s.rejected[0].reason.includes("repo-relative"), s.rejected[0].reason);
    ok(s.rejected[1].reason.includes("escape the repository"), s.rejected[1].reason);
  });

  it("REPORTS every rejection — a dropped path is the defect B-3 fixes", () => {
    // Silently ignoring `files` is exactly what shipped. A rejected path must
    // therefore be louder than an accepted one, not quieter.
    const s = resolveReviewScope({ files: ["bad;path.ts"] });
    strictEqual(s.paths.length, 0);
    strictEqual(s.rejected.length, 1);
    ok(s.rejected[0].value.length > 0);
    ok(s.rejected[0].reason.length > 0);
  });

  it("accepts the path shapes a real review needs", () => {
    const files = ["a.ts", "src/deep/nested-file.test.ts", "shared/domain/types.ts", "a.b.c-d_e/f.ts"];
    deepStrictEqual(resolveReviewScope({ files }).paths, files);
  });

  it("accepts the ref shapes a real review needs", () => {
    for (const ref of ["abc1234", "HEAD", "HEAD~3", "v1.2.3", "feature/x", "origin/main", "HEAD^"]) {
      strictEqual(resolveReviewScope({ commit: ref }).rejected.length, 0, ref);
    }
  });
});
