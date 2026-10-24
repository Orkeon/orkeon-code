import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cut, firstLine, stdoutLines } from "./text.ts";

describe("text helpers", () => {
  it("firstLine keeps the first line, trimmed", () => {
    assert.equal(firstLine("  boom  \nsecond"), "boom");
    assert.equal(firstLine(""), "");
  });

  it("stdoutLines splits on newlines and drops the trailing empty line", () => {
    assert.deepEqual(stdoutLines("a\r\nb\n"), ["a", "b"]);
    assert.deepEqual(stdoutLines("a\nb"), ["a", "b"]);
    assert.deepEqual(stdoutLines(""), []);
    assert.deepEqual(stdoutLines("\n"), [""]);
  });

  it("cut keeps a short text and ends a long one with an ellipsis", () => {
    assert.equal(cut("abc", 3), "abc");
    assert.equal(cut("abcd", 3), "ab…");
  });
});
