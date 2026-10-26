// Context gathering over the fakes of the ports it receives. Run:
//   node --test src/crews/main-loop/application/context-gather.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { readInstructionsFile, readGauge, readHooks, readLanguage, readMemoryByCategory } from "../../../../src/crews/main-loop/application/context-gather.ts";
import { MAX_MEMORY_ENTRIES_PER_CATEGORY } from "../../../../src/crews/main-loop/domain/prompt-assembly.ts";
import { HOOKS_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeMemoryStore } from "../../../support/doubles/fake-memory-store.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeTelemetry } from "../../../support/doubles/fake-telemetry.ts";
import {
  CLAUDE_MD_FALLBACKS, NO_INSTRUCTIONS, NO_LANGUAGE, ZERO_GAUGE, languageStore,
} from "./context-gather.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("readInstructionsFile", () => {
  it("reads AGENTS.md first", async () => {
    // Arrange
    const files = new FakeFiles();
    files.files.set(`${WORKSPACE}/AGENTS.md`, "# Agents\n");
    files.files.set(`${WORKSPACE}/CLAUDE.md`, "# Legacy\n");

    // Act
    const read = await readInstructionsFile(files);

    // Assert
    deepStrictEqual(read, { file: "AGENTS.md", content: "# Agents\n" });
  });

  for (const c of CLAUDE_MD_FALLBACKS) {
    it(`falls back to CLAUDE.md ${c.name}`, async () => {
      // Arrange
      const files = new FakeFiles();
      c.arrange(files);

      // Act
      const read = await readInstructionsFile(files);

      // Assert
      deepStrictEqual(read, { file: "CLAUDE.md", content: "# Project\n" });
    });
  }

  for (const c of NO_INSTRUCTIONS) {
    it(`omits ${c.name}`, async () => {
      // Arrange
      const files = new FakeFiles();
      c.arrange(files);

      // Act
      const read = await readInstructionsFile(files);

      // Assert
      strictEqual(read, undefined);
    });
  }
});

describe("readLanguage", () => {
  it("reads answer.language, trimmed", async () => {
    // Arrange
    const store = languageStore(" French ");

    // Act
    const language = await readLanguage(store);

    // Assert
    strictEqual(language, "French");
  });

  for (const c of NO_LANGUAGE) {
    it(`is empty ${c.name}`, async () => {
      // Arrange
      const { store } = c;

      // Act
      const language = await readLanguage(store);

      // Assert
      strictEqual(language, "");
    });
  }
});

describe("readMemoryByCategory", () => {
  it("reads every category, without blank entries, capped per category", async () => {
    // Arrange
    const memory = new FakeMemoryStore();
    await memory.add("user", "prefers tabs");
    await memory.add("user", "");
    for (let i = 0; i < MAX_MEMORY_ENTRIES_PER_CATEGORY + 2; i++) await memory.add("project", `fact ${i}`);

    // Act
    const read = await readMemoryByCategory(memory);

    // Assert
    deepStrictEqual(Object.keys(read), ["user", "project", "feedback", "reference"]);
    deepStrictEqual(read.user, ["prefers tabs"]);
    strictEqual(read.project.length, MAX_MEMORY_ENTRIES_PER_CATEGORY);
    deepStrictEqual(read.feedback, []);
  });

  it("omits a category that cannot be listed, and keeps the others", async () => {
    // Arrange
    const memory = new FakeMemoryStore();
    memory.failing.add("feedback");
    await memory.add("reference", "docs at /docs");

    // Act
    const read = await readMemoryByCategory(memory);

    // Assert
    deepStrictEqual(Object.keys(read), ["user", "project", "reference"]);
    deepStrictEqual(read.reference, ["docs at /docs"]);
  });
});

describe("readGauge", () => {
  it("reads the budget and the session's counters", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.budget = { used: 1000, window: 128000 };
    const telemetry = new FakeTelemetry();
    telemetry.stats = { costUsd: 0.25, totalTokens: 5000, totalCalls: 4, messageCount: 9 };

    // Act
    const gauge = await readGauge(session, telemetry);

    // Assert
    deepStrictEqual(gauge, { usedTokens: 1000, contextWindow: 128000, costUsd: 0.25, totalTokens: 5000, totalCalls: 4 });
  });

  it("reads unreported counters as zeros", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.budget = { used: 10, window: 100 };

    // Act
    const gauge = await readGauge(session, new FakeTelemetry());

    // Assert
    deepStrictEqual(gauge, { usedTokens: 10, contextWindow: 100, costUsd: 0, totalTokens: 0, totalCalls: 0 });
  });

  it("degrades the budget half to zeros on its own when the session fails", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.failure = new Error("no token_budget tool");
    const telemetry = new FakeTelemetry();
    telemetry.stats = { costUsd: 1, totalTokens: 2, totalCalls: 3 };

    // Act
    const gauge = await readGauge(session, telemetry);

    // Assert
    deepStrictEqual(gauge, { usedTokens: 0, contextWindow: 0, costUsd: 1, totalTokens: 2, totalCalls: 3 });
  });

  it("degrades the counters half to zeros on its own when the telemetry fails", async () => {
    // Arrange
    const telemetry = new FakeTelemetry();
    telemetry.stats = { costUsd: 1, totalTokens: 2, totalCalls: 3 };
    telemetry.failure = new Error("no session_stats tool");

    // Act
    const gauge = await readGauge(new FakeSessionStore(), telemetry);

    // Assert
    deepStrictEqual(gauge, ZERO_GAUGE);
  });
});

describe("readHooks", () => {
  it("reads the declared hooks, skipping entries that are not objects", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.state.set(HOOKS_STATE_KEY, `[{"event":"pre","command":"npm test"},"stray",null]`);

    // Act
    const hooks = await readHooks(session);

    // Assert
    deepStrictEqual(hooks, [{ event: "pre", command: "npm test" }]);
  });

  it("reads no hooks from a malformed registry", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.state.set(HOOKS_STATE_KEY, "[oops");

    // Act
    const hooks = await readHooks(session);

    // Assert
    deepStrictEqual(hooks, []);
  });
});
