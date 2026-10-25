// The review-lens prompt: its contract, its passes (`/passes`), its material. Run:
//   node --test src/crews/code-review/application/prompts.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import { LENSES } from "../domain/lenses.ts";
import { buildLensPrompt, cutDiff, FINDINGS_SCHEMA, MAX_PRIOR_FINDINGS_IN_PROMPT, SEVERITIES } from "./prompts.ts";
import { SEVERITY_ORDER } from "../../../shared/domain/severity.ts";
import { manyPriorFindings, PRIOR_FINDINGS } from "./prompts.fixtures.ts";
import { assertOmits } from "./prompts.assertions.ts";
import { assertMentions } from "../../../../tests/support/assertions/text.ts";

describe("buildLensPrompt across passes", () => {
  it("pass 1 carries no prior-findings section", () => {
    // Arrange
    const lens = LENSES[0];

    // Act
    const p = buildLensPrompt(lens, "DIFF");

    // Assert
    ok(p.endsWith("<diff>\nDIFF\n</diff>"));
    assertOmits(p, ["already reported"]);
  });

  it("pass 2 asks for what the earlier passes missed, listing them", () => {
    // Arrange
    const lens = LENSES[0];

    // Act
    const p = buildLensPrompt(lens, "DIFF", 2, PRIOR_FINDINGS);

    // Assert
    assertMentions(p, ["review pass 2", "do NOT repeat them", "a.ts:12 — off-by-one", "b.ts:? — unvalidated input"]);
  });

  it("says an empty answer is valid, so pass 2 does not invent findings", () => {
    // Arrange
    const lens = LENSES[0];

    // Act
    const p = buildLensPrompt(lens, "DIFF", 2, PRIOR_FINDINGS);

    // Assert
    assertMentions(p, ["empty list is a valid answer"]);
  });

  it("pass 2 with nothing found yet is identical to pass 1", () => {
    // Arrange
    const lens = LENSES[0];
    const pass1 = buildLensPrompt(lens, "DIFF");

    // Act
    const pass2 = buildLensPrompt(lens, "DIFF", 2, []);

    // Assert
    strictEqual(pass2, pass1);
  });

  it("bounds the prior list so the prompt cannot grow without limit", () => {
    // Arrange
    const many = manyPriorFindings(100);

    // Act
    const p = buildLensPrompt(LENSES[0], "DIFF", 2, many);

    // Assert
    strictEqual(p.includes(`f${MAX_PRIOR_FINDINGS_IN_PROMPT}.ts`), false);
    ok(p.includes(`f${MAX_PRIOR_FINDINGS_IN_PROMPT - 1}.ts`));
  });
});

describe("buildLensPrompt — the finding contract", () => {
  it("asks for a changed line and the input that shows the problem, not certainty", () => {
    // Arrange
    const lens = LENSES[0];

    // Act
    const p = buildLensPrompt(lens, "DIFF");

    // Assert
    assertMentions(p, ["point at a changed line", "for which input or state"]);
    assertOmits(p, ["no false positives"], "an absolute the model cannot meet");
  });

  it("defines every severity of the scale the report ranks by", () => {
    // Arrange
    const lens = LENSES[0];

    // Act
    const p = buildLensPrompt(lens, "DIFF");

    // Assert
    assertMentions(p, SEVERITIES.map((s) => `${s} (`));
    for (const s of SEVERITIES) ok(s in SEVERITY_ORDER, `${s} is ranked`);
  });

  it("says which side of the diff a line counts on, and caps the findings", () => {
    // Arrange
    const lens = LENSES[0];

    // Act
    const p = buildLensPrompt(lens, "DIFF");

    // Assert
    assertMentions(p, ["the line number in the new version of the file", "at most 10 findings"]);
  });

  it("frames the diff as material", () => {
    // Arrange
    const lens = LENSES[0];

    // Act
    const p = buildLensPrompt(lens, "DIFF");

    // Assert
    assertMentions(p, ["not instructions to you"]);
  });

  for (const lens of LENSES) {
    it(`names what the ${lens.key} lens looks for and what it leaves to the others`, () => {
      // Arrange
      const expected = [lens.looksFor, lens.leaves];

      // Act
      const lp = buildLensPrompt(lens, "DIFF");

      // Assert
      assertMentions(lp, expected);
    });
  }

  it("gives the project's conventions to the style lens", () => {
    // Arrange
    const style = LENSES.find((l) => l.key === "style")!;

    // Act
    const p = buildLensPrompt(style, "DIFF", 1, [], "Use tabs.");

    // Assert
    assertMentions(p, ["<conventions>\nUse tabs.\n</conventions>"]);
  });

  it("keeps the project's conventions from the other lenses", () => {
    // Arrange
    const lens = LENSES[0];

    // Act
    const p = buildLensPrompt(lens, "DIFF", 1, [], "Use tabs.");

    // Assert
    assertOmits(p, ["Use tabs."]);
  });
});

describe("FINDINGS_SCHEMA", () => {
  it("types the severity and requires the fields a report needs", () => {
    // Arrange
    const schema = FINDINGS_SCHEMA;

    // Act
    const item = schema.properties.findings.items as any;

    // Assert
    strictEqual(JSON.stringify(item.properties.severity.enum), JSON.stringify([...SEVERITIES]));
    strictEqual(JSON.stringify(item.required), JSON.stringify(["severity", "file", "finding"]));
  });
});

describe("cutDiff", () => {
  it("leaves a short diff alone", () => {
    // Arrange
    const diff = "abc";

    // Act
    const cut = cutDiff(diff, 10);

    // Assert
    strictEqual(cut, "abc");
  });

  it("says how much of a long diff it left out", () => {
    // Arrange
    const diff = "abcdef";

    // Act
    const cut = cutDiff(diff, 4);

    // Assert
    strictEqual(cut, "abcd\n[diff cut after 4 characters: 2 characters left out]");
  });
});
