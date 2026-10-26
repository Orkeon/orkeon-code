// PROPOSALS.md rendered from a ProposalsFile literal: the design's sample byte for
// byte, each outcome other than proposed, and the cell escaping. Run:
//   node --test src/crews/dev-learn/domain/proposals-render.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { escapeCell, renderProposals } from "../../../../src/crews/dev-learn/domain/proposals-render.ts";
import { CUT_CASES, FILE, SAMPLE, fileWithOtherOutcomes, fileWithRefinesMotif } from "./proposals-render.fixtures.ts";
import { assertMentions } from "../../../support/assertions/text.ts";

describe("renderProposals", () => {
  it("renders the design's sample exactly", () => {
    // Arrange
    const file = FILE;

    // Act
    const text = renderProposals(file);

    // Assert
    strictEqual(text, SAMPLE);
  });

  it("renders each outcome other than proposed as one line, and nothing to decide", () => {
    // Arrange
    const file = fileWithOtherOutcomes();

    // Act
    const text = renderProposals(file);

    // Assert
    assertMentions(text, [
      "## Reuse — 3 batches, 3 gaps\n\nNo motif kept.\n\nDropped: Dates — prevention: vague\n",
      "## Scope — 3 batches, 3 gaps\n\nUnchanged since learn-2026-10-20: not asked again.\n",
    ]);
    ok(text.endsWith("## Decide\n\nNothing to decide.\n"), text);
  });

  it("lists a refines motif's removed lines before the added ones, and every id to decide", () => {
    // Arrange
    const file = fileWithRefinesMotif();

    // Act
    const text = renderProposals(file);

    // Assert
    assertMentions(text, [
      "file: CONTRIBUTING.md\n- Old line.\n+ Every refusal",
      "/dev-learn --accept 3f2a9c1e,77b0d2aa\n/dev-learn --refuse 3f2a9c1e\n/dev-learn --refuse 77b0d2aa\n",
    ]);
  });
});

describe("escapeCell", () => {
  it("turns pipes into slashes and line breaks into a middle dot", () => {
    // Arrange
    const text = "open|done\nnext\r\nlast";

    // Act
    const cell = escapeCell(text, 80);

    // Assert
    strictEqual(cell, "open/done · next · last");
  });

  for (const c of CUT_CASES) {
    it(c.name, () => {
      // Arrange
      const { text, max } = c;

      // Act
      const cell = escapeCell(text, max);

      // Assert
      strictEqual(cell, c.escaped);
    });
  }

  it("cuts at max characters, counting a character outside ASCII as one", () => {
    // Arrange
    const text = "é".repeat(90);

    // Act
    const cell = escapeCell(text, 80);

    // Assert
    strictEqual(Array.from(cell).length, 80);
  });
});
