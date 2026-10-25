// /dev-spec and /dev-change: their arguments (commands/_lib/dev-source.ts), and that each step runs in a crew of its
// own - the fork of the conversation the harness's skills asked for (runsIn: fork) - never in main-loop.
// Run:  node --test src/commands/_lib/dev-source.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";
import { readFileSync } from "node:fs";

import { DEV_CHANGE_USAGE, DEV_SPEC_USAGE, parseDevChangeArgs, parseDevSpecArgs } from "./dev-source.ts";
import {
  CHANGE_READ_CASES,
  CHANGE_REFUSED_CASES,
  FORK_STEPS,
  SPEC_READ_CASES,
  SPEC_REFUSED_CASES,
  tokens,
} from "./dev-source.fixtures.ts";
import { assertLaunchesOwnCrew } from "./dev-source.assertions.ts";

describe("parseDevSpecArgs", () => {
  for (const c of SPEC_READ_CASES) {
    it(`reads the code and the brief as typed: ${c.name}`, () => {
      // Arrange
      const typed = tokens(c.line);

      // Act
      const parsed = parseDevSpecArgs(typed);

      // Assert
      deepStrictEqual(parsed, { ok: true, args: c.args });
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

describe("parseDevChangeArgs", () => {
  for (const c of CHANGE_READ_CASES) {
    it(`reads ${c.name}`, () => {
      // Arrange
      const typed = tokens(c.line);

      // Act
      const parsed = parseDevChangeArgs(typed);

      // Assert
      deepStrictEqual(parsed, { ok: true, args: c.args });
    });
  }

  for (const c of CHANGE_REFUSED_CASES) {
    it(`refuses ${c.name}`, () => {
      // Arrange
      const typed = tokens(c.line);

      // Act
      const parsed = parseDevChangeArgs(typed);

      // Assert
      ok(!parsed.ok && parsed.text.startsWith(c.start), JSON.stringify(parsed));
    });
  }

  it("refuses no code with the usage", () => {
    // Arrange
    const typed: string[] = [];

    // Act
    const parsed = parseDevChangeArgs(typed);

    // Assert
    deepStrictEqual(parsed, { ok: false, text: DEV_CHANGE_USAGE });
  });
});

describe("runsIn: fork — each step launches its own crew", () => {
  for (const step of FORK_STEPS) {
    it(`/${step} starts the dev step and launches the ${step} crew, never main-loop`, () => {
      // Arrange
      const path = new URL(`../dev/${step}.cmd.ts`, import.meta.url);

      // Act
      const src = readFileSync(path, "utf8");

      // Assert
      assertLaunchesOwnCrew(src, step);
    });
  }
});
