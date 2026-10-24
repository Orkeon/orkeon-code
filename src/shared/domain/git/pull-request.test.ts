// The pull request opened with the github tool: origin's repository and the
// decision that mirrors the host gate. Run:
//   node --test src/shared/domain/git/pull-request.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  GITHUB_ALLOW_RULE, parseGitHubRemote, parseSessionRules, pullRequestCrewInputs, pullRequestPermission,
} from "./pull-request.ts";
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

  it("refuses plan and an unknown mode, an allow rule or a yes notwithstanding", () => {
    for (const mode of ["plan", "turbo"]) {
      strictEqual(decide(mode, true, rules("allow github")).ok, false, mode);
    }
  });

  it("runs in dontAsk under an allow rule alone, as the gate does", () => {
    strictEqual(decide("dontAsk", false, rules(GITHUB_ALLOW_RULE)).ok, true);
    strictEqual(decide("dontAsk", true).ok, false);
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

describe("what /commit hands its crew for the pull request", () => {
  const read = () => ({ githubTool: true, permissionRules: ["deny github"] });

  it("asks only when --pr was confirmed at the prompt, never under --yes", () => {
    deepStrictEqual(pullRequestCrewInputs({ pr: true, push: true, yes: false, read }), { prAsked: true, ...read() });
    deepStrictEqual(pullRequestCrewInputs({ pr: true, push: true, yes: true, read }), { prAsked: false, ...read() });
  });

  it("reads the tool and the rules only when the run can reach the pull request", () => {
    let reads = 0;
    const counted = () => { reads++; return read(); };
    deepStrictEqual(pullRequestCrewInputs({ pr: false, push: false, yes: false, read: counted }), { prAsked: false });
    deepStrictEqual(pullRequestCrewInputs({ pr: false, push: true, yes: true, read: counted }), { prAsked: false, ...read() });
    strictEqual(reads, 1);
  });

  it("reads the rules the crew receives, an array or lines, the deny one refusing the call", () => {
    const parsed = parseSessionRules(["deny github", "not a rule", "allow shell_command command=npm test*"]);
    deepStrictEqual(parsed.map((r) => r.effect + " " + r.tool), ["deny github", "allow shell_command"]);
    deepStrictEqual(parseSessionRules("allow github action=create_pr\n\n"), [{ effect: "allow", tool: "github", argument: "action", pattern: "create_pr" }]);
    deepStrictEqual(parseSessionRules(undefined), []);
    const args = { action: "create_pr", owner: "o", repo: "r", base: "main", head: "x", title: "t", body: "b" };
    strictEqual(pullRequestPermission({ mode: "default", rules: parsed, asked: true, args }).ok, false);
  });
});
