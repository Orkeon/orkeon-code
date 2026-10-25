// The session's permission rules over FakeSessionStore, and their sync to the
// host gate over FakePermissionRules. Run:
//   node --test src/shared/application/permission-rules.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  addPermissionRule, clearPermissionRules, readPermissionRules, removePermissionRule, syncPermissionRules, syncStepRules,
} from "./permission-rules.ts";
import { PERMISSION_RULES_STATE_KEY } from "../domain/session-keys.ts";
import { FakePermissionRules } from "../../../tests/support/fake-permission-rules.ts";
import { FakeSessionStore } from "../../../tests/support/fake-session-store.ts";
import {
  BEFORE_ADD, BEFORE_REMOVE, MIXED_ENTRIES, NO_RULES, NPM_TEST, QUOTED, R, SYNCED_CALLS, SYNCED_ENTRIES, seeded, storedOf,
} from "./permission-rules.fixtures.ts";

describe("readPermissionRules", () => {
  it("reads both stored forms, and sorts out the rules on unknown tools and the entries that are no rule", async () => {
    // Arrange
    const session = seeded(...MIXED_ENTRIES);

    // Act
    const read = await readPermissionRules(session);

    // Assert
    deepStrictEqual(read, {
      rules: [{ effect: "deny", tool: "shell_command" }, NPM_TEST, { effect: "deny", tool: "file_write" }],
      dormant: ["allow:nope"],
      invalid: ["3"],
    });
  });

  it("keeps a rule on an extra tool dormant while the configured names do not hold it", async () => {
    // Arrange
    const session = seeded("deny search_issues", "allow transcribe_audio path=/tmp/*");

    // Act
    const read = await readPermissionRules(session);

    // Assert
    deepStrictEqual(read, {
      rules: [], dormant: ["deny search_issues", "allow transcribe_audio path=/tmp/*"], invalid: [],
    });
  });

  it("reads a rule on an extra tool while the configured names hold it", async () => {
    // Arrange
    const session = seeded("deny search_issues", "allow transcribe_audio path=/tmp/*");

    // Act
    const read = await readPermissionRules(session, ["search_issues", "transcribe_audio"]);

    // Assert
    deepStrictEqual(read, {
      rules: [
        { effect: "deny", tool: "search_issues" },
        { effect: "allow", tool: "transcribe_audio", argument: "path", pattern: "/tmp/*" },
      ],
      dormant: [],
      invalid: [],
    });
  });

  it("reads a tool name in the spelling of the tool it designates, case aside", async () => {
    // Arrange
    const session = seeded("deny Shell_Command", "deny Get-File");

    // Act
    const read = await readPermissionRules(session, ["get-file"]);

    // Assert
    deepStrictEqual(read.rules, [{ effect: "deny", tool: "shell_command" }, { effect: "deny", tool: "get-file" }]);
  });

  it("reads no rules from an empty bag", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const read = await readPermissionRules(session);

    // Assert
    deepStrictEqual(read, NO_RULES);
  });

  it("reads no rules from a malformed bag", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.state.set(PERMISSION_RULES_STATE_KEY, "{ not json");

    // Act
    const read = await readPermissionRules(session);

    // Assert
    deepStrictEqual(read, NO_RULES);
  });

  it("reads no rules from an unreadable bag", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.state.set(PERMISSION_RULES_STATE_KEY, "{ not json");
    session.failure = new Error("no session tools");

    // Act
    const read = await readPermissionRules(session);

    // Assert
    deepStrictEqual(read, NO_RULES);
  });
});

