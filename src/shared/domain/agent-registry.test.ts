// B-12 — the saved-agent registry. Run:
//   node --test src/shared/domain/agent-registry.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  validateSavedAgent, parseAgentRegistry, serializeAgentRegistry,
  upsertAgent, removeAgent, describeAgentRows,
} from "./agent-registry.ts";
import { AGENT, BAD_NAMES, NOT_REGISTRIES, REGISTRY_WITH_BROKEN, UNSORTED_REGISTRY } from "./agent-registry.fixtures.ts";
import { assertEveryDetailMentions, assertMentions } from "./agent-registry.assertions.ts";

describe("validateSavedAgent", () => {
  it("accepts a complete definition, lowercasing the name", () => {
    // Arrange
    const raw = { name: "Reviewer", role: "R", goal: "G" };

    // Act
    const v = validateSavedAgent(raw);

    // Assert
    ok(v.ok);
    strictEqual(v.ok && v.agent.name, "reviewer");
  });

  for (const bad of BAD_NAMES) {
    it(`refuses a name that is not a slug — it is the file's key: ${JSON.stringify(bad)}`, () => {
      // Arrange
      const raw = { name: bad, role: "R", goal: "G" };

      // Act
      const v = validateSavedAgent(raw);

      // Assert
      strictEqual(v.ok, false, bad);
    });
  }

  it("requires role, and says it is missing", () => {
    // No useful "fall back to a default" reading exists for either: a saved agent
    // without them is not a definition a human could later understand.
    // Arrange
    const raw = { name: "a", role: " ", goal: "G" };

    // Act
    const noRole = validateSavedAgent(raw);

    // Assert
    strictEqual(noRole.ok, false);
    ok(!noRole.ok && noRole.reason.includes("role"));
  });

  it("requires goal, and says it is missing", () => {
    // Arrange
    const raw = { name: "a", role: "R", goal: "" };

    // Act
    const noGoal = validateSavedAgent(raw);

    // Assert
    ok(!noGoal.ok && noGoal.reason.includes("goal"));
  });

  it("normalises tools: strings, trimmed, blanks and duplicates out", () => {
    // Arrange
    const raw = { name: "a", role: "R", goal: "G", tools: [" file_read ", "", "file_read", 7] };

    // Act
    const v = validateSavedAgent(raw);

    // Assert
    deepStrictEqual(v.ok && v.agent.tools, ["file_read", "7"]);
  });

  it("treats a non-array tools field as none rather than throwing", () => {
    // Arrange
    const raw = { name: "a", role: "R", goal: "G", tools: "file_read" };

    // Act
    const v = validateSavedAgent(raw);

    // Assert
    deepStrictEqual(v.ok && [], []);
  });
});

describe("parseAgentRegistry", () => {
  it("reads the stored map, sorted by name", () => {
    // Arrange
    const stored = UNSORTED_REGISTRY;

    // Act
    const { agents, dropped } = parseAgentRegistry(stored);

    // Assert
    deepStrictEqual(agents.map((a) => a.name), ["alpha", "zeta"]);
    deepStrictEqual(dropped, []);
  });

  it("drops invalid entries and NAMES them", () => {
    // The file is hand-editable: refusing to list ten good agents because an
    // eleventh lost its goal would make a typo cost the whole registry. Silence
    // is the part that would not be acceptable.
    // Arrange
    const stored = REGISTRY_WITH_BROKEN;

    // Act
    const { agents, dropped } = parseAgentRegistry(stored);

    // Assert
    deepStrictEqual(agents.map((a) => a.name), ["good"]);
    deepStrictEqual(dropped.sort(), ["alsoBroken", "broken"]);
  });

  for (const junk of NOT_REGISTRIES) {
    it(`returns nothing for a non-object payload: ${String(junk)}`, () => {
      // Arrange
      const stored = junk;

      // Act
      const { agents } = parseAgentRegistry(stored);

      // Assert
      deepStrictEqual(agents, [], String(junk));
    });
  }

  it("round-trips through serialize", () => {
    // Arrange
    const stored = serializeAgentRegistry([AGENT]);

    // Act
    const { agents } = parseAgentRegistry(stored);

    // Assert
    deepStrictEqual(agents, [AGENT]);
  });

  it("serialises the name as the key, not as a field", () => {
    // Arrange
    const agents = [AGENT];

    // Act
    const stored = serializeAgentRegistry(agents);

    // Assert
    deepStrictEqual(Object.keys(stored), ["reviewer"]);
    ok(!("name" in (stored.reviewer as any)));
  });
});

describe("upsertAgent / removeAgent", () => {
  it("adds when absent", () => {
    // Arrange
    const agents: typeof AGENT[] = [];

    // Act
    const r = upsertAgent(agents, AGENT);

    // Assert
    strictEqual(r.replaced, false);
    strictEqual(r.agents.length, 1);
  });

  it("replaces when present, without duplicating", () => {
    // Arrange
    const changed = { ...AGENT, role: "New" };

    // Act
    const r = upsertAgent([AGENT], changed);

    // Assert
    strictEqual(r.replaced, true);
    strictEqual(r.agents.length, 1);
    strictEqual(r.agents[0].role, "New");
  });

  it("removes by name, case-insensitively", () => {
    // Arrange
    const agents = [AGENT];

    // Act
    const r = removeAgent(agents, "REVIEWER");

    // Assert
    strictEqual(r.removed, true);
    deepStrictEqual(r.agents, []);
  });

  it("reports nothing removed rather than silently succeeding", () => {
    // Arrange
    const agents = [AGENT];

    // Act
    const r = removeAgent(agents, "ghost");

    // Assert
    strictEqual(r.removed, false);
  });
});

describe("describeAgentRows", () => {
  it("lists the crews first, marked read-only", () => {
    // Arrange
    const crews = ["main-loop", "code-review"];

    // Act
    const rows = describeAgentRows(crews, []);

    // Assert
    deepStrictEqual(rows.map((r) => r.name), ["code-review", "main-loop"]);
    assertEveryDetailMentions(rows, "read-only");
  });

  it("flags a saved agent shadowed by a crew of the same name", () => {
    // The crew wins at dispatch, so the definition would sit there doing nothing.
    // Arrange
    const saved = [{ ...AGENT, name: "advisor" }];

    // Act
    const rows = describeAgentRows(["advisor"], saved);

    // Assert
    const row = rows.find((r) => r.kind === "saved agent")!;
    ok(row.detail.includes("shadowed"), row.detail);
  });

  it("shows role, goal and tools for an unshadowed agent", () => {
    // Arrange
    const saved = [{ ...AGENT, tools: ["file_read"] }];

    // Act
    const rows = describeAgentRows([], saved);

    // Assert
    assertMentions(rows[0].detail, ["Review things", "file_read"]);
  });
});
