// The rules every prompt keeps, checked on the whole catalogue as the model reads
// it (tests/support/fixtures/prompt-catalogue.ts): the main loop's header stays identical
// from turn to turn, digit-free and under its ceiling in every mode; no rendered
// prompt carries a marker of another product's material; instructions and material
// travel apart where a prompt is a pair; the budgets that must agree, agree.
// Run: node --test tests/repository/prompt-contract.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { SAMPLE_TODAY, renderCatalogue, renderHeaders, turnDeps } from "../support/fixtures/prompt-catalogue.ts";
import { buildTurnPrompt } from "../../src/crews/main-loop/application/turn-prompt.ts";
import { MAX_SKILL_FRAGMENT_CHARS, MAX_STATIC_HEADER_CHARS } from "../../src/crews/main-loop/domain/prompt-assembly.ts";
import { DEFAULT_BEHAVIOR_FLAGS } from "../../src/shared/domain/agent-policy/behavior-flags.ts";
import { PERMISSION_MODES } from "../../src/shared/domain/permission-modes.ts";
import {
  CHARS_PER_TOKEN, POST_COMPACT_PER_SKILL_TOKENS, TURN_FIXED_TOKENS,
} from "../../src/shared/domain/compaction-thresholds.ts";
import { MARKERS, MIN_SYSTEM_MESSAGES } from "./prompt-contract.fixtures.ts";
import {
  assertHeadersDigitFreeUnder, assertInstructionsApart, assertNoEmptySection, assertNoMarker,
} from "./prompt-contract.assertions.ts";

describe("the main loop's header, in every mode", () => {
  for (const mode of PERMISSION_MODES) {
    it(`is identical from one turn to the next, whatever the volatile state, in mode ${mode}`, async () => {
      // Arrange
      const first = await buildTurnPrompt("a request", mode, DEFAULT_BEHAVIOR_FLAGS, turnDeps());

      // Act
      const later = await buildTurnPrompt(
        "another request", mode, { ...DEFAULT_BEHAVIOR_FLAGS, proactive: true },
        turnDeps({ full: true, today: "2027-01-01" }),
      );

      // Assert
      strictEqual(later.system, first.system, `${mode}: the header moved with the session's state`);
    });
  }

  it("holds no digit but the playbook's scope identifiers, and stays under its ceiling", async () => {
    // Arrange
    const ceiling = MAX_STATIC_HEADER_CHARS;

    // Act
    const headers = await renderHeaders();

    // Assert
    assertHeadersDigitFreeUnder(headers, ceiling);
  });

  it("leaves the date, the history and the gauge to the user body", async () => {
    // Arrange
    const request = "Also reject duplicated flags.";

    // Act
    const turn = await buildTurnPrompt(request, "default", DEFAULT_BEHAVIOR_FLAGS, turnDeps({ full: true }));

    // Assert
    ok(!turn.system.includes(SAMPLE_TODAY) && turn.user.includes(`date: ${SAMPLE_TODAY}`));
    ok(!turn.system.includes("Token budget") && turn.user.includes("Token budget"));
    strictEqual(turn.user.split(request).length - 1, 1, "the request travels once");
  });
});

describe("every rendered prompt", () => {
  it("carries no marker of another product's material", async () => {
    // Arrange
    const markers = MARKERS;

    // Act
    const catalogue = await renderCatalogue();

    // Assert
    assertNoMarker(catalogue, markers);
  });

  it("keeps the material out of the instructions where a prompt is a pair", async () => {
    // Arrange
    const least = MIN_SYSTEM_MESSAGES;

    // Act
    const catalogue = await renderCatalogue();

    // Assert
    assertInstructionsApart(catalogue, least);
  });

  it("has a non-empty text in every section", async () => {
    // Arrange
    const render = renderCatalogue;

    // Act
    const catalogue = await render();

    // Assert
    assertNoEmptySection(catalogue);
  });
});

describe("the budgets that must agree", () => {
  it("a restored skill is capped like the skills block of a turn", () => {
    // Arrange
    const perSkill = POST_COMPACT_PER_SKILL_TOKENS;

    // Act
    const restoredChars = perSkill * CHARS_PER_TOKEN;

    // Assert
    strictEqual(restoredChars, MAX_SKILL_FRAGMENT_CHARS);
  });

  it("the header fits the fixed part a turn reserves before compaction", () => {
    // Arrange
    const ceiling = MAX_STATIC_HEADER_CHARS;

    // Act
    const headerTokens = ceiling / CHARS_PER_TOKEN;

    // Assert
    ok(headerTokens <= TURN_FIXED_TOKENS);
  });
});
