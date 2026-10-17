// The project-init reads over FakeFiles. Run:
//   node_modules/.bin/tsx --test crews/project-init/application/detect.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { scanLayout, readConfigs, writeClaudeMd } from "./detect.ts";
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

  it("writes CLAUDE.md and summarises the run", async () => {
    const files = new FakeFiles();
    const out = await writeClaudeMd("# Project\n", { frameworks: [], conventions: [], buildCommand: "npm run build" }, files);
    deepStrictEqual(files.writes, [{ path: "/workspace/CLAUDE.md", content: "# Project\n" }]);
    strictEqual(out, "✓ wrote /workspace/CLAUDE.md (10 bytes; build='npm run build', test='?')");
  });
});
