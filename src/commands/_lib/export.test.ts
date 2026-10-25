// /export (commands/_lib/export.ts): conversation, memory and cost as markdown, and
// runExport over the fakes. Run:
//   node --test src/commands/_lib/export.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";

import { DEFAULT_EXPORT_PATH, renderSessionExport, runExport } from "./export.ts";
import { exportDeps, sessionExport } from "./export.fixtures.ts";
import { assertMentions } from "../../../tests/support/assertions/text.ts";

describe("/export — renderSessionExport", () => {
  it("carries all three parts the baseline names", () => {
    // Arrange
    const inputs = sessionExport();

    // Act
    const md = renderSessionExport(inputs);

    // Assert
    assertMentions(md, ["## Usage", "## Memory", "## Conversation", "remember this", "**user:** q"]);
  });

  it("includes the cost, which cannot be reconstructed after the process ends", () => {
    // Arrange
    const inputs = sessionExport();

    // Act
    const md = renderSessionExport(inputs);

    // Assert
    assertMentions(md, ["$0.0500", "1234", "3"]);
  });

  it("omits an empty memory section instead of heading over nothing", () => {
    // Arrange
    // "## Memory" with no entries reads as data loss.
    const inputs = sessionExport({ memory: {} });

    // Act
    const md = renderSessionExport(inputs);

    // Assert
    strictEqual(md.includes("## Memory"), false);
  });

  it("drops a category that is present but empty", () => {
    // Arrange
    const inputs = sessionExport({ memory: { project: [] } });

    // Act
    const md = renderSessionExport(inputs);

    // Assert
    strictEqual(md.includes("## Memory"), false);
  });

  it("says the buffer is empty rather than rendering a blank section", () => {
    // Arrange
    const inputs = sessionExport({ messages: [] });

    // Act
    const md = renderSessionExport(inputs);

    // Assert
    ok(md.includes("the session buffer is empty"), md);
  });

  it("stamps the generation time when the caller supplies one", () => {
    // Arrange
    const inputs = sessionExport({ generatedAt: "2026-08-05T12:00:00Z" });

    // Act
    const md = renderSessionExport(inputs);

    // Assert
    ok(md.includes("2026-08-05"), md);
  });

  it("stamps no generation time when the caller supplies none", () => {
    // Arrange
    // The module is pure: it never reads a clock.
    const inputs = sessionExport();

    // Act
    const md = renderSessionExport(inputs);

    // Assert
    strictEqual(md.includes("_generated"), false);
  });
});

describe("/export — runExport", () => {
  it("writes the conversation, the memory and the cost to the given path", async () => {
    // Arrange
    const deps = exportDeps();
    deps.session.messages = [{ role: "user", content: "q" }];
    deps.telemetry.cost = { totalTokens: 12, costUsd: 0.01, totalCalls: 1 };
    deps.memory.records = [{ id: 1, category: "project", content: "uses pnpm" }, { id: 2, category: "user", content: "" }];

    // Act
    const view = await runExport(["/output/x.md"], deps);

    // Assert
    deepStrictEqual(view, {
      text: "exported → /output/x.md (1 message(s), 1 memory entr(y/ies), cost included)",
    });
    deepStrictEqual(deps.files.writes, [{
      path: "/output/x.md",
      content: renderSessionExport({
        messages: [{ role: "user", content: "q" }],
        memory: { project: ["uses pnpm"] },
        cost: { totalTokens: 12, costUsd: 0.01, calls: 1 },
      }),
    }]);
  });

  it("writes to the default path, an empty session and without an unavailable category", async () => {
    // Arrange
    const deps = exportDeps();
    deps.session.failure = new Error("no session tools");
    deps.telemetry.failure = new Error("no session tools");
    deps.memory.records = [{ id: 1, category: "user", content: "terse" }, { id: 2, category: "project", content: "p" }];
    deps.memory.failing.add("project");

    // Act
    const view = await runExport([], deps);

    // Assert
    deepStrictEqual(view, {
      text: `exported → ${DEFAULT_EXPORT_PATH} (0 message(s), 1 memory entr(y/ies), cost included)`,
    });
    strictEqual(deps.files.writes[0].path, DEFAULT_EXPORT_PATH);
    strictEqual(deps.files.writes[0].content, renderSessionExport({ messages: [], memory: { user: ["terse"] }, cost: {} }));
  });
});
