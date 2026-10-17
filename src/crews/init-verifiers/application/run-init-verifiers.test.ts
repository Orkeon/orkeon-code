// The init-verifiers use case over FakeFiles, FakeLlm and FakeLogger. Run:
//   node --test src/crews/init-verifiers/application/run-init-verifiers.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual, deepStrictEqual } from "node:assert";

import { runInitVerifiers } from "./run-init-verifiers.ts";
import { READINESS_SCHEMA, buildReadinessPrompt, buildVerifierSkillPrompt } from "./prompts.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";

const PKG = "{\"scripts\":{\"build\":\"tsc\"}}";

function setup() {
  const files = new FakeFiles();
  files.listings.set("/workspace", ["package.json", "src"]);
  files.files.set("/workspace/package.json", PKG);
  const llm = new FakeLlm();
  const log = new FakeLogger();
  return { files, llm, log, deps: { files, llm, log } };
}

describe("runInitVerifiers", () => {
  it("reports no gap when every zone has a verifier", async () => {
    const { files, llm, deps } = setup();
    llm.extractions = [{ appTypes: ["cli", "lib"], frameworks: [], zonesNeedingVerifier: [] }];
    strictEqual(await runInitVerifiers(deps), "No verifier gaps detected (types: cli, lib).");
    deepStrictEqual(llm.extracts, [{ prompt: buildReadinessPrompt(["package.json", "src"], PKG), schema: READINESS_SCHEMA }]);
    deepStrictEqual(files.writes, []);
  });

  it("authors one skill per zone lacking a verifier", async () => {
    const { files, llm, deps } = setup();
    llm.extractions = [{ appTypes: [], frameworks: [], zonesNeedingVerifier: ["api", "Web UI"] }];
    llm.completions = ["# api checks", "# ui checks"];
    strictEqual(await runInitVerifiers(deps), "✓ authored 2 verifier skill(s) under /output/verifiers/ (zones: api, Web UI)");
    const readiness = llm.extractions[0] as any;
    deepStrictEqual(llm.completes.map((c) => c.override?.system), [
      buildVerifierSkillPrompt("api").system, buildVerifierSkillPrompt("Web UI").system,
    ]);
    ok(llm.completes.every((c) => c.prompt === buildVerifierSkillPrompt("api", { pkg: PKG, readiness }).user),
      "every skill is written from the project's facts");
    deepStrictEqual(files.writes, [
      { path: "/output/verifiers/verify-api.md", content: "# api checks\n" },
      { path: "/output/verifiers/verify-web-ui.md", content: "# ui checks\n" },
    ]);
  });

  it("falls back to the package.json heuristic when the classification fails", async () => {
    const { llm, log, deps } = setup();
    llm.extractions = [new Error("not JSON")];
    llm.completions = ["# unit"];
    strictEqual(await runInitVerifiers(deps), "✓ authored 1 verifier skill(s) under /output/verifiers/ (zones: unit-tests)");
    deepStrictEqual(log.lines, ["warn: readiness extract failed; falling back to a package.json heuristic"]);
  });

  it("reads an empty classification as no gap of an unknown type", async () => {
    const { llm, deps } = setup();
    llm.extractions = [null];
    strictEqual(await runInitVerifiers(deps), "No verifier gaps detected (types: unknown).");
  });
});

describe("the verifier prompts", () => {
  it("defines each program kind and lets a list stay empty", () => {
    const p = buildReadinessPrompt([], "{}");
    for (const kind of ["cli (", "web (", "api (", "library ("]) ok(p.includes(kind), kind);
    ok(p.includes("true only when the inputs show them"));
    ok(p.includes("Leave a list empty rather than guess"));
  });
  it("outlines a skill that ends on an observable signal and invents no command", () => {
    const { system } = buildVerifierSkillPrompt("cli");
    for (const s of ["## Prerequisites", "## Steps", "## Pass", "## Report"]) ok(system.includes(s), s);
    ok(system.includes("Use only commands the facts show"));
  });
});
