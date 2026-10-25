import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { carriedBlocks } from "./carried-text.ts";

describe("carriedBlocks", () => {
  it("frames each text under its title, trailing blank lines dropped", () => {
    const blocks = carriedBlocks([{ title: "workbench/x/X-PLAN-F2.md", text: "# F2\n\nbody\n\n" }, { title: "what F1 changed", text: "diff --git a b" }], 10_000);
    deepStrictEqual(blocks, [
      "### workbench/x/X-PLAN-F2.md\n```text\n# F2\n\nbody\n```",
      "### what F1 changed\n```text\ndiff --git a b\n```",
    ]);
  });

  it("cuts the text past the room, says how much is missing, and names the texts left out", () => {
    const long = "x".repeat(5_000);
    const blocks = carriedBlocks([{ title: "a", text: "short" }, { title: "b", text: long }, { title: "c", text: "after" }], 1_000);
    strictEqual(blocks.length, 3);
    ok(blocks[0].includes("short"));
    ok(blocks[1].endsWith("more characters)\n```"), blocks[1].slice(-60));
    ok(blocks.join("\n").length <= 1_000 + 60);
    strictEqual(blocks[2], "Not carried (no room left): c.");
  });

  it("carries nothing into a room too small for one block", () => {
    deepStrictEqual(carriedBlocks([{ title: "a", text: "short" }], 100), ["Not carried (no room left): a."]);
    deepStrictEqual(carriedBlocks([], 100), []);
  });
});
