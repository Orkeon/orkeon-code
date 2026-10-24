// The session's permission rules over FakeSessionStore, and their sync to the
// host gate over FakePermissionRules. Run:
//   node --test src/shared/application/permission-rules.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  addPermissionRule, clearPermissionRules, readPermissionRules, removePermissionRule, syncPermissionRules, syncStepRules,
} from "./permission-rules.ts";
import { PERMISSION_RULES_STATE_KEY } from "../domain/session-keys.ts";
import { readRule } from "../domain/agent-policy/permission.ts";
import type { PermissionRule } from "../domain/agent-policy/permission.ts";
import { FakePermissionRules } from "../../../tests/support/fake-permission-rules.ts";
import { FakeSessionStore } from "../../../tests/support/fake-session-store.ts";

const NPM_TEST = { effect: "allow" as const, tool: "shell_command", argument: "command", pattern: "npm test*" };

function seeded(...stored: unknown[]): FakeSessionStore {
  const session = new FakeSessionStore();
  session.state.set(PERMISSION_RULES_STATE_KEY, JSON.stringify(stored));
  return session;
}

const storedOf = (session: FakeSessionStore): unknown => JSON.parse(session.state.get(PERMISSION_RULES_STATE_KEY) ?? "null");

describe("readPermissionRules", () => {
  it("reads both stored forms, and sorts out the rules on unknown tools and the entries that are no rule", async () => {
    const session = seeded("deny:shell_command", "allow:nope", 3, "allow shell_command command=npm test*", "deny file_write");
    deepStrictEqual(await readPermissionRules(session), {
      rules: [{ effect: "deny", tool: "shell_command" }, NPM_TEST, { effect: "deny", tool: "file_write" }],
      dormant: ["allow:nope"],
      invalid: ["3"],
    });
  });

  it("reads a rule on an extra tool while the configured names hold it, and keeps it dormant otherwise", async () => {
    const session = seeded("deny search_issues", "allow transcribe_audio path=/tmp/*");
    deepStrictEqual(await readPermissionRules(session), {
      rules: [], dormant: ["deny search_issues", "allow transcribe_audio path=/tmp/*"], invalid: [],
    });
    deepStrictEqual(await readPermissionRules(session, ["search_issues", "transcribe_audio"]), {
      rules: [
        { effect: "deny", tool: "search_issues" },
        { effect: "allow", tool: "transcribe_audio", argument: "path", pattern: "/tmp/*" },
      ],
      dormant: [],
      invalid: [],
    });
  });

  it("reads a tool name in the spelling of the tool it designates, case aside", async () => {
    deepStrictEqual((await readPermissionRules(seeded("deny Shell_Command", "deny Get-File"), ["get-file"])).rules, [
      { effect: "deny", tool: "shell_command" }, { effect: "deny", tool: "get-file" },
    ]);
  });

  it("reads no rules from an empty, malformed or unreadable bag", async () => {
    const none = { rules: [], dormant: [], invalid: [] };
    const session = new FakeSessionStore();
    deepStrictEqual(await readPermissionRules(session), none);
    session.state.set(PERMISSION_RULES_STATE_KEY, "{ not json");
    deepStrictEqual(await readPermissionRules(session), none);
    session.failure = new Error("no session tools");
    deepStrictEqual(await readPermissionRules(session), none);
  });
});

describe("addPermissionRule, removePermissionRule, clearPermissionRules", () => {
  it("adds a rule in place of any on the same calls, and keeps every other entry as written", async () => {
    const session = seeded("deny create_issue", "deny:file_read", "bogus", "deny shell_command command=npm test*");
    await addPermissionRule(session, NPM_TEST);
    deepStrictEqual(storedOf(session), [
      "deny create_issue", "deny:file_read", "bogus", "allow shell_command command=npm test*",
    ]);
    deepStrictEqual((await readPermissionRules(session)).rules, [{ effect: "deny", tool: "file_read" }, NPM_TEST]);
  });

  it("removes the rules equal to the one named, a dormant one too, and returns them", async () => {
    const session = seeded("deny create_issue", "deny:file_read", "bogus", "allow shell_command command=npm test*");
    deepStrictEqual(await removePermissionRule(session, { effect: "allow", tool: "file_read" }), []);
    deepStrictEqual(await removePermissionRule(session, { effect: "deny", tool: "Create_Issue" }), [
      { effect: "deny", tool: "create_issue" },
    ]);
    deepStrictEqual(await removePermissionRule(session, NPM_TEST), [NPM_TEST]);
    deepStrictEqual(storedOf(session), ["deny:file_read", "bogus"]);
  });

  it("stores a pattern that starts and ends with a quote so that it reads back as written", async () => {
    const quoted = { effect: "deny" as const, tool: "shell_command", argument: "command", pattern: "\"x\"" };
    const session = new FakeSessionStore();
    await addPermissionRule(session, quoted);
    deepStrictEqual(storedOf(session), ["deny shell_command command=\"\"x\"\""]);
    deepStrictEqual((await readPermissionRules(session)).rules, [quoted]);
  });

  it("clears every entry, dormant rules and non-rules included", async () => {
    const session = seeded("deny create_issue", "deny file_write", "bogus");
    await clearPermissionRules(session);
    deepStrictEqual(storedOf(session), []);
  });
});

