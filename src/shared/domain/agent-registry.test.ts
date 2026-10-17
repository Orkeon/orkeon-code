// B-12 — the saved-agent registry. Run:
//   node_modules/.bin/tsx --test shared/domain/agent-registry.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  validateSavedAgent, parseAgentRegistry, serializeAgentRegistry,
  upsertAgent, removeAgent, describeAgentRows,
} from "./agent-registry.ts";

const AGENT = { name: "reviewer", role: "Reviewer", goal: "Review things", tools: [] };

describe("validateSavedAgent", () => {
  it("accepts a complete definition, lowercasing the name", () => {
    const v = validateSavedAgent({ name: "Reviewer", role: "R", goal: "G" });
    ok(v.ok);
    strictEqual(v.ok && v.agent.name, "reviewer");
  });

  it("refuses a name that is not a slug — it is the file's key", () => {
    for (const bad of ["", "9lives", "has space", "UPPER_SNAKE", "-lead"]) {
      strictEqual(validateSavedAgent({ name: bad, role: "R", goal: "G" }).ok, false, bad);
    }
  });

  it("requires role and goal, and says which is missing", () => {
    // No useful "fall back to a default" reading exists for either: a saved agent
    // without them is not a definition a human could later understand.
    const noRole = validateSavedAgent({ name: "a", role: " ", goal: "G" });
    strictEqual(noRole.ok, false);
    ok(!noRole.ok && noRole.reason.includes("role"));
    const noGoal = validateSavedAgent({ name: "a", role: "R", goal: "" });
    ok(!noGoal.ok && noGoal.reason.includes("goal"));
  });

  it("normalises tools: strings, trimmed, blanks and duplicates out", () => {
    const v = validateSavedAgent({ name: "a", role: "R", goal: "G", tools: [" file_read ", "", "file_read", 7] });
    deepStrictEqual(v.ok && v.agent.tools, ["file_read", "7"]);
  });

  it("treats a non-array tools field as none rather than throwing", () => {
    deepStrictEqual(validateSavedAgent({ name: "a", role: "R", goal: "G", tools: "file_read" }).ok && [], []);
  });
});

describe("parseAgentRegistry", () => {
  it("reads the stored map, sorted by name", () => {
    const { agents, dropped } = parseAgentRegistry({
      zeta: { role: "Z", goal: "z" },
      alpha: { role: "A", goal: "a" },
    });
    deepStrictEqual(agents.map((a) => a.name), ["alpha", "zeta"]);
    deepStrictEqual(dropped, []);
  });

  it("drops invalid entries and NAMES them", () => {
    // The file is hand-editable: refusing to list ten good agents because an
    // eleventh lost its goal would make a typo cost the whole registry. Silence
    // is the part that would not be acceptable.
    const { agents, dropped } = parseAgentRegistry({
      good: { role: "R", goal: "G" },
      broken: { role: "R" },
      alsoBroken: "not an object",
    });
    deepStrictEqual(agents.map((a) => a.name), ["good"]);
    deepStrictEqual(dropped.sort(), ["alsoBroken", "broken"]);
  });

  it("returns nothing for a non-object payload", () => {
    for (const junk of [null, undefined, [], "x", 3]) {
      deepStrictEqual(parseAgentRegistry(junk).agents, [], String(junk));
    }
  });

  it("round-trips through serialize", () => {
    const stored = serializeAgentRegistry([AGENT]);
    deepStrictEqual(parseAgentRegistry(stored).agents, [AGENT]);
  });

  it("serialises the name as the key, not as a field", () => {
    deepStrictEqual(Object.keys(serializeAgentRegistry([AGENT])), ["reviewer"]);
    ok(!("name" in (serializeAgentRegistry([AGENT]).reviewer as any)));
  });
});

describe("upsertAgent / removeAgent", () => {
  it("adds when absent", () => {
    const r = upsertAgent([], AGENT);
    strictEqual(r.replaced, false);
    strictEqual(r.agents.length, 1);
  });

  it("replaces when present, without duplicating", () => {
    const r = upsertAgent([AGENT], { ...AGENT, role: "New" });
    strictEqual(r.replaced, true);
    strictEqual(r.agents.length, 1);
    strictEqual(r.agents[0].role, "New");
  });

  it("removes by name, case-insensitively", () => {
    const r = removeAgent([AGENT], "REVIEWER");
    strictEqual(r.removed, true);
    deepStrictEqual(r.agents, []);
  });

  it("reports nothing removed rather than silently succeeding", () => {
    strictEqual(removeAgent([AGENT], "ghost").removed, false);
  });
});

describe("describeAgentRows", () => {
  it("lists the crews first, marked read-only", () => {
    const rows = describeAgentRows(["main-loop", "code-review"], []);
    deepStrictEqual(rows.map((r) => r.name), ["code-review", "main-loop"]);
    for (const r of rows) ok(r.detail.includes("read-only"), r.detail);
  });

  it("flags a saved agent shadowed by a crew of the same name", () => {
    // The crew wins at dispatch, so the definition would sit there doing nothing.
    const rows = describeAgentRows(["advisor"], [{ ...AGENT, name: "advisor" }]);
    const saved = rows.find((r) => r.kind === "saved agent")!;
    ok(saved.detail.includes("shadowed"), saved.detail);
  });

  it("shows role, goal and tools for an unshadowed agent", () => {
    const rows = describeAgentRows([], [{ ...AGENT, tools: ["file_read"] }]);
    ok(rows[0].detail.includes("Review things"));
    ok(rows[0].detail.includes("file_read"));
  });
});
