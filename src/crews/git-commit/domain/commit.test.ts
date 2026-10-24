// Run: node --test src/crews/git-commit/domain/commit.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import {
  normalizeCommitMessage, commitSubject, isConventionalCommit,
  isCommitPermitted, buildCommitPlan, hasExplicitConfirm, parseCommitArgs, commitRefusal, secretLikePaths, statusPaths, untrackedPaths } from "./commit.ts";

describe("normalizeCommitMessage", () => {
  it("unwraps a fenced message", () => {
    strictEqual(normalizeCommitMessage("```\nfeat: x\n```"), "feat: x");
  });
  it("falls back when empty", () => {
    strictEqual(normalizeCommitMessage("   "), "chore: update working tree");
  });
  it("passes a clean message through", () => {
    strictEqual(normalizeCommitMessage("fix(api): handle null"), "fix(api): handle null");
  });
});

describe("commitSubject", () => {
  it("returns the first line", () => {
    strictEqual(commitSubject("feat: x\n\nbody"), "feat: x");
  });
});

describe("isConventionalCommit", () => {
  it("accepts type(scope): subject", () => {
    strictEqual(isConventionalCommit("feat(ui): add button"), true);
    strictEqual(isConventionalCommit("chore!: drop node 18"), true);
  });
  it("rejects free-form", () => {
    strictEqual(isConventionalCommit("updated stuff"), false);
  });
});

// ── B-1 ─────────────────────────────────────────────────────────────────

describe("isCommitPermitted (B-1)", () => {
  it("ACCEPTANCE 3 — refuses the read-only modes, so commitAll is unreachable", () => {
    for (const mode of ["plan", "dontAsk"]) {
      const v = isCommitPermitted(mode);
      strictEqual(v.allowed, false, mode);
      ok(v.reason.includes(mode), v.reason);
      ok(v.reason.includes("/mode"), "the refusal must say how to proceed");
    }
  });

  it("allows the modes that may write", () => {
    for (const mode of ["default", "acceptEdits", "bypassPermissions"]) {
      strictEqual(isCommitPermitted(mode).allowed, true, mode);
    }
  });

  it("FAILS CLOSED when no mode reached the crew — the threading bug itself", () => {
    // This is the round-40 finding: the gate never fired because nothing was
    // threaded. An absent mode must refuse, not inherit a permissive default.
    for (const absent of [undefined, null, "", "   "]) {
      const v = isCommitPermitted(absent);
      strictEqual(v.allowed, false, String(absent));
      ok(v.reason.includes("permissionMode"), v.reason);
    }
  });

  it("allows an unknown mode: only the known read-only modes block", () => {
    strictEqual(isCommitPermitted("yolo").allowed, true,
      "an unknown-but-present mode is a catalogue question, not a commit question");
    // Documented asymmetry: only the KNOWN read-only modes block, because a
    // typo'd mode still went through /mode's validation upstream.
  });

  it("is case- and whitespace-exact on the forbidden modes", () => {
    strictEqual(isCommitPermitted(" plan ").allowed, false);
    strictEqual(isCommitPermitted("Plan").allowed, true, "the vocabulary is case-sensitive everywhere");
  });
});

describe("buildCommitPlan (B-1)", () => {
  it("ACCEPTANCE 1 — names the file list, what it includes and what stays out; never `git add -A`", () => {
    const plan = buildCommitPlan({ branch: "main" });
    deepStrictEqual(plan.steps, ["git add -- <files>", "git commit -F <drafted message> -- <files>"]);
    ok(!plan.notice.includes("git add -A"));
    ok(plan.notice.includes("untracked"), "staging untracked files is the surprise to disclose");
    ok(plan.notice.includes("the work folder left out"));
    ok(plan.notice.includes("identity"));
    ok(plan.question.includes("EVERY change"));
    ok(plan.question.includes("main"));
  });

  it("names the paths given and the push when asked", () => {
    const plan = buildCommitPlan({ paths: ["src/a.ts"], push: true });
    ok(plan.notice.includes("the changes under src/a.ts"));
    ok(plan.steps.includes("git push -u origin <branch>"));
    ok(plan.question.endsWith("and push?"));
  });

  it("works without a known branch", () => {
    const plan = buildCommitPlan();
    ok(plan.question.length > 0);
    ok(plan.notice.includes("current branch"));
  });

  it("says the subject comes after the confirmation, instead of implying it is known", () => {
    ok(buildCommitPlan({ branch: "x" }).notice.includes("drafted after this confirmation"));
  });
});