describe("syncPermissionRules", () => {
  it("clears the gate, then adds the stored rules in stored order, and reports what it left out", async () => {
    const gate = new FakePermissionRules();
    gate.rules = [{ effect: "deny", tool: "http_api" }];
    const session = seeded(
      "deny shell_command command=git push*", "allow:file_write", "bogus", "deny create_issue", "allow shell_command command=npm test*",
    );
    const sync = await syncPermissionRules({ session, gate });
    deepStrictEqual(gate.calls, [
      "clear",
      "add deny shell_command command=git push*",
      "add allow file_write",
      "add allow shell_command command=npm test*",
    ]);
    deepStrictEqual(gate.list(), [
      "deny shell_command command=git push*", "allow file_write", "allow shell_command command=npm test*",
    ]);
    deepStrictEqual(sync, { rules: gate.rules, dormant: ["deny create_issue"], invalid: ["bogus"], applied: true });
  });

  it("hands the gate the rules on the configured extra tools", async () => {
    const gate = new FakePermissionRules();
    const sync = await syncPermissionRules({ session: seeded("deny search_issues"), gate, extraNames: ["search_issues"] });
    deepStrictEqual(gate.calls, ["clear", "add deny search_issues"]);
    deepStrictEqual(sync.dormant, []);
  });

  it("empties the gate when the session holds no rules", async () => {
    const gate = new FakePermissionRules();
    gate.rules = [{ effect: "deny", tool: "http_api" }];
    deepStrictEqual(await syncPermissionRules({ session: new FakeSessionStore(), gate }), {
      rules: [], dormant: [], invalid: [], applied: true,
    });
    deepStrictEqual(gate.calls, ["clear"]);
    deepStrictEqual(gate.rules, []);
  });

  it("leaves a host that keeps no rules alone, and says so", async () => {
    const gate = new FakePermissionRules();
    gate.kept = false;
    deepStrictEqual(await syncPermissionRules({ session: seeded("deny file_write"), gate }), {
      rules: [{ effect: "deny", tool: "file_write" }], dormant: [], invalid: [], applied: false,
    });
    deepStrictEqual(gate.calls, []);
    strictEqual(gate.rules.length, 0);
  });
});

const R = (text: string): PermissionRule => {
  const rule = readRule(text);
  if (rule === null) throw new Error(`not a rule: ${text}`);
  return rule;
};

describe("syncStepRules", () => {
  it("clears the gate, replays the session's rules, then adds the step's, and leaves the bag as it was", async () => {
    const gate = new FakePermissionRules();
    const session = seeded("deny http_api", "allow shell_command command=npm test*");
    const before = storedOf(session);
    const rules = [R("deny file_read path=*/bin/*")];
    const sync = await syncStepRules({ session, gate, rules });
    deepStrictEqual(gate.calls, [
      "clear", "add deny http_api", "add allow shell_command command=npm test*", "add deny file_read path=*/bin/*",
    ]);
    deepStrictEqual(storedOf(session), before);
    strictEqual(sync.applied, true);
    deepStrictEqual(sync.step, rules);
    deepStrictEqual(sync.overridden, []);
    deepStrictEqual(sync.rules, [{ effect: "deny", tool: "http_api" }, NPM_TEST]);
  });

  it("leaves out a session allow on the same calls as a step deny, and reports it", async () => {
    const gate = new FakePermissionRules();
    const sync = await syncStepRules({
      session: seeded("allow shell_command command=git push*"), gate, rules: [R("deny shell_command command=git push*")],
    });
    deepStrictEqual(gate.calls, ["clear", "add deny shell_command command=git push*"]);
    deepStrictEqual(sync.overridden, [R("allow shell_command command=git push*")]);
  });

  it("keeps a broader session allow: the gate lets the deny win", async () => {
    const gate = new FakePermissionRules();
    const sync = await syncStepRules({
      session: seeded("allow shell_command command=git *"), gate, rules: [R("deny shell_command command=git push*")],
    });
    deepStrictEqual(gate.calls, [
      "clear", "add allow shell_command command=git *", "add deny shell_command command=git push*",
    ]);
    deepStrictEqual(sync.overridden, []);
  });

  it("keeps a dormant session rule out of the gate, as a sync does", async () => {
    const gate = new FakePermissionRules();
    const sync = await syncStepRules({ session: seeded("deny create_issue"), gate, rules: [R("deny file_write path=.claude/*")] });
    deepStrictEqual(gate.calls, ["clear", "add deny file_write path=.claude/*"]);
    deepStrictEqual(sync.dormant, ["deny create_issue"]);
  });

  it("leaves a host that keeps no rules alone", async () => {
    const gate = new FakePermissionRules();
    gate.kept = false;
    const sync = await syncStepRules({ session: seeded("deny http_api"), gate, rules: [R("deny file_read path=*/bin/*")] });
    deepStrictEqual(gate.calls, []);
    strictEqual(sync.applied, false);
    deepStrictEqual(sync.step, []);
  });
});
