// Context gathering over the fakes of the ports it receives. Run:
//   node_modules/.bin/tsx --test crews/main-loop/application/context-gather.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { readClaudeMd, readGauge, readHooks, readMemoryByCategory } from "./context-gather.ts";
import { MAX_MEMORY_ENTRIES_PER_CATEGORY } from "../domain/prompt-assembly.ts";
import { HOOKS_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeMemoryStore } from "../../../../tests/support/fake-memory-store.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeTelemetry } from "../../../../tests/support/fake-telemetry.ts";

describe("readClaudeMd", () => {
  it("reads the instructions file", async () => {
    const files = new FakeFiles();
    files.files.set("/workspace/CLAUDE.md", "# Project\n");
    strictEqual(await readClaudeMd(files), "# Project\n");
  });

  it("omits an absent or blank file", async () => {
    const files = new FakeFiles();
    strictEqual(await readClaudeMd(files), undefined);
    files.files.set("/workspace/CLAUDE.md", " \n");
    strictEqual(await readClaudeMd(files), undefined);
  });
});

describe("readMemoryByCategory", () => {
  it("reads every category, without blank entries, capped per category", async () => {
    const memory = new FakeMemoryStore();
    await memory.add("user", "prefers tabs");
    await memory.add("user", "");
    for (let i = 0; i < MAX_MEMORY_ENTRIES_PER_CATEGORY + 2; i++) await memory.add("project", `fact ${i}`);
    const read = await readMemoryByCategory(memory);
    deepStrictEqual(Object.keys(read), ["user", "project", "feedback", "reference"]);
    deepStrictEqual(read.user, ["prefers tabs"]);
    strictEqual(read.project.length, MAX_MEMORY_ENTRIES_PER_CATEGORY);
    deepStrictEqual(read.feedback, []);
  });

  it("omits a category that cannot be listed, and keeps the others", async () => {
    const memory = new FakeMemoryStore();
    memory.failing.add("feedback");
    await memory.add("reference", "docs at /docs");
    const read = await readMemoryByCategory(memory);
    deepStrictEqual(Object.keys(read), ["user", "project", "reference"]);
    deepStrictEqual(read.reference, ["docs at /docs"]);
  });
});

describe("readGauge", () => {
  it("reads the budget and the session's counters", async () => {
    const session = new FakeSessionStore();
    session.budget = { used: 1000, window: 128000 };
    const telemetry = new FakeTelemetry();
    telemetry.stats = { costUsd: 0.25, totalTokens: 5000, totalCalls: 4, messageCount: 9 };
    deepStrictEqual(await readGauge(session, telemetry), {
      usedTokens: 1000, contextWindow: 128000, costUsd: 0.25, totalTokens: 5000, totalCalls: 4,
    });
  });

  it("reads unreported counters as zeros", async () => {
    const session = new FakeSessionStore();
    session.budget = { used: 10, window: 100 };
    deepStrictEqual(await readGauge(session, new FakeTelemetry()), {
      usedTokens: 10, contextWindow: 100, costUsd: 0, totalTokens: 0, totalCalls: 0,
    });
  });

  it("degrades each half to zeros on its own when its port fails", async () => {
    const session = new FakeSessionStore();
    session.failure = new Error("no token_budget tool");
    const telemetry = new FakeTelemetry();
    telemetry.stats = { costUsd: 1, totalTokens: 2, totalCalls: 3 };
    deepStrictEqual(await readGauge(session, telemetry), {
      usedTokens: 0, contextWindow: 0, costUsd: 1, totalTokens: 2, totalCalls: 3,
    });
    telemetry.failure = new Error("no session_stats tool");
    deepStrictEqual(await readGauge(new FakeSessionStore(), telemetry), {
      usedTokens: 0, contextWindow: 0, costUsd: 0, totalTokens: 0, totalCalls: 0,
    });
  });
});

describe("readHooks", () => {
  it("reads the declared hooks, skipping entries that are not objects", async () => {
    const session = new FakeSessionStore();
    session.state.set(HOOKS_STATE_KEY, `[{"event":"pre","command":"npm test"},"stray",null]`);
    deepStrictEqual(await readHooks(session), [{ event: "pre", command: "npm test" }]);
  });

  it("reads no hooks from a malformed registry", async () => {
    const session = new FakeSessionStore();
    session.state.set(HOOKS_STATE_KEY, "[oops");
    deepStrictEqual(await readHooks(session), []);
  });
});