describe("parseCommitArgs", () => {
  it("reads the flags and keeps the other words as paths; --pr implies the push", () => {
    deepStrictEqual(parseCommitArgs(["-y", "src/a.ts", "--pr", "docs/"]), {
      ok: true, args: { yes: true, push: true, pr: true, paths: ["src/a.ts", "docs/"] },
    });
    deepStrictEqual(parseCommitArgs([]), { ok: true, args: { yes: false, push: false, pr: false, paths: [] } });
    deepStrictEqual(parseCommitArgs(["--push"]), { ok: true, args: { yes: false, push: true, pr: false, paths: [] } });
  });

  it("refuses an unknown option instead of reading it as a path", () => {
    const parsed = parseCommitArgs(["--all"]);
    ok(!parsed.ok && parsed.text.includes("'--all'"));
  });

  it("reads every word after `--` as a path, even one that starts with `-`", () => {
    deepStrictEqual(parseCommitArgs(["--push", "--", "-odd.md", "--yes"]), {
      ok: true, args: { yes: false, push: true, pr: false, paths: ["-odd.md", "--yes"] },
    });
  });
});

describe("hasExplicitConfirm (B-1)", () => {
  it("recognises --yes and -y", () => {
    strictEqual(hasExplicitConfirm(["--yes"]), true);
    strictEqual(hasExplicitConfirm(["-y"]), true);
    strictEqual(hasExplicitConfirm(["-Y"]), true);
    strictEqual(hasExplicitConfirm([" --yes "]), true);
  });

  it("is false on anything else, including the empty argument list", () => {
    strictEqual(hasExplicitConfirm([]), false);
    strictEqual(hasExplicitConfirm(["yes"]), false, "a bare 'yes' is not the flag");
    strictEqual(hasExplicitConfirm(["--force"]), false);
    strictEqual(hasExplicitConfirm([undefined, null]), false);
  });
});

describe("what the status says the commit will hold", () => {
  const status = " M src/a.ts\nR  old.ts -> src/new.ts\n?? notes/todo.md\n?? \"with space.txt\"\n";
  it("lists every path, the new one of a rename, quotes removed", () => {
    deepStrictEqual(statusPaths(status), ["src/a.ts", "src/new.ts", "notes/todo.md", "with space.txt"]);
  });
  it("lists the untracked files apart", () => {
    deepStrictEqual(untrackedPaths(status), ["notes/todo.md", "with space.txt"]);
  });
});

describe("secretLikePaths", () => {
  it("flags env files, key and certificate stores, private keys and credentials files", () => {
    deepStrictEqual(
      secretLikePaths([".env", "app/.env.production", "certs/server.pem", "deploy/id_rsa", "credentials.json", "keys/x.p12"]),
      [".env", "app/.env.production", "certs/server.pem", "deploy/id_rsa", "credentials.json", "keys/x.p12"],
    );
  });
  it("lets the examples, public keys and ordinary code through", () => {
    deepStrictEqual(secretLikePaths([".env.example", "id_rsa.pub", "src/secret-manager.ts", "src/keys.ts", "README.md"]), []);
  });
});

describe("commitRefusal", () => {
  it("reads a refusal and lets a message through", () => {
    strictEqual(commitRefusal("REFUSE: config.ts: an API key"), "config.ts: an API key");
    strictEqual(commitRefusal("REFUSE:"), "no reason given");
    strictEqual(commitRefusal("feat: add flags"), null);
  });
});
