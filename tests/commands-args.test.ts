// Tests for command arg parsing. Lives in tests/ (outside the "*.cmd.ts" scan
// AND outside commands/ for belt-and-suspenders). Run:
//   node --test tests/commands-args.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  parseMemoryArgs, parseAssistantInput, rawText, rawTokens,
  parseToolCallArgs, commandLine, splitWords, isOption, optionValue, parseCompactArgs } from "../src/commands/_lib/args.ts";
import { MEMORY_CATEGORIES } from "../src/shared/domain/agent-policy/memory-categories.ts";
import {
  ASSISTANT_INPUT_CASES,
  BAD_TOOL_NAMES,
  COMPACT_CASES,
  IS_OPTION_CASES,
  MEMORY_ARGS_CASES,
  NOT_OBJECT_PAYLOADS,
  OPTIONS_LINE,
  OPTION_VALUE_CASES,
  QUOTED_LINE,
  RAW_TEXT_CASES,
  RAW_TOKENS_CASES,
  ROUND_TRIP_CASES,
  SPLIT_CASES,
} from "./commands-args.fixtures.ts";
import { assertRefused } from "./commands-args.assertions.ts";
import { WORKSPACE } from "../src/shared/domain/vfs.ts";

describe("parseMemoryArgs", () => {
  for (const c of MEMORY_ARGS_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens, expected } = c;

      // Act
      const parsed = parseMemoryArgs(tokens);

      // Assert
      deepStrictEqual(parsed, expected);
    });
  }

  it("exposes the canonical category list", () => {
    // Arrange
    const expected = ["user", "project", "feedback", "reference"];

    // Act
    const categories = [...MEMORY_CATEGORIES];

    // Assert
    deepStrictEqual(categories, expected);
  });
});

describe("parseAssistantInput", () => {
  for (const c of ASSISTANT_INPUT_CASES) {
    it(c.name, () => {
      // Arrange
      const { input, expected } = c;

      // Act
      const parsed = parseAssistantInput(input);

      // Assert
      deepStrictEqual(parsed, expected);
    });
  }
});

describe("rawText / rawTokens", () => {
  for (const c of RAW_TEXT_CASES) {
    it(c.name, () => {
      // Arrange
      const { args, expected } = c;

      // Act
      const text = rawText(args);

      // Assert
      strictEqual(text, expected);
    });
  }

  for (const c of RAW_TOKENS_CASES) {
    it(c.name, () => {
      // Arrange
      const { args, expected } = c;

      // Act
      const tokens = rawTokens(args);

      // Assert
      deepStrictEqual(tokens, expected);
    });
  }
});

// ── B-12: /debug-tool-call ────────────────────────────────────────────────

describe("parseToolCallArgs", () => {
  it("takes the tool name alone, with no arguments", () => {
    // Arrange
    const tokens = ["session_stats"];

    // Act
    const parsed = parseToolCallArgs(tokens);

    // Assert
    deepStrictEqual(parsed, { ok: true, tool: "session_stats", args: {} });
  });

  it("re-joins a JSON payload the REPL split on whitespace", () => {
    // Arrange
    // `{"path": "/a"}` arrives as TWO tokens; taking tokens[1] would parse `{"path":`
    // and fail with a message that points nowhere.
    const tokens = ["file_read", '{"path":', `"${WORKSPACE}/README.md"}`];

    // Act
    const parsed = parseToolCallArgs(tokens);

    // Assert
    deepStrictEqual(parsed, { ok: true, tool: "file_read", args: { path: `${WORKSPACE}/README.md` } });
  });

  it("refuses malformed JSON instead of coercing it", () => {
    // Arrange
    // This command exists to reproduce a call faithfully; an empty object would
    // look like a successful no-arg invocation.
    const tokens = ["file_read", "{path: /a}"];

    // Act
    const parsed = parseToolCallArgs(tokens);

    // Assert
    assertRefused(parsed, ["not valid JSON", "{path: /a}"]);
  });

  for (const { payload, word } of NOT_OBJECT_PAYLOADS) {
    it(`refuses a JSON value that is not an object: ${payload}`, () => {
      // Arrange
      const tokens = ["file_read", payload];

      // Act
      const parsed = parseToolCallArgs(tokens);

      // Assert
      assertRefused(parsed, [word], payload);
    });
  }

  for (const bad of BAD_TOOL_NAMES) {
    it(`refuses a name that is not a tool name: ${JSON.stringify(bad)}`, () => {
      // Arrange
      const tokens = [bad];

      // Act
      const parsed = parseToolCallArgs(tokens);

      // Assert
      assertRefused(parsed, [], JSON.stringify(bad));
    });
  }

  it("gives the usage line when nothing was passed", () => {
    // Arrange
    const tokens: string[] = [];

    // Act
    const parsed = parseToolCallArgs(tokens);

    // Assert
    assertRefused(parsed, ["usage:"]);
  });
});

describe("splitWords and commandLine", () => {
  for (const c of SPLIT_CASES) {
    it(c.name, () => {
      // Arrange
      const { line, words } = c;

      // Act
      const texts = splitWords(line).map((w) => w.text);

      // Assert
      deepStrictEqual(texts, words);
    });
  }

  it("says which words were quoted", () => {
    // Arrange
    const line = QUOTED_LINE;

    // Act
    const words = splitWords(line);

    // Assert
    deepStrictEqual(words.map((w) => [w.text, w.quoted]), [["--then", false], ["say", false], ["deadline", true], ["now", false]]);
  });

  it("says where each word ends, so the rest of a line can be kept as typed", () => {
    // Arrange
    const line = QUOTED_LINE;

    // Act
    const words = splitWords(line);

    // Assert
    strictEqual(line.slice(words[0].end).trim(), `say "deadline" now`);
  });

  for (const c of IS_OPTION_CASES) {
    it(c.name, () => {
      // Arrange
      const word = c.line === null ? undefined : splitWords(c.line)[0];

      // Act
      const option = isOption(word);

      // Assert
      strictEqual(option, c.expected);
    });
  }

  for (const c of OPTION_VALUE_CASES) {
    it(c.name, () => {
      // Arrange
      const words = splitWords(OPTIONS_LINE);

      // Act
      const value = optionValue(words, c.at);

      // Assert
      strictEqual(value, c.value);
    });
  }

  it("quotes again a token that holds a blank", () => {
    // Arrange
    const tokens = ["my note.m4a", "--lang", "fr"];

    // Act
    const line = commandLine(tokens);

    // Assert
    strictEqual(line, `"my note.m4a" --lang fr`);
  });

  for (const c of ROUND_TRIP_CASES) {
    it(`quotes ${c.name} so that splitting the line again reads the same`, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const line = commandLine(tokens);

      // Assert
      deepStrictEqual(splitWords(line).map((w) => w.text), ["--then", "list the tasks"]);
    });
  }
});

describe("parseCompactArgs", () => {
  for (const c of COMPACT_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens, expected } = c;

      // Act
      const parsed = parseCompactArgs(tokens);

      // Assert
      deepStrictEqual(parsed, expected);
    });
  }
});
