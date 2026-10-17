// Unit tests for the tool-result normaliser (snake AND Pascal casing). Run:
//   node_modules/.bin/tsx --test shared/infrastructure/orkeon/tool-results.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import { pick, shOut, shErr, shCode, fileContent, asArray, entryNames } from "./tool-results.ts";

describe("pick", () => {
  it("falls through to a Pascal-cased candidate", () => {
    deepStrictEqual(pick({ Messages: [1] }, "messages", "Messages"), [1]);
  });
  it("prefers earlier names, tolerates casing", () => {
    strictEqual(pick({ b: 2 }, "a", "b"), 2);
    strictEqual(pick({ A: 1, a: 9 }, "a", "A"), 9);
  });
  it("undefined object → undefined", () => {
    strictEqual(pick(undefined, "x"), undefined);
  });
});

describe("shell result accessors (snake + Pascal)", () => {
  it("shOut reads stdout or Stdout", () => {
    strictEqual(shOut({ stdout: "a" }), "a");
    strictEqual(shOut({ Stdout: "b" }), "b");
    strictEqual(shOut({}), "");
  });
  it("shErr reads stderr or Stderr", () => {
    strictEqual(shErr({ stderr: "e" }), "e");
    strictEqual(shErr({ Stderr: "E" }), "E");
  });
  it("shCode reads exit_code/exitCode/ExitCode, -1 default", () => {
    strictEqual(shCode({ exit_code: 0 }), 0);
    strictEqual(shCode({ exitCode: 2 }), 2);
    strictEqual(shCode({ ExitCode: 3 }), 3);
    strictEqual(shCode({}), -1);
  });
});

describe("fileContent", () => {
  it("reads content/Content/text", () => {
    strictEqual(fileContent({ content: "x" }), "x");
    strictEqual(fileContent({ Content: "y" }), "y");
    strictEqual(fileContent({ text: "z" }), "z");
    strictEqual(fileContent({ Text: "t" }), "t");
    strictEqual(fileContent({}), "");
  });

  it("reads a bare string result as the content", () => {
    strictEqual(fileContent("plain"), "plain");
  });
});

describe("asArray", () => {
  it("passes arrays, coerces else to []", () => {
    deepStrictEqual(asArray([1, 2]), [1, 2]);
    deepStrictEqual(asArray(null), []);
    deepStrictEqual(asArray({ a: 1 }), []);
  });
});

describe("entryNames", () => {
  it("reads the real Files + Directories shape", () => {
    deepStrictEqual(
      entryNames({ Files: [{ Name: "index.ts" }, { Name: "math.ts" }], Directories: [{ Name: "sub" }] }),
      ["index.ts", "math.ts", "sub"],
    );
  });
  it("tolerates the legacy entries/items shape + casing", () => {
    deepStrictEqual(entryNames({ entries: [{ name: "a" }, { Path: "b" }] }), ["a", "b"]);
    deepStrictEqual(entryNames({ Entries: ["c"] }), ["c"]);
  });
  it("returns [] for an empty listing", () => {
    deepStrictEqual(entryNames({}), []);
  });
});

// ── B-14: pinned against payloads captured from LIVE calls (2026-08-05) ───
//
// The shims above were written from the tool sources. These cases come from what
// the tools actually returned in this host, read with `/debug-tool-call <tool>
// {json}`. The distinction matters: a shim that reads a field the tool does not
// emit returns "" or 0 and the caller reports an empty success — the exact failure
// that made the first code-intel probe claim "indexed 0 files" on a working index.

describe("live-verified payload shapes", () => {
  it("file_read returns { content, file_info } — fileContent reads it", () => {
    const captured = {
      content: "# sample-repo\n\nThrowaway TypeScript fixture…\n",
      file_info: { size: 206 },
    };
    ok(fileContent(captured).startsWith("# sample-repo"));
    strictEqual(pick(captured, "file_info", "FileInfo").size, 206);
  });

  it("session_stats returns snake_case counters", () => {
    const captured = {
      message_count: 0, estimated_tokens: 0,
      total_cost_usd: 0, total_tokens: 0, total_calls: 0, by_model: {},
    };
    strictEqual(pick(captured, "total_calls", "totalCalls"), 0);
    strictEqual(pick(captured, "estimated_tokens", "estimatedTokens"), 0);
  });

  it("a shim asked for a field the tool does not emit returns the empty value", () => {
    // Pinned deliberately: this is the silent-failure shape. Nothing here can stop
    // it, so the lesson lives in the readers (see code-intel-contract.ts), which
    // are pinned against captured payloads instead of guessed names.
    strictEqual(fileContent({ body: "wrong field name" }), "");
    strictEqual(shOut({ output: "wrong field name" }), "");
  });
});
