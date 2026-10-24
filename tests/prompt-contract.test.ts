// The rules every prompt keeps, checked on the whole catalogue as the model reads
// it (tests/support/prompt-catalogue.ts): the main loop's header stays identical
// from turn to turn, digit-free and under its ceiling in every mode; no rendered
// prompt carries a marker of another product's material; instructions and material
// travel apart where a prompt is a pair; the budgets that must agree, agree.
// Run: node --test tests/prompt-contract.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MATERIAL_MARK, SAMPLE_TODAY, renderCatalogue, renderHeaders, turnDeps } from "./support/prompt-catalogue.ts";
import { buildTurnPrompt } from "../src/crews/main-loop/application/turn-prompt.ts";
import { MAX_SKILL_FRAGMENT_CHARS, MAX_STATIC_HEADER_CHARS } from "../src/crews/main-loop/domain/prompt-assembly.ts";
import { DEFAULT_BEHAVIOR_FLAGS } from "../src/shared/domain/agent-policy/behavior-flags.ts";
import { PERMISSION_MODES } from "../src/shared/domain/permission-modes.ts";
import {
  CHARS_PER_TOKEN, POST_COMPACT_PER_SKILL_TOKENS, TURN_FIXED_TOKENS,
} from "../src/shared/domain/compaction-thresholds.ts";

const markerFile = JSON.parse(readFileSync(fileURLToPath(new URL("../scripts/provenance-markers.json", import.meta.url)), "utf8"));
/** The markers every scanned file avoids, then those only a rendered prompt must avoid (the host vocabulary of another harness). */
const MARKERS: RegExp[] = [...markerFile.markers, ...(markerFile.promptMarkers ?? [])]
  .map((m: { source: string; flags: string }) => new RegExp(m.source, m.flags));

/** The scope identifiers the search playbook must name (`dependency_graph`'s values). */
const IDENTIFIERS_WITH_DIGITS = /L[123]_(Package|Module|Symbol)/g;

describe("the main loop's header, in every mode", () => {
  it("is identical from one turn to the next, whatever the volatile state", async () => {
    for (const mode of PERMISSION_MODES) {
      const first = await buildTurnPrompt("a request", mode, DEFAULT_BEHAVIOR_FLAGS, turnDeps());
      const later = await buildTurnPrompt(
        "another request", mode, { ...DEFAULT_BEHAVIOR_FLAGS, proactive: true },
        turnDeps({ full: true, today: "2027-01-01" }),
      );
      strictEqual(later.system, first.system, `${mode}: the header moved with the session's state`);
    }
  });

  it("holds no digit but the playbook's scope identifiers, and stays under its ceiling", async () => {
    for (const { mode, system } of await renderHeaders()) {
      const prose = system.replace(IDENTIFIERS_WITH_DIGITS, "");
      ok(!/\d/.test(prose), `${mode}: a digit in the header (${prose.match(/.{20}\d.{10}/)?.[0]})`);
      ok(system.length <= MAX_STATIC_HEADER_CHARS, `${mode}: ${system.length} > ${MAX_STATIC_HEADER_CHARS}`);
    }
  });

  it("leaves the date, the history and the gauge to the user body", async () => {
    const turn = await buildTurnPrompt("Also reject duplicated flags.", "default", DEFAULT_BEHAVIOR_FLAGS, turnDeps({ full: true }));
    ok(!turn.system.includes(SAMPLE_TODAY) && turn.user.includes(`date: ${SAMPLE_TODAY}`));
    ok(!turn.system.includes("Token budget") && turn.user.includes("Token budget"));
    strictEqual(turn.user.split("Also reject duplicated flags.").length - 1, 1, "the request travels once");
  });
});

describe("every rendered prompt", () => {
  it("carries no marker of another product's material", async () => {
    for (const prompt of await renderCatalogue()) {
      for (const section of prompt.sections) {
        for (const marker of MARKERS) {
          ok(!marker.test(section.text), `${prompt.id} ${prompt.name}, ${section.title}: matches ${marker}`);
        }
      }
    }
  });

  it("keeps the material out of the instructions where a prompt is a pair", async () => {
    let pairs = 0;
    for (const prompt of await renderCatalogue()) {
      for (const section of prompt.sections.filter((s) => s.role === "system")) {
        ok(section.text.trim().length > 0, `${prompt.id} ${section.title} is empty`);
        ok(!section.text.includes(MATERIAL_MARK), `${prompt.id} ${section.title} holds the sample material`);
        pairs++;
      }
    }
    ok(pairs >= 10, `only ${pairs} system messages rendered`);
  });

  it("has a non-empty text in every section", async () => {
    for (const prompt of await renderCatalogue()) {
      for (const section of prompt.sections) ok(section.text.trim().length > 0, `${prompt.id} ${section.title}`);
    }
  });
});

describe("the budgets that must agree", () => {
  it("a restored skill is capped like the skills block of a turn", () => {
    strictEqual(POST_COMPACT_PER_SKILL_TOKENS * CHARS_PER_TOKEN, MAX_SKILL_FRAGMENT_CHARS);
  });

  it("the header fits the fixed part a turn reserves before compaction", () => {
    ok(MAX_STATIC_HEADER_CHARS / CHARS_PER_TOKEN <= TURN_FIXED_TOKENS);
  });
});
