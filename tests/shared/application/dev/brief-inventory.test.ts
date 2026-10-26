// briefInventory over FakeCodeIndex: the index built when empty, each phrase searched, hits located and kept once,
// the work folder and .claude/ left out, a failing index a warning. Run:
//   node --test src/shared/application/dev/brief-inventory.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { briefInventory, briefPhrases, renderBriefInventory } from "../../../../src/shared/application/dev/brief-inventory.ts";
import { FAILING_REQUEST, failingIndex, PRUNE_REQUEST, pruneIndex, SEVEN_SENTENCES } from "./brief-inventory.fixtures.ts";

describe("briefPhrases", () => {
  it("takes the code's words, then distinct lines and sentences", () => {
    // Arrange
    const text = "Remove old entries. Keep feedback!\n# Remove old entries.";

    // Act
    const phrases = briefPhrases("memory-prune", text);

    // Assert
    deepStrictEqual(phrases, ["memory prune", "Remove old entries.", "Keep feedback!"]);
  });

  it("takes at most six phrases", () => {
    // Arrange
    const text = SEVEN_SENTENCES;

    // Act
    const phrases = briefPhrases("x", text);

    // Assert
    strictEqual(phrases.length, 6);
  });
});

describe("briefInventory", () => {
  it("locates each hit once and leaves out the excluded folders", async () => {
    // Arrange
    const index = pruneIndex();

    // Act
    const inv = await briefInventory(index, PRUNE_REQUEST);

    // Assert
    deepStrictEqual(inv.entries, [{ path: "src/memory.ts", line: 12, name: "prune" }]);
    deepStrictEqual(inv.warnings, []);
  });

  it("returns a warning and no entry when the index fails", async () => {
    // Arrange
    const index = failingIndex();

    // Act
    const inv = await briefInventory(index, FAILING_REQUEST);

    // Assert
    deepStrictEqual(inv.entries, []);
    ok(inv.warnings[0].startsWith("the code index is not available (no index)"), inv.warnings[0]);
  });
});

describe("renderBriefInventory", () => {
  it("renders each entry located as its path, line and name", async () => {
    // Arrange
    const inv = await briefInventory(pruneIndex(), PRUNE_REQUEST);

    // Act
    const text = renderBriefInventory(inv);

    // Assert
    strictEqual(text, "- src/memory.ts:12 — prune");
  });

  it("says the index found nothing when the index fails", async () => {
    // Arrange
    const inv = await briefInventory(failingIndex(), FAILING_REQUEST);

    // Act
    const text = renderBriefInventory(inv);

    // Assert
    strictEqual(text, "(the index found nothing for this request)");
  });
});
