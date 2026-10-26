// /analyze — harvest rendering tests, on the payload shapes captured live
// 2026-08-06 (see docs/b14-codeintel-probe-transcript.md). Run:
//   node --test src/crews/analyze/domain/harvest.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import {
  MAX_HARVEST_SYMBOLS, edgeEndpointToPath, groupByKind, renderHarvest,
  SYNTHESIS_SYSTEM, buildSynthesisUser,
} from "../../../../src/crews/analyze/domain/harvest.ts";
import { ENDPOINTS, MODULE_GRAPH, PACKAGES, SYMBOLS, manySymbols } from "./harvest.fixtures.ts";
import { assertMentions } from "../../../support/assertions/text.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("edgeEndpointToPath", () => {
  for (const c of ENDPOINTS) {
    it(c.name, () => {
      // Arrange
      const { endpoint } = c;

      // Act
      const path = edgeEndpointToPath(endpoint);

      // Assert
      strictEqual(path, c.path);
    });
  }
});

describe("groupByKind", () => {
  it("groups by kind, first-seen order, unknown kinds bucketed", () => {
    // Arrange
    const symbols = [...SYMBOLS, { fqn: "x::y", name: "y", kind: "" }];

    // Act
    const groups = groupByKind(symbols);

    // Assert
    strictEqual(groups[0]!.kind, "function");
    strictEqual(groups[0]!.entries.length, 2);
    strictEqual(groups[1]!.kind, "class");
    strictEqual(groups[2]!.kind, "unknown");
  });
});

describe("renderHarvest", () => {
  it("renders packages, module edges (as paths) and symbols by kind", () => {
    // Arrange
    const input = { packages: PACKAGES, moduleGraph: MODULE_GRAPH, symbols: SYMBOLS, symbolCount: 6 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    ok(harvest.includes(`\`${WORKSPACE}::workspace\` — 3 file(s), 6 symbol(s)`), harvest);
    ok(harvest.includes(`${WORKSPACE}/src/index.ts → ${WORKSPACE}/src/math.ts`), "edge endpoints must render as paths");
    ok(!harvest.includes("#module@"), "node IDs must not leak into the rendering");
    assertMentions(harvest, ["### function (2)", "### class (1)", `\`${WORKSPACE}/src/types.ts::Order\``]);
  });

  it("says the total even when the listing is capped", () => {
    // Arrange
    const many = manySymbols(MAX_HARVEST_SYMBOLS + 20);
    const input = { packages: [], moduleGraph: { ...MODULE_GRAPH, edges: [] }, symbols: many, symbolCount: many.length };

    // Act
    const capped = renderHarvest(input);

    // Assert
    ok(capped.includes(`${MAX_HARVEST_SYMBOLS + 20} total`), "the authoritative count survives the cap");
    ok(capped.includes("20 more symbol(s) omitted"), "a silent cut would read as the codebase ending there");
  });

  it("flags cycles — the one graph finding that is always a risk", () => {
    // Arrange
    const input = { packages: [], symbols: [], symbolCount: 0, moduleGraph: { ...MODULE_GRAPH, cycleCount: 2 } };

    // Act
    const cyclic = renderHarvest(input);

    // Assert
    ok(cyclic.includes("2 cycle(s) ⚠"), cyclic);
  });
});

describe("the synthesis prompts", () => {
  it("the system prompt forbids inventing symbols and demands FQN citations", () => {
    // Arrange
    const required = ["ONLY from the harvest", "FQN"];

    // Act
    const system = SYNTHESIS_SYSTEM;

    // Assert
    assertMentions(system, required);
  });

  it("the user body carries the ask THEN the harvest", () => {
    // Arrange
    const harvest = "# Codebase analysis harvest\nX";

    // Act
    const user = buildSynthesisUser(harvest);

    // Assert
    ok(user.includes("business/domain objects"));
    ok(user.indexOf("business/domain objects") < user.indexOf("# Codebase analysis harvest"));
    ok(user.endsWith("<harvest>\n# Codebase analysis harvest\nX\n</harvest>"), "the harvest is material");
  });

  it("asks to say what the harvest does not hold rather than fill it", () => {
    // Arrange
    const harvest = "X";

    // Act
    const user = buildSynthesisUser(harvest);

    // Assert
    ok(user.includes("not in the harvest"));
  });

  it("asks to mark inferences", () => {
    // Arrange
    const required = ["word an inference as one"];

    // Act
    const system = SYNTHESIS_SYSTEM;

    // Assert
    assertMentions(system, required);
  });
});
