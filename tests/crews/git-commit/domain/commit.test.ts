// Run: node --test tests/crews/git-commit/domain/commit.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import {
  normalizeCommitMessage, commitSubject, isConventionalCommit,
  isCommitPermitted, buildCommitPlan, parseCommitArgs, commitRefusal, secretLikePaths, statusPaths, untrackedPaths,
  inputFlag, namedPaths } from "../../../../src/crews/git-commit/domain/commit.ts";
import type { CommitArgs } from "../../../../src/crews/git-commit/domain/commit.ts";
import * as commitModule from "../../../../src/crews/git-commit/domain/commit.ts";
import {
  ABSENT_MODES, CONFIRM_FLAGS, CONVENTIONAL_SUBJECTS, FLAGGED_SECRET_PATHS, INPUT_FLAGS, NAMED_PATHS, NORMALIZED, ORDINARY_PATHS, PARSED_ARGS, READ_ONLY_MODES, REFUSALS,
  SECRET_PATHS, STATUS, WRITING_MODES, args,
} from "./commit.fixtures.ts";
import { assertMentions } from "../../../support/assertions/text.ts";

describe("normalizeCommitMessage", () => {
  for (const c of NORMALIZED) {
    it(c.name, () => {
      // Arrange
      const { input } = c;

      // Act
      const message = normalizeCommitMessage(input);

      // Assert
      strictEqual(message, c.expected);
    });
  }
});

describe("commitSubject", () => {
  it("returns the first line", () => {
    // Arrange
    const message = "feat: x\n\nbody";

    // Act
    const subject = commitSubject(message);

    // Assert
    strictEqual(subject, "feat: x");
  });
});

describe("isConventionalCommit", () => {
  for (const subject of CONVENTIONAL_SUBJECTS) {
    it(`accepts type(scope): subject: ${subject}`, () => {
      // Arrange
      const message = subject;

      // Act
      const conventional = isConventionalCommit(message);

      // Assert
      strictEqual(conventional, true);
    });
  }

  it("rejects free-form", () => {
    // Arrange
    const message = "updated stuff";

    // Act
    const conventional = isConventionalCommit(message);

    // Assert
    strictEqual(conventional, false);
  });
});

// ── B-1 ─────────────────────────────────────────────────────────────────

describe("isCommitPermitted (B-1)", () => {
  for (const mode of READ_ONLY_MODES) {
    it(`ACCEPTANCE 3 — refuses the read-only mode ${mode}, so commitAll is unreachable`, () => {
      // Arrange
      const given = mode;

      // Act
      const v = isCommitPermitted(given);

      // Assert
      strictEqual(v.allowed, false, mode);
      ok(v.reason.includes(mode), v.reason);
      ok(v.reason.includes("/mode"), "the refusal must say how to proceed");
    });
  }

  for (const mode of WRITING_MODES) {
    it(`allows the mode ${mode}, which may write`, () => {
      // Arrange
      const given = mode;

      // Act
      const v = isCommitPermitted(given);

      // Assert
      strictEqual(v.allowed, true, mode);
    });
  }

  for (const absent of ABSENT_MODES) {
    it(`FAILS CLOSED when no mode reached the crew — the threading bug itself: ${JSON.stringify(absent)}`, () => {
      // Arrange
      // This is the round-40 finding: the gate never fired because nothing was
      // threaded. An absent mode must refuse, not inherit a permissive default.
      const given = absent;

      // Act
      const v = isCommitPermitted(given);

      // Assert
      strictEqual(v.allowed, false, String(absent));
      ok(v.reason.includes("permissionMode"), v.reason);
    });
  }

  it("allows an unknown mode: only the known read-only modes block", () => {
    // Arrange
    // Documented asymmetry: only the KNOWN read-only modes block, because a
    // typo'd mode still went through /mode's validation upstream.
    const mode = "yolo";

    // Act
    const v = isCommitPermitted(mode);

    // Assert
    strictEqual(v.allowed, true,
      "an unknown-but-present mode is a catalogue question, not a commit question");
  });

  it("is whitespace-exact on the forbidden modes: a padded read-only mode still refuses", () => {
    // Arrange
    const mode = " plan ";

    // Act
    const v = isCommitPermitted(mode);

    // Assert
    strictEqual(v.allowed, false);
  });

  it("is case-exact on the forbidden modes", () => {
    // Arrange
    const mode = "Plan";

    // Act
    const v = isCommitPermitted(mode);

    // Assert
    strictEqual(v.allowed, true, "the vocabulary is case-sensitive everywhere");
  });
});

