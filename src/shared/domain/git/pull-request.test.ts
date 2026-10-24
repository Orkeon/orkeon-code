// The pull request opened with the github tool: origin's repository and the
// decision that mirrors the host gate. Run:
//   node --test src/shared/domain/git/pull-request.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { GITHUB_ALLOW_RULE, parseGitHubRemote, pullRequestPermission } from "./pull-request.ts";
import { readRule } from "../agent-policy/permission.ts";
import type { PermissionRule } from "../agent-policy/permission.ts";

describe("parseGitHubRemote", () => {
  it("reads the https, scp-like and ssh forms, with or without .git", () => {
    for (const url of [
      "https://github.com/Orkeon/orkeon-code.git", "https://github.com/Orkeon/orkeon-code",
      "https://token-free@github.com/Orkeon/orkeon-code.git\n", "git@github.com:Orkeon/orkeon-code.git",
      "ssh://git@github.com/Orkeon/orkeon-code.git", "ssh://git@github.com:22/Orkeon/orkeon-code", "https://github.com/Orkeon/orkeon-code/",
    ]) deepStrictEqual(parseGitHubRemote(url), { owner: "Orkeon", repo: "orkeon-code" }, url);
  });

  it("keeps a dot in the repository name", () => {
    deepStrictEqual(parseGitHubRemote("git@github.com:a/b.c.git"), { owner: "a", repo: "b.c" });
  });

  it("refuses any other host, a path, and a deeper path", () => {
    for (const url of ["https://gitlab.com/a/b.git", "https://github.example.com/a/b", "/srv/git/b.git", "", "https://github.com/a/b/c"]) {
      strictEqual(parseGitHubRemote(url), null, url);
    }
  });
});

describe("pullRequestPermission — as the host gate decides github", () => {
  const ARGS = { action: "create_pr", owner: "o", repo: "r", base: "main", head: "feat/x", title: "t", body: "b" };
  const rules = (...lines: string[]): PermissionRule[] => lines.map((l) => readRule(l)!);
  const decide = (mode: string, asked = false, r: PermissionRule[] = []) => pullRequestPermission({ mode, rules: r, asked, args: ARGS });

  it("refuses the read-only modes and an unknown one, an allow rule or a yes notwithstanding", () => {
    for (const mode of ["plan", "dontAsk", "turbo"]) {
      strictEqual(decide(mode, true, rules("allow github")).ok, false, mode);
    }
  });

  it("runs in bypassPermissions, and with an allow rule in default and acceptEdits", () => {
    strictEqual(decide("bypassPermissions").ok, true);
    strictEqual(decide("default", false, rules(GITHUB_ALLOW_RULE)).ok, true);
    strictEqual(decide("acceptEdits", false, rules("allow github")).ok, true);
  });

  it("runs in default and acceptEdits when the user was asked, and says the rule to add otherwise", () => {
    strictEqual(decide("default", true).ok, true);
    strictEqual(decide("acceptEdits", true).ok, true);
    const refused = decide("default");
    ok(!refused.ok && refused.reason.includes(`/permissions add ${GITHUB_ALLOW_RULE}`), JSON.stringify(refused));
  });

  it("lets a deny rule win in every mode, an argument pattern included", () => {
    for (const mode of ["default", "acceptEdits", "bypassPermissions"]) {
      strictEqual(decide(mode, true, rules("allow github", "deny github action=create_pr")).ok, false, mode);
    }
    strictEqual(decide("bypassPermissions", false, rules("deny github repo=other")).ok, true);
    strictEqual(decide("default", false, rules("allow github repo=other")).ok, false);
  });
});