describe("addPermissionRule, removePermissionRule, clearPermissionRules", () => {
  it("adds a rule in place of any on the same calls, and keeps every other entry as written", async () => {
    // Arrange
    const session = seeded(...BEFORE_ADD);

    // Act
    await addPermissionRule(session, NPM_TEST);

    // Assert
    deepStrictEqual(storedOf(session), [
      "deny create_issue", "deny:file_read", "bogus", "allow shell_command command=npm test*",
    ]);
  });

  it("reads the added rule in place of the one on the same calls", async () => {
    // Arrange
    const session = seeded(...BEFORE_ADD);
    await addPermissionRule(session, NPM_TEST);

    // Act
    const read = await readPermissionRules(session);

    // Assert
    deepStrictEqual(read.rules, [{ effect: "deny", tool: "file_read" }, NPM_TEST]);
  });

  it("removes nothing, and returns nothing, when no rule equals the one named", async () => {
    // Arrange
    const session = seeded(...BEFORE_REMOVE);

    // Act
    const removed = await removePermissionRule(session, { effect: "allow", tool: "file_read" });

    // Assert
    deepStrictEqual(removed, []);
  });

  it("removes a dormant rule equal to the one named, case aside, and returns it", async () => {
    // Arrange
    const session = seeded(...BEFORE_REMOVE);

    // Act
    const removed = await removePermissionRule(session, { effect: "deny", tool: "Create_Issue" });

    // Assert
    deepStrictEqual(removed, [{ effect: "deny", tool: "create_issue" }]);
  });

  it("removes the rule equal to the one named and returns it", async () => {
    // Arrange
    const session = seeded(...BEFORE_REMOVE);

    // Act
    const removed = await removePermissionRule(session, NPM_TEST);

    // Assert
    deepStrictEqual(removed, [NPM_TEST]);
  });

  it("keeps every entry no removal named as written", async () => {
    // Arrange
    const session = seeded(...BEFORE_REMOVE);
    await removePermissionRule(session, { effect: "allow", tool: "file_read" });
    await removePermissionRule(session, { effect: "deny", tool: "Create_Issue" });

    // Act
    await removePermissionRule(session, NPM_TEST);

    // Assert
    deepStrictEqual(storedOf(session), ["deny:file_read", "bogus"]);
  });

  it("stores a pattern that starts and ends with a quote with its quotes doubled", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    await addPermissionRule(session, QUOTED);

    // Assert
    deepStrictEqual(storedOf(session), ["deny shell_command command=\"\"x\"\""]);
  });

  it("reads back a pattern that starts and ends with a quote as written", async () => {
    // Arrange
    const session = new FakeSessionStore();
    await addPermissionRule(session, QUOTED);

    // Act
    const read = await readPermissionRules(session);

    // Assert
    deepStrictEqual(read.rules, [QUOTED]);
  });

  it("clears every entry, dormant rules and non-rules included", async () => {
    // Arrange
    const session = seeded("deny create_issue", "deny file_write", "bogus");

    // Act
    await clearPermissionRules(session);

    // Assert
    deepStrictEqual(storedOf(session), []);
  });
});

describe("syncPermissionRules", () => {
  it("clears the gate, then adds the stored rules in stored order, and reports what it left out", async () => {
    // Arrange
    const gate = new FakePermissionRules();
    gate.rules = [{ effect: "deny", tool: "http_api" }];
    const session = seeded(...SYNCED_ENTRIES);

    // Act
    const sync = await syncPermissionRules({ session, gate });

    // Assert
    deepStrictEqual(gate.calls, SYNCED_CALLS);
    deepStrictEqual(gate.list(), [
      "deny shell_command command=git push*", "allow file_write", "allow shell_command command=npm test*",
    ]);
    deepStrictEqual(sync, {
      rules: gate.rules, dormant: ["deny create_issue"], invalid: ["bogus"], applied: true, builtIn: [], overridden: [],
    });
  });

  it("adds the built-in denies after the session's rules, never stores them, and leaves out a stored allow they deny", async () => {
    // Arrange
    const gate = new FakePermissionRules();
    const deny = { effect: "deny" as const, tool: "file_write", argument: "path", pattern: "m/entries/*" };
    const session = seeded("allow file_write path=m/entries/*", "deny http_api");

    // Act
    const sync = await syncPermissionRules({ session, gate, builtIn: [deny] });

    // Assert
    deepStrictEqual(gate.calls, ["clear", "add deny http_api", "add deny file_write path=m/entries/*"]);
    deepStrictEqual(sync.builtIn, [deny]);
    deepStrictEqual(sync.overridden, [{ effect: "allow", tool: "file_write", argument: "path", pattern: "m/entries/*" }]);
    strictEqual(sync.rules.length, 2);
    deepStrictEqual(storedOf(session), ["allow file_write path=m/entries/*", "deny http_api"]);
  });

  it("hands the gate the rules on the configured extra tools", async () => {
    // Arrange
    const gate = new FakePermissionRules();
    const session = seeded("deny search_issues");

    // Act
    const sync = await syncPermissionRules({ session, gate, extraNames: ["search_issues"] });

    // Assert
    deepStrictEqual(gate.calls, ["clear", "add deny search_issues"]);
    deepStrictEqual(sync.dormant, []);
  });

  it("empties the gate when the session holds no rules", async () => {
    // Arrange
    const gate = new FakePermissionRules();
    gate.rules = [{ effect: "deny", tool: "http_api" }];

    // Act
    const sync = await syncPermissionRules({ session: new FakeSessionStore(), gate });

    // Assert
    deepStrictEqual(sync, { rules: [], dormant: [], invalid: [], applied: true, builtIn: [], overridden: [] });
    deepStrictEqual(gate.calls, ["clear"]);
    deepStrictEqual(gate.rules, []);
  });

  it("leaves a host that keeps no rules alone, and says so", async () => {
    // Arrange
    const gate = new FakePermissionRules();
    gate.kept = false;

    // Act
    const sync = await syncPermissionRules({ session: seeded("deny file_write"), gate });

    // Assert
    deepStrictEqual(sync, {
      rules: [{ effect: "deny", tool: "file_write" }], dormant: [], invalid: [], applied: false, builtIn: [], overridden: [],
    });
    deepStrictEqual(gate.calls, []);
    strictEqual(gate.rules.length, 0);
  });
});

