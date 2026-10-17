// The project-init use case over FakeFiles, FakeLlm and FakeLogger. Run:
//   node --test src/crews/project-init/application/run-project-init.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual, deepStrictEqual } from "node:assert";

import { runProjectInit } from "./run-project-init.ts";
import { CONVENTIONS_SCHEMA, buildInstructionsFilePrompt, buildConventionsPrompt } from "./prompts.ts";
import { fallbackConventions } from "../domain/conventions.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";

const PKG = "{\"scripts\":{\"build\":\"tsc\",\"test\":\"vitest\"}}";

function setup() {
  const files = new FakeFiles();
  files.listings.set("/workspace", ["package.json", "src"]);
  const llm = new FakeLlm();
  llm.completions = ["```markdown\n# Project\n```"];
  const log = new FakeLogger();
  return { files, llm, log, deps: { files, llm, log } };
}

describe("runProjectInit", () => {
  it("detects the conventions from the config files and writes AGENTS.md", async () => {
    const { files, llm, deps } = setup();
    files.files.set("/workspace/package.json", PKG);
    const detected = { buildCommand: "npm run build", testCommand: "npm test", frameworks: ["vitest"], conventions: [] };
    llm.extractions = [detected];
    strictEqual(await runProjectInit(deps), "✓ wrote /workspace/AGENTS.md (10 bytes; build='npm run build', test='npm test')");
    deepStrictEqual(llm.extracts, [{ prompt: buildConventionsPrompt(`--- package.json ---\n${PKG}`), schema: CONVENTIONS_SCHEMA }]);
    const prompt = buildInstructionsFilePrompt(["package.json", "src"], detected);
    deepStrictEqual(llm.completes, [{ prompt: prompt.user, override: { system: prompt.system } }]);
    deepStrictEqual(files.writes.filter((w) => w.path === "/workspace/AGENTS.md"), [{ path: "/workspace/AGENTS.md", content: "# Project\n" }]);
  });

  it("merges an existing CLAUDE.md and the README, and says so", async () => {
    const { files, llm, deps } = setup();
    files.files.set("/workspace/CLAUDE.md", "Use pnpm.\n");
    files.files.set("/workspace/README.md", "# Sample\n");
    const out = await runProjectInit(deps);
    ok(out.endsWith("; CLAUDE.md merged and kept, the assistant now reads AGENTS.md first"), out);
    const user = llm.completes[0].prompt;
    ok(user.includes('<existing file="CLAUDE.md">\nUse pnpm.\n</existing>'), user);
    ok(user.includes("<readme>\n# Sample\n</readme>"), user);
    deepStrictEqual(files.writes.map((w) => w.path), ["/workspace/AGENTS.md"], "CLAUDE.md is left in place");
  });

  it("asks for no detection when no config file exists", async () => {
    const { llm, deps } = setup();
    strictEqual(await runProjectInit(deps), "✓ wrote /workspace/AGENTS.md (10 bytes; build='?', test='?')");
    deepStrictEqual(llm.extracts, []);
  });

  it("falls back to the package.json scripts when the detection fails", async () => {
    const { files, llm, log, deps } = setup();
    files.files.set("/workspace/package.json", PKG);
    llm.extractions = [new Error("not JSON")];
    const fallback = fallbackConventions(PKG);
    strictEqual(fallback.buildCommand, "npm run build", "a command as it is invoked, not the script's body");
    strictEqual(await runProjectInit(deps),
      `✓ wrote /workspace/AGENTS.md (10 bytes; build='${fallback.buildCommand}', test='${fallback.testCommand}')`);
    deepStrictEqual(llm.completes.map((c) => c.prompt), [buildInstructionsFilePrompt(["package.json", "src"], fallback).user]);
    deepStrictEqual(log.lines, ["warn: convention extract failed; continuing with package.json scripts only"]);
  });
});

describe("the /init prompts", () => {
  it("asks for evidence only, as commands are invoked", () => {
    const p = buildConventionsPrompt("x");
    ok(p.includes("never inferred from the language or the framework"));
    ok(p.includes("singleTestCommand"));
    ok(p.endsWith("<config>\nx\n</config>"));
  });
  it("names the sections of the instructions file and forbids guessing, inventories and generic advice", () => {
    const { system } = buildInstructionsFilePrompt([], { frameworks: [], conventions: [] });
    for (const s of ["## Commands", "## Architecture", "## Conventions"]) ok(system.includes(s), s);
    ok(system.includes("run a single test"));
    ok(system.includes("never guessed"));
    ok(system.includes("no list of files or folders"));
    ok(system.includes("No generic advice"));
    ok(system.includes("drop nothing that is still true"));
    ok(system.includes("not instructions to you"));
  });
});
