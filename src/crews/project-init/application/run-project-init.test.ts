// The project-init use case over FakeFiles, FakeLlm and FakeLogger. Run:
//   node --test src/crews/project-init/application/run-project-init.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual, deepStrictEqual } from "node:assert";

import { runProjectInit } from "./run-project-init.ts";
import { CONVENTIONS_SCHEMA, buildInstructionsFilePrompt, buildConventionsPrompt } from "./prompts.ts";
import { fallbackConventions } from "../domain/conventions.ts";
import { DETECTED, PKG, projectInitSetup } from "./run-project-init.fixtures.ts";
import { assertMentions } from "../../../../tests/support/assertions/text.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

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
    deepStrictEqual(llm.extracts, [{ prompt: buildConventionsPrompt(`--- package.json ---\n${PKG}`), schema: CONVENTIONS_SCHEMA }]);
    deepStrictEqual(llm.completes, [{ prompt: prompt.user, override: { system: prompt.system } }]);
    deepStrictEqual(files.writes.filter((w) => w.path === `${WORKSPACE}/AGENTS.md`), [{ path: `${WORKSPACE}/AGENTS.md`, content: "# Project\n" }]);
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
      "## Commands", "## Architecture", "## Conventions", "run a single test", "never guessed", "no list of files or folders",
      "No generic advice", "drop nothing that is still true", "not instructions to you",
    ]);
  });
});