describe("syncStepRules", () => {
  it("clears the gate, replays the session's rules, then adds the step's, and leaves the bag as it was", async () => {
    // Arrange
    const gate = new FakePermissionRules();
    const session = seeded("deny http_api", "allow shell_command command=npm test*");
    const before = storedOf(session);
    const rules = [R("deny file_read path=*/bin/*")];

    // Act
    const sync = await syncStepRules({ session, gate, rules });

    // Assert
    deepStrictEqual(gate.calls, [
      "clear", "add deny http_api", "add allow shell_command command=npm test*", "add deny file_read path=*/bin/*",
    ]);
    deepStrictEqual(storedOf(session), before);
    strictEqual(sync.applied, true);
    deepStrictEqual(sync.step, rules);
    deepStrictEqual(sync.overridden, []);
    deepStrictEqual(sync.rules, [{ effect: "deny", tool: "http_api" }, NPM_TEST]);
  });

  it("adds the built-in denies after the step's rules", async () => {
    // Arrange
    const gate = new FakePermissionRules();
    const session = seeded("deny http_api");
    const builtIn = [R("deny file_write path=m/entries/*")];

    // Act
    const sync = await syncStepRules({ session, gate, rules: [R("deny file_read path=*/bin/*")], builtIn });

    // Assert
    deepStrictEqual(gate.calls, ["clear", "add deny http_api", "add deny file_read path=*/bin/*", "add deny file_write path=m/entries/*"]);
    deepStrictEqual(sync.builtIn, [R("deny file_write path=m/entries/*")]);
  });

  it("leaves out a session allow on the same calls as a step deny, and reports it", async () => {
    // Arrange
    const gate = new FakePermissionRules();
    const session = seeded("allow shell_command command=git push*");

    // Act
    const sync = await syncStepRules({ session, gate, rules: [R("deny shell_command command=git push*")] });

    // Assert
    deepStrictEqual(gate.calls, ["clear", "add deny shell_command command=git push*"]);
    deepStrictEqual(sync.overridden, [R("allow shell_command command=git push*")]);
  });

  it("keeps a broader session allow: the gate lets the deny win", async () => {
    // Arrange
    const gate = new FakePermissionRules();
    const session = seeded("allow shell_command command=git *");

    // Act
    const sync = await syncStepRules({ session, gate, rules: [R("deny shell_command command=git push*")] });

    // Assert
    deepStrictEqual(gate.calls, [
      "clear", "add allow shell_command command=git *", "add deny shell_command command=git push*",
    ]);
    deepStrictEqual(sync.overridden, []);
  });

  it("keeps a dormant session rule out of the gate, as a sync does", async () => {
    // Arrange
    const gate = new FakePermissionRules();
    const session = seeded("deny create_issue");

    // Act
    const sync = await syncStepRules({ session, gate, rules: [R("deny file_write path=.claude/*")] });

    // Assert
    deepStrictEqual(gate.calls, ["clear", "add deny file_write path=.claude/*"]);
    deepStrictEqual(sync.dormant, ["deny create_issue"]);
  });

  it("leaves a host that keeps no rules alone", async () => {
    // Arrange
    const gate = new FakePermissionRules();
    gate.kept = false;
    const session = seeded("deny http_api");

    // Act
    const sync = await syncStepRules({ session, gate, rules: [R("deny file_read path=*/bin/*")] });

    // Assert
    deepStrictEqual(gate.calls, []);
    strictEqual(sync.applied, false);
    deepStrictEqual(sync.step, []);
  });
});