describe("buildCommitPlan (B-1)", () => {
  it("ACCEPTANCE 1 — names the file list, what it includes and what stays out; never `git add -A`", () => {
    // Arrange
    const options = { branch: "main" };

    // Act
    const plan = buildCommitPlan(options);

    // Assert
    deepStrictEqual(plan.steps, ["git add -- <files>", "git commit -F <drafted message> -- <files>"]);
    ok(!plan.notice.includes("git add -A"));
    ok(plan.notice.includes("untracked"), "staging untracked files is the surprise to disclose");
    assertMentions(plan.notice, ["the work folder left out", "identity"]);
    assertMentions(plan.question, ["EVERY change", "main"]);
  });

  it("names the paths given and the push when asked", () => {
    // Arrange
    const options = { paths: ["src/a.ts"], push: true };

    // Act
    const plan = buildCommitPlan(options);

    // Assert
    ok(plan.notice.includes("the changes under src/a.ts"));
    ok(plan.steps.includes("git push -u origin <branch>"));
    ok(plan.question.endsWith("and push?"));
  });

  it("names the pull request when --pr asks for it: the yes is the question the github call needs", () => {
    // Arrange
    const options = { pr: true };

    // Act
    const plan = buildCommitPlan(options);

    // Assert
    deepStrictEqual(plan.steps.slice(-2), ["git push -u origin <branch>", "github create_pr"]);
    ok(plan.notice.includes("open the pull request with the github tool"));
    ok(plan.question.endsWith("and push, then open the pull request?"));
  });

  it("names no pull request on a push alone", () => {
    // Arrange
    const options = { push: true };

    // Act
    const plan = buildCommitPlan(options);

    // Assert
    ok(!plan.steps.includes("github create_pr"));
  });

  it("works without a known branch", () => {
    // Arrange
    const options = undefined;

    // Act
    const plan = buildCommitPlan(options);

    // Assert
    ok(plan.question.length > 0);
    ok(plan.notice.includes("current branch"));
  });

  it("says the subject comes after the confirmation, instead of implying it is known", () => {
    // Arrange
    const options = { branch: "x" };

    // Act
    const plan = buildCommitPlan(options);

    // Assert
    ok(plan.notice.includes("drafted after this confirmation"));
  });
});

describe("parseCommitArgs", () => {
  for (const c of PARSED_ARGS) {
    it(`reads the flags and keeps the other words as paths; --pr implies the push: ${c.name}`, () => {
      // Arrange
      const { words } = c;

      // Act
      const parsed = parseCommitArgs(words);

      // Assert
      deepStrictEqual(parsed, { ok: true, args: c.args });
    });
  }

  it("refuses an unknown option instead of reading it as a path", () => {
    // Arrange
    const words = ["--all"];

    // Act
    const parsed = parseCommitArgs(words);

    // Assert
    ok(!parsed.ok && parsed.text.includes("'--all'"));
  });

  it("reads every word after `--` as a path, even one that starts with `-`", () => {
    // Arrange
    const words = ["--push", "--", "-odd.md", "--yes"];

    // Act
    const parsed = parseCommitArgs(words);

    // Assert
    deepStrictEqual(parsed, { ok: true, args: args({ push: true, paths: ["-odd.md", "--yes"] }) });
  });
});

describe("the confirm flag (B-1)", () => {
  for (const t of CONFIRM_FLAGS) {
    it(`is read by parseCommitArgs alone: --yes, -y, any case, blanks around: ${JSON.stringify(t)}`, () => {
      // Arrange
      const words = [t];

      // Act
      const parsed = parseCommitArgs(words);

      // Assert
      strictEqual(parsed.ok && (parsed as { args: CommitArgs }).args.yes, true, t);
    });
  }

  it("is not a bare 'yes', which is a path", () => {
    // Arrange
    const words = ["yes"];

    // Act
    const parsed = parseCommitArgs(words);

    // Assert
    deepStrictEqual(parsed, { ok: true, args: args({ paths: ["yes"] }) });
  });

  it("is off when no word is given", () => {
    // Arrange
    const words: string[] = [];

    // Act
    const parsed = parseCommitArgs(words);

    // Assert
    deepStrictEqual(parsed, { ok: true, args: args() });
  });

  it("has no second reader exported beside parseCommitArgs", () => {
    // Arrange
    const reader = "hasExplicitConfirm";

    // Act
    const exported = reader in commitModule;

    // Assert
    strictEqual(exported, false);
  });
});

describe("what the status says the commit will hold", () => {
  it("lists every path, the new one of a rename, quotes removed", () => {
    // Arrange
    const status = STATUS;

    // Act
    const paths = statusPaths(status);

    // Assert
    deepStrictEqual(paths, ["src/a.ts", "src/new.ts", "notes/todo.md", "with space.txt"]);
  });

  it("lists the untracked files apart", () => {
    // Arrange
    const status = STATUS;

    // Act
    const paths = untrackedPaths(status);

    // Assert
    deepStrictEqual(paths, ["notes/todo.md", "with space.txt"]);
  });
});

describe("secretLikePaths", () => {
  it("flags env files, key and certificate stores, private keys and credentials files", () => {
    // Arrange
    const paths = SECRET_PATHS;

    // Act
    const flagged = secretLikePaths(paths);

    // Assert
    deepStrictEqual(flagged, FLAGGED_SECRET_PATHS);
  });

  it("lets the examples, public keys and ordinary code through", () => {
    // Arrange
    const paths = ORDINARY_PATHS;

    // Act
    const flagged = secretLikePaths(paths);

    // Assert
    deepStrictEqual(flagged, []);
  });
});

describe("commitRefusal", () => {
  for (const c of REFUSALS) {
    it(c.name, () => {
      // Arrange
      const { reply } = c;

      // Act
      const refusal = commitRefusal(reply);

      // Assert
      strictEqual(refusal, c.refusal);
    });
  }
});

describe("inputFlag", () => {
  for (const c of INPUT_FLAGS) {
    it(`reads true and "true" alone as a set flag: ${c.name}`, () => {
      // Arrange
      const { value } = c;

      // Act
      const set = inputFlag(value);

      // Assert
      strictEqual(set, c.expected);
    });
  }
});

describe("namedPaths", () => {
  for (const c of NAMED_PATHS) {
    it(`reads an array or one path per line, trimmed, blanks dropped: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const paths = namedPaths(raw);

      // Assert
      deepStrictEqual(paths, c.expected);
    });
  }
});
