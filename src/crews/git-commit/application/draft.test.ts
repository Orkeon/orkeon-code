// The commit use case over FakeShell, FakeFiles, FakeLlm and FakeCrewMemory. Run:
//   node_modules/.bin/tsx --test crews/git-commit/application/draft.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok, rejects } from "node:assert";

import { inspectWorkTree, commitAll, buildCommitPrompt, draftCommitMessage } from "./draft.ts";
import type { WorkTree } from "./draft.ts";
import { normalizeCommitMessage } from "../domain/commit.ts";
import { FakeCrewMemory } from "../../../../tests/support/fake-crew-memory.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const TREE: WorkTree = { status: "M a.ts", diff: "", branch: "main", recent: "" };
const MESSAGE = "fix(api): handle null\n\nbody";

describe("inspectWorkTree", () => {
  it("snapshots status, diff, branch (trimmed) and history", async () => {
    const shell = new FakeShell();
    shell.results["git status --short"] = { stdout: " M a.ts\n" };
    shell.results["git diff HEAD"] = { stdout: "diff --git" };
    shell.results["git branch --show-current"] = { stdout: "feature/x\n" };
    shell.results["git log --oneline -10"] = { stdout: "abc first" };
    deepStrictEqual(await inspectWorkTree(shell), {
      status: " M a.ts\n", diff: "diff --git", branch: "feature/x", recent: "abc first",
    });
  });
});

describe("draftCommitMessage", () => {
  it("drafts from the work tree, cleans the reply and keeps it in the crew's memory", async () => {
    const llm = new FakeLlm();
    llm.completions = ["```\nfix(api): handle null\n\nbody\n```"];
    const memory = new FakeCrewMemory();
    const message = await draftCommitMessage({ llm, memory }, TREE);
    strictEqual(message, normalizeCommitMessage(llm.completions[0] as string));
    deepStrictEqual(llm.completes, [{ prompt: buildCommitPrompt(TREE), override: undefined }]);
    deepStrictEqual([...memory.stored], [["commit_message", message]]);
  });

  it("keeps nothing when the model call fails", async () => {
    const llm = new FakeLlm();
    llm.completions = [new Error("the model call failed: 503")];
    const memory = new FakeCrewMemory();
    await rejects(draftCommitMessage({ llm, memory }, TREE), /503/);
    strictEqual(memory.stored.size, 0);
  });
});

describe("commitAll", () => {
  it("refuses a read-only mode before any shell call", async () => {
    const shell = new FakeShell();
    const files = new FakeFiles();
    const out = await commitAll(TREE, MESSAGE, "plan", { shell, files });
    ok(out.startsWith("✗ refused:"), out);
    deepStrictEqual(shell.commands, []);
    deepStrictEqual(files.writes, []);
  });

  it("stages, writes the message file, commits and reports the hash", async () => {
    const shell = new FakeShell();
    const files = new FakeFiles();
    shell.results["git rev-parse --short HEAD"] = { stdout: "1a2b3c4\n" };
    const out = await commitAll(TREE, MESSAGE, "default", { shell, files });
    strictEqual(out, "✓ committed 1a2b3c4 on main\nfix(api): handle null");
    deepStrictEqual(shell.commands, ["git add -A", "git commit -F .git/ORKEON_COMMITMSG", "git rev-parse --short HEAD"]);
    deepStrictEqual(files.writes, [{ path: "/workspace/.git/ORKEON_COMMITMSG", content: MESSAGE }]);
  });

  it("stops on a failed git add with its stderr", async () => {
    const shell = new FakeShell();
    shell.results["git add -A"] = { exitCode: 1, stderr: "index.lock exists" };
    strictEqual(await commitAll(TREE, MESSAGE, "default", { shell, files: new FakeFiles() }), "✗ git add failed: index.lock exists");
    deepStrictEqual(shell.commands, ["git add -A"]);
  });

  it("reports a failed commit with stderr, or stdout when stderr is empty", async () => {
    const shell = new FakeShell();
    shell.results["git commit -F .git/ORKEON_COMMITMSG"] = { exitCode: 1, stdout: "nothing to commit" };
    strictEqual(await commitAll(TREE, MESSAGE, "default", { shell, files: new FakeFiles() }), "✗ git commit failed: nothing to commit");
  });
});
