// /export (commands/_lib/export.ts): conversation, memory and cost as markdown, and
// runExport over the fakes. Run:
//   node --test tests/commands-export.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";

import { DEFAULT_EXPORT_PATH, renderSessionExport, runExport } from "../src/commands/_lib/export.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakeMemoryStore } from "./support/fake-memory-store.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { FakeTelemetry } from "./support/fake-telemetry.ts";

describe("/export — renderSessionExport", () => {
  const base = {
    messages: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }],
    memory: { project: ["remember this"] },
    cost: { totalTokens: 1234, costUsd: 0.05, calls: 3 },
  };

  it("carries all three parts the baseline names", () => {
    const md = renderSessionExport(base);
    ok(md.includes("## Usage"));
    ok(md.includes("## Memory"));
    ok(md.includes("## Conversation"));
    ok(md.includes("remember this"));
    ok(md.includes("**user:** q"));
  });

  it("includes the cost, which cannot be reconstructed after the process ends", () => {
    const md = renderSessionExport(base);
    ok(md.includes("$0.0500"));
    ok(md.includes("1234"));
    ok(md.includes("3"));
  });

  it("omits an empty memory section instead of heading over nothing", () => {
    // "## Memory" with no entries reads as data loss.
    const md = renderSessionExport({ ...base, memory: {} });
    strictEqual(md.includes("## Memory"), false);
  });

  it("drops a category that is present but empty", () => {
    strictEqual(renderSessionExport({ ...base, memory: { project: [] } }).includes("## Memory"), false);
  });

  it("says the buffer is empty rather than rendering a blank section", () => {
    ok(renderSessionExport({ ...base, messages: [] }).includes("the session buffer is empty"));
  });

  it("stamps the generation time only when the caller supplies one", () => {
    // The module is pure: it never reads a clock.
    ok(renderSessionExport({ ...base, generatedAt: "2026-08-05T12:00:00Z" }).includes("2026-08-05"));
    strictEqual(renderSessionExport(base).includes("_generated"), false);
  });
});

describe("/export — runExport", () => {
  function setup() {
    const session = new FakeSessionStore();
    const telemetry = new FakeTelemetry();
    const memory = new FakeMemoryStore();
    const files = new FakeFiles();
    return { session, telemetry, memory, files, run: (...tokens: string[]) => runExport(tokens, { session, telemetry, memory, files }) };
  }

  it("writes the conversation, the memory and the cost to the given path", async () => {
    const { session, telemetry, memory, files, run } = setup();
    session.messages = [{ role: "user", content: "q" }];
    telemetry.cost = { totalTokens: 12, costUsd: 0.01, totalCalls: 1 };
    memory.records = [{ id: 1, category: "project", content: "uses pnpm" }, { id: 2, category: "user", content: "" }];
    deepStrictEqual(await run("/output/x.md"), {
      text: "exported → /output/x.md (1 message(s), 1 memory entr(y/ies), cost included)",
    });
    deepStrictEqual(files.writes, [{
      path: "/output/x.md",
      content: renderSessionExport({
        messages: [{ role: "user", content: "q" }],
        memory: { project: ["uses pnpm"] },
        cost: { totalTokens: 12, costUsd: 0.01, calls: 1 },
      }),
    }]);
  });

  it("writes to the default path, an empty session and without an unavailable category", async () => {
    const { session, telemetry, memory, files, run } = setup();
    session.failure = new Error("no session tools");
    telemetry.failure = new Error("no session tools");
    memory.records = [{ id: 1, category: "user", content: "terse" }, { id: 2, category: "project", content: "p" }];
    memory.failing.add("project");
    deepStrictEqual(await run(), {
      text: `exported → ${DEFAULT_EXPORT_PATH} (0 message(s), 1 memory entr(y/ies), cost included)`,
    });
    strictEqual(files.writes[0].path, DEFAULT_EXPORT_PATH);
    strictEqual(files.writes[0].content, renderSessionExport({ messages: [], memory: { user: ["terse"] }, cost: {} }));
  });
});
