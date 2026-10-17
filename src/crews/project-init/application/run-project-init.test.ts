// The project-init use case over FakeFiles, FakeLlm and FakeLogger. Run:
//   node_modules/.bin/tsx --test crews/project-init/application/run-project-init.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { runProjectInit } from "./run-project-init.ts";
import { CONVENTIONS_SCHEMA, buildClaudeMdPrompt, buildConventionsPrompt } from "./prompts.ts";
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
  it("detects the conventions from the config files and writes CLAUDE.md", async () => {
    const { files, llm, deps } = setup();
    files.files.set("/workspace/package.json", PKG);
    const detected = { buildCommand: "npm run build", testCommand: "npm test", frameworks: ["vitest"], conventions: [] };
    llm.extractions = [detected];
    strictEqual(await runProjectInit(deps), "✓ wrote /workspace/CLAUDE.md (10 bytes; build='npm run build', test='npm test')");
    deepStrictEqual(llm.extracts, [{ prompt: buildConventionsPrompt(`--- package.json ---\n${PKG}`), schema: CONVENTIONS_SCHEMA }]);
    deepStrictEqual(llm.completes.map((c) => c.prompt), [buildClaudeMdPrompt(["package.json", "src"], detected)]);
    deepStrictEqual(files.writes.filter((w) => w.path === "/workspace/CLAUDE.md"), [{ path: "/workspace/CLAUDE.md", content: "# Project\n" }]);
  });

  it("asks for no detection when no config file exists", async () => {
    const { llm, deps } = setup();
    strictEqual(await runProjectInit(deps), "✓ wrote /workspace/CLAUDE.md (10 bytes; build='?', test='?')");
    deepStrictEqual(llm.extracts, []);
  });

  it("falls back to the package.json scripts when the detection fails", async () => {
    const { files, llm, log, deps } = setup();
    files.files.set("/workspace/package.json", PKG);
    llm.extractions = [new Error("not JSON")];
    const fallback = fallbackConventions(PKG);
    strictEqual(await runProjectInit(deps),
      `✓ wrote /workspace/CLAUDE.md (10 bytes; build='${fallback.buildCommand}', test='${fallback.testCommand}')`);
    deepStrictEqual(llm.completes.map((c) => c.prompt), [buildClaudeMdPrompt(["package.json", "src"], fallback)]);
    deepStrictEqual(log.lines, ["warn: convention extract failed; continuing with package.json scripts only"]);
  });
});
