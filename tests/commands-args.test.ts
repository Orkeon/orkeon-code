// Tests for command arg parsing. Lives in tests/ (outside the "*.cmd.ts" scan
// AND outside commands/ for belt-and-suspenders). Run:
//   node --test tests/commands-args.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  parseMemoryArgs, parseAssistantInput, rawText, rawTokens,
  parseToolCallArgs, commandLine, splitWords, isOption, optionValue, parseCompactArgs } from "../src/commands/_lib/args.ts";
import { MEMORY_CATEGORIES } from "../src/shared/domain/agent-policy/memory-categories.ts";

describe("parseMemoryArgs", () => {
  it("defaults to list with no category", () => {
    deepStrictEqual(parseMemoryArgs([]), { sub: "list", category: undefined });
  });
  it("list with a known category", () => {
    deepStrictEqual(parseMemoryArgs(["list", "project"]), { sub: "list", category: "project" });
  });
  it("list ignores an unknown category", () => {
    deepStrictEqual(parseMemoryArgs(["list", "frobnik"]), { sub: "list", category: undefined });
  });
  it("add with explicit category consumes it", () => {
    deepStrictEqual(parseMemoryArgs(["add", "feedback", "be", "concise"]), { sub: "add", category: "feedback", content: "be concise" });
  });
  it("add without a category defaults to user and keeps all content", () => {
    deepStrictEqual(parseMemoryArgs(["add", "remember", "this"]), { sub: "add", category: "user", content: "remember this" });
  });
  it("delete / get coerce the id to a number", () => {
    deepStrictEqual(parseMemoryArgs(["delete", "7"]), { sub: "delete", id: 7 });
    deepStrictEqual(parseMemoryArgs(["get", "3"]), { sub: "get", id: 3 });
  });
  it("exposes the canonical category list", () => {
    deepStrictEqual([...MEMORY_CATEGORIES], ["user", "project", "feedback", "reference"]);
  });
});

describe("parseAssistantInput", () => {
  it("returns a null mode when no prefix is given (session default applies)", () => {
    deepStrictEqual(parseAssistantInput("refactor X"), { permissionMode: null, prompt: "refactor X" });
  });
  it("extracts a leading permission mode", () => {
    deepStrictEqual(parseAssistantInput("plan: design the API"), { permissionMode: "plan", prompt: "design the API" });
  });
  it("an explicit default: prefix pins the mode (not null)", () => {
    deepStrictEqual(parseAssistantInput("default: refactor X"), { permissionMode: "default", prompt: "refactor X" });
  });
  it("only treats known modes as a prefix", () => {
    deepStrictEqual(parseAssistantInput("todo: not a mode"), { permissionMode: null, prompt: "todo: not a mode" });
  });
  it("handles multi-line prompts after the mode", () => {
    const { permissionMode, prompt } = parseAssistantInput("acceptEdits: line1\nline2");
    strictEqual(permissionMode, "acceptEdits");
    strictEqual(prompt, "line1\nline2");
  });
});

describe("rawText / rawTokens", () => {
  it("rawText joins + trims", () => {
    strictEqual(rawText({ raw: ["a", "b"] }), "a b");
    strictEqual(rawText({}), "");
  });
  it("rawTokens returns the array or []", () => {
    deepStrictEqual(rawTokens({ raw: ["x"] }), ["x"]);
    deepStrictEqual(rawTokens({}), []);
  });
});

// ── B-12: /debug-tool-call ────────────────────────────────────────────────

