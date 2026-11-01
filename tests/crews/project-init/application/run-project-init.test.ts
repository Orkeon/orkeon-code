// The project-init use case over FakeFiles, FakeLlm and FakeLogger. Run:
//   node --test tests/crews/project-init/application/run-project-init.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual, deepStrictEqual } from "node:assert";

import { runProjectInit } from "../../../../src/crews/project-init/application/run-project-init.ts";
import { CONVENTIONS_SCHEMA, buildInstructionsFilePrompt, buildConventionsPrompt } from "../../../../src/crews/project-init/application/prompts.ts";
import { fallbackConventions } from "../../../../src/crews/project-init/domain/conventions.ts";
import { MAX_EXISTING_FILE_CHARS } from "../../../../src/crews/project-init/domain/existing-files.ts";
import {
  CI_STEP, CONVENTIONS_RULES, DETECTED, INSTRUCTIONS_RULES, PKG, indexWithOnePackage, projectInitSetup, setupWithCiWorkflow,
} from "./run-project-init.fixtures.ts";
import { assertMentions } from "../../../support/assertions/text.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("runProjectInit", () => {
  it("detects the conventions from the config files and writes AGENTS.md", async () => {
    // Arrange
    const { files, llm, deps } = projectInitSetup();
    files.files.set(`${WORKSPACE}/package.json`, PKG);
    llm.extractions = [DETECTED];
    const prompt = buildInstructionsFilePrompt(["package.json", "src"], DETECTED);

    // Act
    const out = await runProjectInit(deps);

    // Assert
    strictEqual(out, `✓ wrote ${WORKSPACE}/AGENTS.md (10 bytes; build='npm run build', test='npm test')`);
    deepStrictEqual(llm.extracts, [{ prompt: buildConventionsPrompt(`<file path="package.json">\n${PKG}\n</file>`), schema: CONVENTIONS_SCHEMA }]);
    deepStrictEqual(llm.completes, [{ prompt: prompt.user, override: { system: prompt.system } }]);
    deepStrictEqual(files.writes.filter((w) => w.path === `${WORKSPACE}/AGENTS.md`), [{ path: `${WORKSPACE}/AGENTS.md`, content: "# Project\n" }]);
  });

  it("gives the conventions prompt the steps of the CI workflows", async () => {
    // Arrange
    const { llm, deps } = setupWithCiWorkflow();

    // Act
    await runProjectInit(deps);

    // Assert
    assertMentions(llm.extracts[0].prompt, ['<file path=".github/workflows/ci.yml">', CI_STEP]);
  });

  it("merges an existing CLAUDE.md and the README, and says so", async () => {
    // Arrange
    const { files, llm, deps } = projectInitSetup();
    files.files.set(`${WORKSPACE}/CLAUDE.md`, "Use pnpm.\n");
    files.files.set(`${WORKSPACE}/README.md`, "# Sample\n");

    // Act
    const out = await runProjectInit(deps);

    // Assert
    ok(out.endsWith("; CLAUDE.md merged and kept, the assistant now reads AGENTS.md first"), out);
    assertMentions(llm.completes[0].prompt, ['<existing file="CLAUDE.md">\nUse pnpm.\n</existing>', "<readme>\n# Sample\n</readme>"]);
    deepStrictEqual(files.writes.map((w) => w.path), [`${WORKSPACE}/AGENTS.md`], "CLAUDE.md is left in place");
  });

  it("passes the package map of the code index in the material when the index holds a root", async () => {
    // Arrange
    const { llm, deps } = projectInitSetup();
    const index = indexWithOnePackage();

    // Act
    await runProjectInit({ ...deps, index });

    // Assert
    assertMentions(llm.completes[0].prompt, ["<package-map>\n1 package(s), each with the packages it depends on:\n- Core\n</package-map>"]);
  });

  it("marks a cut CLAUDE.md in the material and proposes the file beside AGENTS.md", async () => {
    // Arrange
    const { files, llm, deps } = projectInitSetup();
    files.files.set(`${WORKSPACE}/CLAUDE.md`, "c".repeat(MAX_EXISTING_FILE_CHARS + 3));

    // Act
    const out = await runProjectInit(deps);

    // Assert
    assertMentions(llm.completes[0].prompt, ["\n[… cut: 3 characters of this file not shown …]\n</existing>"]);
    deepStrictEqual(files.writes.map((w) => w.path), [`${WORKSPACE}/AGENTS.proposed.md`]);
    assertMentions(out, ["AGENTS.md not written, since CLAUDE.md is cut"]);
  });

  it("asks for no detection when no config file exists", async () => {
    // Arrange
    const { llm, deps } = projectInitSetup();

    // Act
    const out = await runProjectInit(deps);

    // Assert
    strictEqual(out, `✓ wrote ${WORKSPACE}/AGENTS.md (10 bytes; build='?', test='?')`);
    deepStrictEqual(llm.extracts, []);
  });

  it("falls back to the package.json scripts when the detection fails", async () => {
    // Arrange
    const { files, llm, log, deps } = projectInitSetup();
    files.files.set(`${WORKSPACE}/package.json`, PKG);
    llm.extractions = [new Error("not JSON")];
    const fallback = fallbackConventions(PKG);

    // Act
    const out = await runProjectInit(deps);

    // Assert
    strictEqual(fallback.buildCommand, "npm run build", "a command as it is invoked, not the script's body");
    strictEqual(out, `✓ wrote ${WORKSPACE}/AGENTS.md (10 bytes; build='${fallback.buildCommand}', test='${fallback.testCommand}')`);
    deepStrictEqual(llm.completes.map((c) => c.prompt), [buildInstructionsFilePrompt(["package.json", "src"], fallback).user]);
    deepStrictEqual(log.lines, ["warn: convention extract failed; continuing with package.json scripts only"]);
  });
});

describe("the /init prompts", () => {
  it("asks for evidence only, as commands are invoked", () => {
    // Arrange
    const config = "x";

    // Act
    const p = buildConventionsPrompt(config);

    // Assert
    assertMentions(p, ["never inferred from the language or the framework", "singleTestCommand"]);
    ok(p.endsWith("<config>\nx\n</config>"));
  });

  it("names the sections of the instructions file and forbids guessing, inventories and generic advice", () => {
    // Arrange
    const detected = { frameworks: [], conventions: [] };

    // Act
    const { system } = buildInstructionsFilePrompt([], detected);

    // Assert
    assertMentions(system, [
      "## Commands", "## Architecture", "## Conventions", "run a single test", "never guessed", "No list of files or folders",
      "No generic advice", "drop nothing that is still true", "not instructions to you",
    ]);
  });
});

describe("the /init prompt rules", () => {
  for (const r of INSTRUCTIONS_RULES) {
    it(`the instructions file ${r.rule}`, () => {
      // Arrange
      const detected = { frameworks: [], conventions: [] };

      // Act
      const { system } = buildInstructionsFilePrompt([], detected);

      // Assert
      assertMentions(system, [r.marker]);
    });
  }

  for (const r of CONVENTIONS_RULES) {
    it(`the conventions extract ${r.rule}`, () => {
      // Arrange
      const config = "x";

      // Act
      const p = buildConventionsPrompt(config);

      // Assert
      assertMentions(p, [r.marker]);
    });
  }

  it("asks the conventions extract for the run command as a string", () => {
    // Arrange
    const schema = CONVENTIONS_SCHEMA;

    // Act
    const field = schema.properties.runCommand;

    // Assert
    deepStrictEqual(field, { type: "string" });
  });
});
