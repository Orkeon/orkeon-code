// The pull request opened with the github tool: origin's repository and the
// decision that mirrors the host gate. Run:
//   node --test src/shared/domain/git/pull-request.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  GITHUB_ALLOW_RULE, parseGitHubRemote, parseSessionRules, pullRequestCrewInputs, pullRequestPermission,
} from "./pull-request.ts";
import {
  ALLOWED_CASES, ARGS, ARGS_X, ASKED_CASES, ASK_CASES, DENY_CASES, DONT_ASK_CASES, GITHUB_REMOTES, OTHER_REMOTES, REFUSED_MODES,
  SESSION_RULES, countedRead, read, rules,
} from "./pull-request.fixtures.ts";
import type { DecisionCase } from "./pull-request.fixtures.ts";

describe("parseGitHubRemote", () => {
  for (const url of GITHUB_REMOTES) {
    it(`reads the https, scp-like and ssh forms, with or without .git: ${url.trim()}`, () => {
      // Arrange
      const remote = url;

      // Act
      const repository = parseGitHubRemote(remote);

      // Assert
      deepStrictEqual(repository, { owner: "Orkeon", repo: "orkeon-code" }, url);
    });
  }

  it("keeps a dot in the repository name", () => {
    // Arrange
    const remote = "git@github.com:a/b.c.git";

    // Act
    const repository = parseGitHubRemote(remote);

    // Assert
    deepStrictEqual(repository, { owner: "a", repo: "b.c" });
  });

  for (const url of OTHER_REMOTES) {
    it(`refuses any other host, a path, and a deeper path: '${url}'`, () => {
      // Arrange
      const remote = url;

      // Act
      const repository = parseGitHubRemote(remote);

      // Assert
      strictEqual(repository, null, url);
    });
  }
});

describe("pullRequestPermission — as the host gate decides github", () => {
  const decided = (title: string, cases: readonly DecisionCase[]): void => {
    for (const c of cases) {
      it(`${title}: ${c.name}`, () => {
        // Arrange
        const request = { mode: c.mode, rules: rules(...c.rules), asked: c.asked, args: ARGS };

        // Act
        const decision = pullRequestPermission(request);

        // Assert
        strictEqual(decision.ok, c.ok, c.name);
      });
    }
  };

  decided("refuses plan and an unknown mode, an allow rule or a yes notwithstanding", REFUSED_MODES);
  decided("runs in dontAsk under an allow rule alone, as the gate does", DONT_ASK_CASES);
  decided("runs in bypassPermissions, and with an allow rule in default and acceptEdits", ALLOWED_CASES);
  decided("runs in default and acceptEdits when the user was asked", ASKED_CASES);
  decided("lets a deny rule win in every mode, an argument pattern included", DENY_CASES);

  it("says the rule to add when the user was not asked", () => {
    // Arrange
    const request = { mode: "default", rules: [], asked: false, args: ARGS };

    // Act
    const refused = pullRequestPermission(request);

    // Assert
    ok(!refused.ok && refused.reason.includes(`/permissions add ${GITHUB_ALLOW_RULE}`), JSON.stringify(refused));
  });
});

describe("what /commit hands its crew for the pull request", () => {
  for (const c of ASK_CASES) {
    it(`asks only when --pr was confirmed at the prompt, never under --yes: ${c.name}`, () => {
      // Arrange
      const options = { pr: true, push: true, yes: c.yes, read };

      // Act
      const inputs = pullRequestCrewInputs(options);

      // Assert
      deepStrictEqual(inputs, { prAsked: c.prAsked, ...read() });
    });
  }

  it("reads the tool and the rules only when the run can reach the pull request: not without --pr or a push", () => {
    // Arrange
    const counted = countedRead();

    // Act
    const inputs = pullRequestCrewInputs({ pr: false, push: false, yes: false, read: counted.read });

    // Assert
    deepStrictEqual(inputs, { prAsked: false });
    strictEqual(counted.reads(), 0);
  });

  it("reads the tool and the rules only when the run can reach the pull request: once with a push", () => {
    // Arrange
    const counted = countedRead();

    // Act
    const inputs = pullRequestCrewInputs({ pr: false, push: true, yes: true, read: counted.read });

    // Assert
    deepStrictEqual(inputs, { prAsked: false, ...read() });
    strictEqual(counted.reads(), 1);
  });

  it("reads the rules the crew receives as an array", () => {
    // Arrange
    const lines = SESSION_RULES;

    // Act
    const parsed = parseSessionRules(lines);

    // Assert
    deepStrictEqual(parsed.map((r) => r.effect + " " + r.tool), ["deny github", "allow shell_command"]);
  });

  it("reads the rules the crew receives as lines", () => {
    // Arrange
    const lines = "allow github action=create_pr\n\n";

    // Act
    const parsed = parseSessionRules(lines);

    // Assert
    deepStrictEqual(parsed, [{ effect: "allow", tool: "github", argument: "action", pattern: "create_pr" }]);
  });

  it("reads no rule when the crew receives none", () => {
    // Arrange
    const lines = undefined;

    // Act
    const parsed = parseSessionRules(lines);

    // Assert
    deepStrictEqual(parsed, []);
  });

  it("reads the rules the crew receives, the deny one refusing the call", () => {
    // Arrange
    const parsed = parseSessionRules(SESSION_RULES);

    // Act
    const decision = pullRequestPermission({ mode: "default", rules: parsed, asked: true, args: ARGS_X });

    // Assert
    strictEqual(decision.ok, false);
  });
});
