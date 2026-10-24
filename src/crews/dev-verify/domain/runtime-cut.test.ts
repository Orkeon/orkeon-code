import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runtimeCut } from "./runtime-cut.ts";

const NOTICE = "\n\n[... truncated, 1234 chars omitted. Use more specific parameters to narrow results.]";

describe("runtimeCut", () => {
  it("strips the notice of a cut result and reads how many characters were omitted", () => {
    assert.deepEqual(runtimeCut(`src/a.ts\nsrc/b${NOTICE}`), { kept: "src/a.ts\nsrc/b", omitted: 1234 });
  });

  it("keeps a result without the notice whole", () => {
    assert.deepEqual(runtimeCut("src/a.ts\nsrc/b.ts\n"), { kept: "src/a.ts\nsrc/b.ts\n", omitted: 0 });
    assert.deepEqual(runtimeCut(""), { kept: "", omitted: 0 });
  });

  it("does not take a notice in the middle of the text for a cut", () => {
    const text = `src/a.ts${NOTICE}\nsrc/b.ts\n`;
    assert.deepEqual(runtimeCut(text), { kept: text, omitted: 0 });
  });

  it("does not take a notice of 0 omitted characters for a cut", () => {
    const text = "src/a.ts\n\n[... truncated, 0 chars omitted. Use more specific parameters to narrow results.]";
    assert.deepEqual(runtimeCut(text), { kept: text, omitted: 0 });
  });
});
