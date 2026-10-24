// Run: node --test src/shared/domain/agent-policy/rule-sets.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";

import {
  catalogueFor, checkRule, coversEveryCall, formatRule, gateLine, readRule, ruleDecision, sameCalls, TOOL_ARGUMENTS,
  toolsetFor,
} from "./permission.ts";
import {
  heldRuleSets, PATH_READ_TOOLS, PATH_WRITE_TOOLS, pathRules, RULE_SET_IDS, RULE_SETS, rulesOf, UNSCOPED_WRITE_TOOLS,
  WRITTEN_TEXT,
} from "./rule-sets.ts";
import type { RuleSetId } from "./rule-sets.ts";
import { PERMISSION_MODES } from "../permission-modes.ts";
import { REVIEWER_TOOLS } from "../dev/reviewer-charter.ts";

const refused = (id: RuleSetId, tool: string, args: Record<string, unknown>): boolean =>
  ruleDecision(RULE_SETS[id].rules, tool, args) === "deny";

function assertRefused(id: RuleSetId, tool: string, argument: string, values: readonly string[], expected: boolean): void {
  for (const value of values) strictEqual(refused(id, tool, { [argument]: value }), expected, `${id}: ${value}`);
}

describe("the rule sets", () => {
  it("reads every rule of every set back unchanged, on a ruleable tool and an argument it takes", () => {
    for (const id of RULE_SET_IDS) {
      for (const r of RULE_SETS[id].rules) {
        deepStrictEqual(readRule(formatRule(r)), r, formatRule(r));
        deepStrictEqual(checkRule(formatRule(r)), { ok: true, rule: r }, formatRule(r));
        strictEqual(r.effect, "deny");
        if (coversEveryCall(r)) ok(UNSCOPED_WRITE_TOOLS.includes(r.tool), formatRule(r));
        else ok(TOOL_ARGUMENTS[r.tool].includes(r.argument!), formatRule(r));
      }
    }
  });

  it("names tools that take the argument the sets read", () => {
    for (const tool of PATH_READ_TOOLS) ok(TOOL_ARGUMENTS[tool].includes("path"), tool);
    for (const tool of PATH_WRITE_TOOLS) ok(TOOL_ARGUMENTS[tool].includes("path"), tool);
    for (const [tool, argument] of WRITTEN_TEXT) ok(TOOL_ARGUMENTS[tool].includes(argument), `${tool}.${argument}`);
  });

  it("holds 190, 23, 56, 97 and 42 rules, 407 once the deny on edit_batch both secrets and state-files hold is kept once", () => {
    deepStrictEqual(RULE_SET_IDS.map((id) => RULE_SETS[id].rules.length), [190, 23, 56, 97, 42]);
    const all = rulesOf(RULE_SET_IDS);
    strictEqual(all.length, 407);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) ok(!sameCalls(all[i], all[j]), gateLine(all[i]));
    }
    strictEqual(gateLine(RULE_SETS["git-readonly"].rules[0]), "deny shell_command command=*git add*");
    // Each set's first rules are those it held before Orkeon #180, in their order.
    strictEqual(gateLine(RULE_SETS["read-noise"].rules[7]), "deny file_read path=node_modules/*");
    strictEqual(gateLine(RULE_SETS["read-noise"].rules[8]), "deny glob path=*/bin/*");
    strictEqual(gateLine(RULE_SETS.secrets.rules[15]), "deny file_write content=*sk-ant-*");
    strictEqual(gateLine(RULE_SETS.secrets.rules[96]), "deny edit_batch");
    strictEqual(gateLine(RULE_SETS["state-files"].rules[7]), "deny file_write path=.claude/*");
    deepStrictEqual(RULE_SETS["state-files"].rules.slice(-2).map(gateLine), ["deny edit_batch", "deny structural_rewrite"]);
  });

  it("lists the sets by their own ids, in order", () => {
    deepStrictEqual(RULE_SET_IDS.map((id) => RULE_SETS[id].id), RULE_SET_IDS);
    for (const id of RULE_SET_IDS) {
      const { title } = RULE_SETS[id];
      ok(title.length > 0 && !title.includes("\n"), id);
    }
  });

  it("removes from a catalogue only the writing tools whose paths the gate cannot read", () => {
    const rules = rulesOf(RULE_SET_IDS);
    for (const mode of PERMISSION_MODES) {
      const decision = catalogueFor(mode, rules);
      const unscoped = toolsetFor(mode).filter((t) => UNSCOPED_WRITE_TOOLS.includes(t));
      deepStrictEqual(decision.deniedByRule, unscoped, mode);
      deepStrictEqual(decision.tools, toolsetFor(mode).filter((t) => !unscoped.includes(t)), mode);
    }
    deepStrictEqual(catalogueFor("default", rules).deniedByRule, ["edit_batch", "structural_rewrite"]);
    const plan = catalogueFor("plan", rules).tools;
    for (const tool of REVIEWER_TOOLS) ok(plan.includes(tool), tool);
  });

  it("git-readonly refuses the git forms that change the repository", () => {
    assertRefused("git-readonly", "shell_command", "command", [
      "git push origin main", "git push", "git -C /x push", "git -C /x push origin main", "git commit -m x",
      "git --no-pager commit -m x", "git -c user.name=x commit", "git add -A", "git stash", "git checkout -- a.ts",
      "git branch -D x", "git tag v1", "git reset --hard", "git worktree add ../w", "git -c a=b push",
      "git commit --amend", "git switch -c b", "git clean -fd", "git restore .", "git cherry-pick abc",
      "git am x.patch", "git apply p.diff", "git mv a b", "git rm a", "git notes add -m x",
      "git update-ref refs/heads/x HEAD", "git reflog expire --all", "git gc", "git fetch", "git pull",
      "git submodule update", "git remote add o u", "git -C /x remote set-url o u", "git stash pop", "git stash -u",
      "git -C /x stash drop",
    ], true);
  });

  it("git-readonly refuses git behind a path, an env, an assignment or a chain, and the verbs that write", () => {
    assertRefused("git-readonly", "shell_command", "command", [
      "env git push", "/usr/bin/git push origin", "cd x && git push", "GIT_DIR=.git git push", "git init",
      "git clone u", "git update-index --add x", "git symbolic-ref HEAD refs/heads/x", "git -c core.pager=x log",
      "git config core.hooksPath /tmp/h", "git config --global user.name x", "git replace a b",
      "git push;", "git push&&ls", "git commit\n-m x", "git stash pop;",
    ], true);
    assertRefused("git-readonly", "shell_command", "command", [
      "git config user.name", "git config --list", "git config -l", "git replace", "git status", "git stash list",
      "git remote -v",
    ], false);
  });

  it("git-readonly lets the reads run", () => {
    assertRefused("git-readonly", "shell_command", "command", [
      "git status", "git log --oneline -5", "git diff --stat", "git diff -- src/address.ts",
      "git show HEAD:src/commit.ts", "git show HEAD", "git branch", "git tag", "git remote", "git remote -v",
      "git remote show origin", "git stash list", "git stash show -p", "git notes", "git submodule",
      "git rev-parse HEAD", "npm test",
    ], false);
  });

  it("git-readonly also refuses the listing forms with arguments: no rule carves an exception", () => {
    assertRefused("git-readonly", "shell_command", "command", ["git branch -a", "git tag -l", "git worktree list"], true);
  });

  it("inline-interpreters refuses inline code and lets a script file run", () => {
    assertRefused("inline-interpreters", "shell_command", "command", [
      'bash -c "git push"', "sh -c x", "node -e 1", 'python3 -c "print(1)"',
    ], true);
    assertRefused("inline-interpreters", "shell_command", "command", [
      "bash scripts/smoke-runtime.sh", "node scripts/run-tests.mjs", "npm test",
    ], false);
  });

  it("inline-interpreters refuses inline code behind a path, an env, a flag cluster or a flag before it", () => {
    assertRefused("inline-interpreters", "shell_command", "command", [
      "bash -xc 'x'", "bash -e -c x", "/bin/bash -c x", "env bash -c x", "zsh -c x", "perl -e 1", "npx tsx -e 1",
      "node --input-type=module -e 1", "node -r x -e 1", "python3 -u -c 1",
    ], true);
    assertRefused("inline-interpreters", "shell_command", "command", [
      "bash scripts/build.sh", "node script.js", "python3 -m pytest", "sh -x build.sh",
    ], false);
  });

  it("read-noise refuses reads under build outputs, .git and node_modules, absolute or relative", () => {
    assertRefused("read-noise", "file_read", "path", [
      "/workspace/node_modules/x/index.js", "node_modules/x/index.js", "/workspace/.git/config",
      "/workspace/obj/Debug/a.dll", "/workspace/src/bin/cli.js",
    ], true);
    assertRefused("read-noise", "file_read", "path", [
      "/workspace/src/index.ts", "/workspace/.gitignore", "/workspace/binary/x", "/workspace/docs/bin.md",
    ], false);
    strictEqual(refused("read-noise", "file_write", { path: "/workspace/node_modules/x" }), false);
  });

  it("read-noise refuses the same paths to every tool that reads one path", () => {
    for (const tool of PATH_READ_TOOLS) {
      assertRefused("read-noise", tool, "path", ["node_modules/x", "/workspace/.git/HEAD"], true);
      assertRefused("read-noise", tool, "path", ["/workspace/src", "src/index.ts"], false);
    }
    strictEqual(refused("read-noise", "grep", { path: "node_modules/x", pattern: "TODO" }), true);
    strictEqual(refused("read-noise", "glob", { path: "/workspace", pattern: "node_modules/**" }), false);
  });

  it("secrets refuses a private key block anywhere in the content and the known token prefixes", () => {
    const keyBlock = "const k = `\n-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n`;";
    assertRefused("secrets", "file_write", "content", [
      keyBlock, "-----BEGIN RSA PRIVATE KEY-----\n", "token: ghp_" + "a".repeat(36), "xoxb-1234567890",
      "id = AKIAABCDEFGHIJKLMNOP", "k=sk-ant-api03-x",
    ], true);
    assertRefused("secrets", "file_write", "content", [
      "export const x = 1;\n", "-----BEGIN PUBLIC KEY-----", "-----BEGIN CERTIFICATE-----",
    ], false);
    strictEqual(refused("secrets", "file_read", { path: keyBlock }), false);
  });

  it("secrets refuses a token in the text of every writing tool, and edit_batch whole", () => {
    for (const [tool, argument] of WRITTEN_TEXT) {
      assertRefused("secrets", tool, argument, ["ghp_x", "a sk-ant-api03-x b"], true);
      assertRefused("secrets", tool, argument, ["export const x = 1;\n"], false);
    }
    strictEqual(refused("secrets", "node_replace", { path: "src/a.ts", selector: "f", text: "ghp_x" }), true);
    strictEqual(refused("secrets", "edit_file", { old_string: "ghp_x", new_string: "y" }), false);
    strictEqual(refused("secrets", "edit_batch", { operations: [] }), true);
  });

  it("state-files refuses writes to the files code owns", () => {
    assertRefused("state-files", "file_write", "path", [
      "/workspace/workbench/demo/DEMO-BATCHES-STATE.md", "/workspace/workbench/demo/DEMO-STATE-F1.md",
      "/workspace/workbench/demo/DEMO-VERIFY-F2.md", "/workspace/workbench/demo/capture-F2/index.txt",
      "/workspace/.orkeon/repo.yaml", ".orkeon/config.json", "/workspace/.claude/settings.json", ".claude/x",
    ], true);
    assertRefused("state-files", "file_write", "path", [
      "/workspace/src/x.ts", "/workspace/workbench/demo/DEMO-PLAN.md", "/workspace/docs/orkeon.md",
    ], false);
  });

  it("state-files refuses the same paths to every tool that writes one path, and the unscoped writers whole", () => {
    for (const tool of PATH_WRITE_TOOLS) {
      assertRefused("state-files", tool, "path", [".claude/x", "/workspace/.orkeon/repo.yaml"], true);
      assertRefused("state-files", tool, "path", ["/workspace/src/x.ts"], false);
    }
    strictEqual(refused("state-files", "edit_file", { path: ".claude/x", old_string: "a", new_string: "b" }), true);
    for (const tool of UNSCOPED_WRITE_TOOLS) strictEqual(refused("state-files", tool, {}), true, tool);
    strictEqual(refused("state-files", "structural_search", { pattern: "x" }), false);
  });

  it("pathRules makes two rules per root and writing tool, then denies the unscoped writers once", () => {
    const made = pathRules("write", ["./tests/", "/workspace/src/shared/domain", "tests"]);
    deepStrictEqual(made.rules.map(formatRule), [
      ...PATH_WRITE_TOOLS.flatMap((tool) => [`deny ${tool} path=/workspace/tests/*`, `deny ${tool} path=tests/*`]),
      ...PATH_WRITE_TOOLS.flatMap((tool) => [
        `deny ${tool} path=/workspace/src/shared/domain/*`, `deny ${tool} path=src/shared/domain/*`,
      ]),
      "deny edit_batch", "deny structural_rewrite",
    ]);
    strictEqual(made.rules.length, 2 * 10 + 2);
    deepStrictEqual(made.problems, []);
    strictEqual(made.rules[0].tool, "file_write");
  });

  it("pathRules makes two rules per root and reading tool, then denies structural_search once", () => {
    const made = pathRules("read", ["tests"]);
    deepStrictEqual(made.rules.map(formatRule), [
      ...PATH_READ_TOOLS.flatMap((tool) => [`deny ${tool} path=/workspace/tests/*`, `deny ${tool} path=tests/*`]),
      "deny structural_search",
    ]);
    strictEqual(made.rules.length, 14 + 1);
    strictEqual(ruleDecision(made.rules, "grep", { path: "tests/a", pattern: "x" }), "deny");
    strictEqual(ruleDecision(made.rules, "node_read", { path: "/workspace/tests/a.ts", selector: "f" }), "deny");
    strictEqual(ruleDecision(made.rules, "grep", { path: "src", pattern: "x" }), undefined);
  });

  it("pathRules says why a root gets none, and adds no whole-tool deny without a kept root", () => {
    deepStrictEqual(pathRules("write", ["/etc"]).rules, []);
    const none = pathRules("read", ["", "/workspace", "../x", "src/*", "/etc"]);
    deepStrictEqual(none.rules, []);
    deepStrictEqual(none.problems, [
      "root '' names the whole project: no rule",
      "root '/workspace' names the whole project: no rule",
      "root '../x' climbs out with '..': no rule",
      "root 'src/*' holds '*': a rule on it would cover more than the folder",
      "root '/etc' is outside /workspace: no rule",
    ]);
  });

  it("heldRuleSets counts the lines of each set and keeps the others", () => {
    const lines = ["allow shell_command command=npm test*", ...RULE_SETS["read-noise"].rules.map(gateLine)];
    deepStrictEqual(heldRuleSets(lines), {
      sets: [{ id: "read-noise", count: 56 }],
      rest: ["allow shell_command command=npm test*"],
    });
    deepStrictEqual(heldRuleSets([]), { sets: [], rest: [] });
  });
});
