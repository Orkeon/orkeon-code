// Unit tests for the strip-chain. Run:
//   node_modules/.bin/tsx --test shared/domain/strip.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import {
  unwrapFences,
  stripThinking,
  stripPreamble,
  stripLeakedScratch,
  cleanLlmMarkdown,
} from "./strip.ts";

describe("unwrapFences", () => {
  it("strips a wrapping ```markdown fence", () => {
    strictEqual(unwrapFences("```markdown\n# Title\nbody\n```"), "# Title\nbody");
  });
  it("strips a bare ``` fence", () => {
    strictEqual(unwrapFences("```\nfeat: x\n```"), "feat: x");
  });
  it("is a no-op on unfenced text", () => {
    strictEqual(unwrapFences("feat(scope): subject"), "feat(scope): subject");
  });
  it("preserves inner fenced blocks (only outermost wrap removed)", () => {
    const inp = "```md\n# Doc\n```js\ncode\n```\n```";
    ok(unwrapFences(inp).includes("```js"));
  });
});

describe("stripThinking", () => {
  it("removes a <thinking> region", () => {
    strictEqual(stripThinking("<thinking>scratch</thinking># Real"), "# Real");
  });
  it("is case-insensitive and greedy to the last closer", () => {
    strictEqual(stripThinking("<Thinking>a</Thinking>X<thinking>b</thinking>Y"), "Y");
  });
  it("no closer → drops from opener to end", () => {
    strictEqual(stripThinking("keep<thinking>rest"), "keep");
  });
  it("no opener → no-op", () => {
    strictEqual(stripThinking("# Title"), "# Title");
  });
});

describe("stripPreamble", () => {
  it("drops prose before the first heading", () => {
    strictEqual(stripPreamble("Here you go:\n# Title\nbody"), "# Title\nbody");
  });
  it("is a no-op when already starting with #", () => {
    strictEqual(stripPreamble("# Title"), "# Title");
  });
  it("recovers a heading glued to scratch", () => {
    strictEqual(stripPreamble("Let me write it.# Title"), "# Title");
  });
});

describe("stripLeakedScratch", () => {
  it("salvages a draft-then-real duplicate H1 with scratch between", () => {
    const leak = "# Doc\nskeleton\nNow let me write the full version.\n# Doc\nreal body";
    strictEqual(stripLeakedScratch(leak), "# Doc\nreal body");
  });
  it("is idempotent on a clean single-H1 document", () => {
    const clean = "# Doc\nbody only";
    strictEqual(stripLeakedScratch(clean), clean);
  });
  it("does not fire without a scratch signal", () => {
    const twin = "# Doc\na\n# Doc\nb";
    strictEqual(stripLeakedScratch(twin), twin);
  });
});

describe("cleanLlmMarkdown (full chain)", () => {
  it("composes thinking + preamble + fence stripping", () => {
    const raw = "<thinking>plan</thinking>Sure!\n```markdown\n# Title\nbody\n```";
    strictEqual(cleanLlmMarkdown(raw), "# Title\nbody");
  });
  it("is idempotent", () => {
    const once = cleanLlmMarkdown("Preamble\n# T\nx");
    strictEqual(cleanLlmMarkdown(once), once);
  });
});