describe("parseToolCallArgs", () => {
  it("takes the tool name alone, with no arguments", () => {
    deepStrictEqual(parseToolCallArgs(["session_stats"]), { ok: true, tool: "session_stats", args: {} });
  });

  it("re-joins a JSON payload the REPL split on whitespace", () => {
    // `{"path": "/a"}` arrives as TWO tokens; taking tokens[1] would parse `{"path":`
    // and fail with a message that points nowhere.
    const r = parseToolCallArgs(["file_read", '{"path":', '"/workspace/README.md"}']);
    deepStrictEqual(r, { ok: true, tool: "file_read", args: { path: "/workspace/README.md" } });
  });

  it("refuses malformed JSON instead of coercing it", () => {
    // This command exists to reproduce a call faithfully; an empty object would
    // look like a successful no-arg invocation.
    const r = parseToolCallArgs(["file_read", "{path: /a}"]);
    strictEqual(r.ok, false);
    ok(!r.ok && r.reason.includes("not valid JSON"));
    ok(!r.ok && r.reason.includes("{path: /a}"));
  });

  it("refuses a JSON value that is not an object", () => {
    for (const [payload, word] of [["[1,2]", "array"], ['"a"', "string"], ["7", "number"]] as const) {
      const r = parseToolCallArgs(["file_read", payload]);
      strictEqual(r.ok, false, payload);
      ok(!r.ok && r.reason.includes(word), r.ok ? "" : r.reason);
    }
  });

  it("refuses a name that is not a tool name", () => {
    for (const bad of ["", "  ", "file-read", "/etc/passwd", "9tool"]) {
      strictEqual(parseToolCallArgs([bad]).ok, false, JSON.stringify(bad));
    }
  });

  it("gives the usage line when nothing was passed", () => {
    const r = parseToolCallArgs([]);
    ok(!r.ok && r.reason.includes("usage:"));
  });
});

describe("splitWords and commandLine", () => {
  const texts = (line: string) => splitWords(line).map((w) => w.text);

  it("splits on blanks, keeps a quoted argument whole, and leaves a quote inside a word alone", () => {
    deepStrictEqual(texts(`daily.m4a --then "liste les tâches qu'il cite"`), ["daily.m4a", "--then", "liste les tâches qu'il cite"]);
    deepStrictEqual(texts(`'my note.m4a' --lang fr`), ["my note.m4a", "--lang", "fr"]);
    deepStrictEqual(texts(`--then l'API "rate"limit`), ["--then", "l'API", `"rate"limit`], "a quote closed inside a word closes nothing");
    deepStrictEqual(texts("   "), []);
  });

  it("reads a quote that is never closed as a letter", () => {
    deepStrictEqual(texts(`a "never closed`), ["a", `"never`, "closed"]);
    deepStrictEqual(texts(`the '90s --voice x`), ["the", "'90s", "--voice", "x"]);
  });

  it("says which words were quoted and where each ends, so the rest of a line can be kept as typed", () => {
    const line = `--then say "deadline" now`;
    const words = splitWords(line);
    deepStrictEqual(words.map((w) => [w.text, w.quoted]), [["--then", false], ["say", false], ["deadline", true], ["now", false]]);
    strictEqual(line.slice(words[0].end).trim(), `say "deadline" now`);
    deepStrictEqual([isOption(words[0]), isOption(splitWords(`"--stop"`)[0]), isOption(undefined)], [true, false, false]);
  });

  it("gives an option its value, unless it is missing, blank or another option", () => {
    const words = splitWords(`--lang fr --voice "" --max --x`);
    deepStrictEqual([0, 2, 4, 6].map((i) => optionValue(words, i)), ["fr", null, null, null]);
  });

  it("quotes again a token that holds a blank, so either way of splitting reads the same", () => {
    strictEqual(commandLine(["my note.m4a", "--lang", "fr"]), `"my note.m4a" --lang fr`);
    deepStrictEqual(texts(commandLine(["--then", "list the tasks"])), ["--then", "list the tasks"]);
    deepStrictEqual(texts(commandLine(["--then", `"list`, "the", `tasks"`])), ["--then", "list the tasks"]);
  });
});

describe("parseCompactArgs", () => {
  it("reads --snip with how many exchanges to keep, 3 by default", () => {
    deepStrictEqual(parseCompactArgs(["--snip", "5"]), { snip: 5 });
    deepStrictEqual(parseCompactArgs(["--snip"]), { snip: 3 });
    deepStrictEqual(parseCompactArgs(["--snip", "zero"]), { snip: 3 });
  });
  it("reads anything else as the summary's focus", () => {
    deepStrictEqual(parseCompactArgs(["keep", "the", "test", "names"]), { focus: "keep the test names" });
    deepStrictEqual(parseCompactArgs([]), { focus: "" });
  });
});
