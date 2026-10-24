// The start block the runtime puts before a session's first free-text turn. Run:
//   node --test src/shared/domain/session-start.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { MAX_START_LINES, MAX_START_LINE_CHARS, readStartOutput, splitStartOutput } from "./session-start.ts";

const block = (stdout: string, source = "echo hi") =>
  `[Session start script: /tmp/orkeon-code/session-start.sh]\n${stdout}\n[Script source]\n${source}\n[End of session start script]`;

describe("splitStartOutput", () => {
  it("takes the block off the head of the input and drops the script's source", () => {
    const out = splitStartOutput(`${block("line one\n\nline two")}\n\nhello there`);
    deepStrictEqual(out, { start: { script: "/tmp/orkeon-code/session-start.sh", lines: ["line one", "line two"] }, rest: "hello there" });
  });

  it("leaves an input with no block, or a block cut short, alone", () => {
    deepStrictEqual(splitStartOutput("hello"), { start: null, rest: "hello" });
    const cut = "[Session start script: /tmp/s.sh]\nline\nhello";
    deepStrictEqual(splitStartOutput(cut), { start: null, rest: cut });
    const noEnd = "[Session start script: /tmp/s.sh]\nline\n[Script source]\necho\nhello";
    deepStrictEqual(splitStartOutput(noEnd), { start: null, rest: noEnd });
    deepStrictEqual(splitStartOutput(`say ${block("x")}`).start, null);
  });

  it("bounds the lines and their length, saying how many were left out", () => {
    const many = Array.from({ length: MAX_START_LINES + 3 }, (_, i) => `l${i}`).join("\n");
    const lines = splitStartOutput(block(many)).start!.lines;
    strictEqual(lines.length, MAX_START_LINES + 1);
    strictEqual(lines.at(-1), "(3 more line(s) left out)");
    const long = splitStartOutput(block("x".repeat(MAX_START_LINE_CHARS + 50))).start!.lines[0];
    strictEqual(long.length, MAX_START_LINE_CHARS);
    strictEqual(long.endsWith("…"), true);
  });

  it("gives no start for a blank output", () => {
    deepStrictEqual(splitStartOutput(`${block("  \n ")}\nhi`), { start: null, rest: "hi" });
  });
});

describe("readStartOutput", () => {
  it("reads a script and its non-blank lines, else null", () => {
    deepStrictEqual(readStartOutput({ script: " /tmp/s.sh ", lines: ["a", 3, " ", "b"] }), { script: "/tmp/s.sh", lines: ["a", "b"] });
    for (const v of [null, "x", {}, { script: "", lines: ["a"] }, { script: "/s", lines: "a" }, { script: "/s", lines: [" "] }]) {
      strictEqual(readStartOutput(v), null);
    }
  });
});
