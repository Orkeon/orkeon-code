// The project-init reads over FakeFiles. Run:
//   node --test tests/crews/project-init/application/detect.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  scanLayout, readConfigs, writeInstructionsFile, readExistingInstructions, readPackageMap,
} from "../../../../src/crews/project-init/application/detect.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeCodeIndex } from "../../../support/doubles/fake-code-index.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import {
  PACKAGE_MAP, checkoutWithConfigs, checkoutWithEntries, checkoutWithInstructions, checkoutWithLongClaude,
  checkoutWithWorkflow, indexWithPackages,
} from "./detect.fixtures.ts";
import { assertMentions } from "../../../support/assertions/text.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

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
    strictEqual(text.startsWith('<file path="package.json">\n{}\n</file>\n<file path="go.mod">\n'), true);
  });

  it("reads the CI workflows after the manifests, as a source of the commands", async () => {
    // Arrange
    const files = checkoutWithWorkflow();

    // Act
    const { blobs } = await readConfigs(files);

    // Assert
    deepStrictEqual(Object.keys(blobs), ["package.json", ".github/workflows/ci.yml"]);
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

  it("writes AGENTS.proposed.md, AGENTS.md left as it is, when an existing file was cut", async () => {
    // Arrange
    const files = new FakeFiles();
    const conventions = { frameworks: [], conventions: [] };
    const existing = [{ file: "AGENTS.md", content: "a", cut: 9 }];

    // Act
    const out = await writeInstructionsFile("# Project\n", conventions, files, existing);

    // Assert
    deepStrictEqual(files.writes.map((w) => w.path), [`${WORKSPACE}/AGENTS.proposed.md`]);
    assertMentions(out, [`✓ wrote ${WORKSPACE}/AGENTS.proposed.md`, "AGENTS.md left as it is, since AGENTS.md is longer than"]);
  });

  it("cuts an existing instruction file over the bound and counts the cut", async () => {
    // Arrange
    const files = checkoutWithLongClaude(25);

    // Act
    const [claude] = await readExistingInstructions(files);

    // Assert
    strictEqual(claude.cut, 25);
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

describe("readPackageMap", () => {
  it("renders the package map when the index holds a root", async () => {
    // Arrange
    const index = indexWithPackages();

    // Act
    const map = await readPackageMap({ index, log: new FakeLogger() });

    // Assert
    strictEqual(map, PACKAGE_MAP);
  });

  it("asks for no map and starts no indexing when the index holds no root", async () => {
    // Arrange
    const index = new FakeCodeIndex();

    // Act
    const map = await readPackageMap({ index, log: new FakeLogger() });

    // Assert
    strictEqual(map, "");
    deepStrictEqual(index.calls, ["rootCount"]);
  });

  it("goes without the map, and says so, when the index does not answer", async () => {
    // Arrange
    const index = indexWithPackages();
    index.graphFailure = new Error("no graph");
    const log = new FakeLogger();

    // Act
    const map = await readPackageMap({ index, log });

    // Assert
    strictEqual(map, "");
    deepStrictEqual(log.lines, ["warn: init: the code index did not answer (no graph); no package map"]);
  });
});
