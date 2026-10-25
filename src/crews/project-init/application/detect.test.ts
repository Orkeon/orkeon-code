// The project-init reads over FakeFiles. Run:
//   node --test src/crews/project-init/application/detect.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { scanLayout, readConfigs, writeInstructionsFile, readExistingInstructions } from "./detect.ts";
import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { checkoutWithConfigs, checkoutWithEntries, checkoutWithInstructions } from "./detect.fixtures.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

describe("project-init IO", () => {
  it(`scans at most 80 top-level entries of ${WORKSPACE}`, async () => {
    // Arrange
    const files = checkoutWithEntries(100);

    // Act
    const layout = await scanLayout(files);

    // Assert
    strictEqual(layout.length, 80);
  });

  it("reads the config files present, skips the absent ones, caps each at 4000 chars", async () => {
    // Arrange
    const files = checkoutWithConfigs();

    // Act
    const { blobs, text } = await readConfigs(files);

    // Assert
    deepStrictEqual(Object.keys(blobs), ["package.json", "go.mod"]);
    strictEqual(blobs["go.mod"].length, 4000);
    strictEqual(text.startsWith("--- package.json ---\n{}\n\n--- go.mod ---\n"), true);
  });

  it("writes AGENTS.md and summarises the run", async () => {
    // Arrange
    const files = new FakeFiles();
    const conventions = { frameworks: [], conventions: [], buildCommand: "npm run build" };

    // Act
    const out = await writeInstructionsFile("# Project\n", conventions, files);

    // Assert
    deepStrictEqual(files.writes, [{ path: `${WORKSPACE}/AGENTS.md`, content: "# Project\n" }]);
    strictEqual(out, `✓ wrote ${WORKSPACE}/AGENTS.md (10 bytes; build='npm run build', test='?')`);
  });

  it("reads the instruction files already there, in order, skipping the blank ones", async () => {
    // Arrange
    const files = checkoutWithInstructions();

    // Act
    const existing = await readExistingInstructions(files);

    // Assert
    deepStrictEqual(existing, [
      { file: "CLAUDE.md", content: "pnpm\n" },
      { file: ".cursorrules", content: "tabs\n" },
    ]);
  });
});
