// The project-init reads over FakeFiles. Run:
//   node --test src/crews/project-init/application/detect.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { scanLayout, readConfigs, writeInstructionsFile, readExistingInstructions } from "./detect.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";

describe("project-init IO", () => {
  it("scans at most 80 top-level entries of /workspace", async () => {
    const files = new FakeFiles();
    files.listings.set("/workspace", Array.from({ length: 100 }, (_, i) => `f${i}`));
    strictEqual((await scanLayout(files)).length, 80);
  });

  it("reads the config files present, skips the absent ones, caps each at 4000 chars", async () => {
    const files = new FakeFiles();
    files.files.set("/workspace/package.json", "{}");
    files.files.set("/workspace/go.mod", "m".repeat(5000));
    const { blobs, text } = await readConfigs(files);
    deepStrictEqual(Object.keys(blobs), ["package.json", "go.mod"]);
    strictEqual(blobs["go.mod"].length, 4000);
    strictEqual(text.startsWith("--- package.json ---\n{}\n\n--- go.mod ---\n"), true);
  });

  it("writes AGENTS.md and summarises the run", async () => {
    const files = new FakeFiles();
    const out = await writeInstructionsFile("# Project\n", { frameworks: [], conventions: [], buildCommand: "npm run build" }, files);
    deepStrictEqual(files.writes, [{ path: "/workspace/AGENTS.md", content: "# Project\n" }]);
    strictEqual(out, "✓ wrote /workspace/AGENTS.md (10 bytes; build='npm run build', test='?')");
  });

  it("reads the instruction files already there, in order, skipping the blank ones", async () => {
    const files = new FakeFiles();
    files.files.set("/workspace/.cursorrules", "tabs\n");
    files.files.set("/workspace/CLAUDE.md", "pnpm\n");
    files.files.set("/workspace/AGENTS.md", "  \n");
    deepStrictEqual(await readExistingInstructions(files), [
      { file: "CLAUDE.md", content: "pnpm\n" },
      { file: ".cursorrules", content: "tabs\n" },
    ]);
  });
});
