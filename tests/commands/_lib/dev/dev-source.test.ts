// /dev-spec and its alias /dev-change: their arguments (commands/_lib/dev/dev-source.ts) - a spec without a kind, a
// change brief with one, /dev-change's own shape kept when typed so - and that the step runs in the crew its parse
// names - the fork of the conversation the harness's skills asked for (runsIn: fork) - never in main-loop.
// Run:  node --test tests/commands/_lib/dev/dev-source.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";
import { readFileSync } from "node:fs";

import { DEV_SPEC_USAGE, parseDevSpecArgs } from "../../../../src/commands/_lib/dev/dev-source.ts";
import {
  ALIAS_READ_CASES,
  CHANGE_READ_CASES,
  CHANGE_REFUSED_CASES,
  SPEC_READ_CASES,
  SPEC_REFUSED_CASES,
  tokens,
} from "./dev-source.fixtures.ts";
import { assertLaunchesParsedCrew } from "./dev-source.assertions.ts";

describe("parseDevSpecArgs — a spec", () => {
  for (const c of SPEC_READ_CASES) {
    it(`reads the code and the brief as typed for the dev-spec crew: ${c.name}`, () => {
      // Arrange
      const typed = tokens(c.line);

      // Act
      const parsed = parseDevSpecArgs(typed);

      // Assert
      deepStrictEqual(parsed, { ok: true, crew: "dev-spec", args: c.args });
    });
  }

  it("refuses no code with the usage", () => {
    // Arrange
    const typed: string[] = [];

    // Act
    const parsed = parseDevSpecArgs(typed);

    // Assert
    deepStrictEqual(parsed, { ok: false, text: DEV_SPEC_USAGE });
  });

  for (const c of SPEC_REFUSED_CASES) {
    it(`refuses ${c.name}`, () => {
      // Arrange
      const typed = tokens(c.line);

      // Act
      const parsed = parseDevSpecArgs(typed);

      // Assert
      ok(!parsed.ok && parsed.text.startsWith(c.start), JSON.stringify(parsed));
    });
  }
});

describe("parseDevSpecArgs — a change brief", () => {
  for (const c of CHANGE_READ_CASES) {
    it(`reads ${c.name} for the dev-change crew`, () => {
      // Arrange
      const typed = tokens(c.line);

      // Act
      const parsed = parseDevSpecArgs(typed);

      // Assert
      deepStrictEqual(parsed, { ok: true, crew: "dev-change", args: c.args });
    });
  }

  for (const c of CHANGE_REFUSED_CASES) {
    it(`refuses ${c.name}`, () => {
      // Arrange
      const typed = tokens(c.line);

      // Act
      const parsed = parseDevSpecArgs(typed);

      // Assert
      ok(!parsed.ok && parsed.text.startsWith(c.start), JSON.stringify(parsed));
    });
  }
});

describe("parseDevSpecArgs — typed as /dev-change", () => {
  for (const c of ALIAS_READ_CASES) {
    it(`reads ${c.name} for the dev-change crew`, () => {
      // Arrange
      const typed = tokens(c.line);

      // Act
      const parsed = parseDevSpecArgs(typed, "dev-change");

      // Assert
      deepStrictEqual(parsed, { ok: true, crew: "dev-change", args: c.args });
    });
  }
});

describe("runsIn: fork — the step launches its own crew", () => {
  it("/dev-spec starts the dev step and launches the crew its parse names, never main-loop", () => {
    // Arrange
    const path = new URL("../../../../src/commands/dev/dev-spec.cmd.ts", import.meta.url);

    // Act
    const src = readFileSync(path, "utf8");

    // Assert
    assertLaunchesParsedCrew(src);
  });
});
