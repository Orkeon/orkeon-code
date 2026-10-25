// The init-verifiers use case over FakeFiles, FakeLlm and FakeLogger. Run:
//   node --test src/crews/init-verifiers/application/run-init-verifiers.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual, deepStrictEqual } from "node:assert";

import { runInitVerifiers } from "./run-init-verifiers.ts";
import { READINESS_SCHEMA, buildReadinessPrompt, buildVerifierSkillPrompt } from "./prompts.ts";
import { PKG, TWO_SKILLS, initVerifiersSetup } from "./run-init-verifiers.fixtures.ts";
import { assertMentions } from "../../../../tests/support/assertions/text.ts";

describe("runInitVerifiers", () => {
  it("reports no gap when every zone has a verifier", async () => {
    // Arrange
    const { files, llm, deps } = initVerifiersSetup();
    llm.extractions = [{ appTypes: ["cli", "lib"], frameworks: [], zonesNeedingVerifier: [] }];

    // Act
    const out = await runInitVerifiers(deps);

    // Assert
    strictEqual(out, "No verifier gaps detected (types: cli, lib).");
    deepStrictEqual(llm.extracts, [{ prompt: buildReadinessPrompt(["package.json", "src"], PKG), schema: READINESS_SCHEMA }]);
    deepStrictEqual(files.writes, []);
  });

  it("authors one skill per zone lacking a verifier", async () => {
    // Arrange
    const { files, llm, deps } = initVerifiersSetup();
    llm.extractions = [{ appTypes: [], frameworks: [], zonesNeedingVerifier: ["api", "Web UI"] }];
    llm.completions = ["# api checks", "# ui checks"];
    const readiness = llm.extractions[0] as any;

    // Act
    const out = await runInitVerifiers(deps);

    // Assert
    strictEqual(out, "✓ authored 2 verifier skill(s) under /output/verifiers/ (zones: api, Web UI)");
    deepStrictEqual(llm.completes.map((c) => c.override?.system), [
      buildVerifierSkillPrompt("api").system, buildVerifierSkillPrompt("Web UI").system,
    ]);
    ok(llm.completes.every((c) => c.prompt === buildVerifierSkillPrompt("api", { pkg: PKG, readiness }).user),
      "every skill is written from the project's facts");
    deepStrictEqual(files.writes, TWO_SKILLS);
  });

  it("falls back to the package.json heuristic when the classification fails", async () => {
    // Arrange
    const { llm, log, deps } = initVerifiersSetup();
    llm.extractions = [new Error("not JSON")];
    llm.completions = ["# unit"];

    // Act
    const out = await runInitVerifiers(deps);

    // Assert
    strictEqual(out, "✓ authored 1 verifier skill(s) under /output/verifiers/ (zones: unit-tests)");
    deepStrictEqual(log.lines, ["warn: readiness extract failed; falling back to a package.json heuristic"]);
  });

  it("reads an empty classification as no gap of an unknown type", async () => {
    // Arrange
    const { llm, deps } = initVerifiersSetup();
    llm.extractions = [null];

    // Act
    const out = await runInitVerifiers(deps);

    // Assert
    strictEqual(out, "No verifier gaps detected (types: unknown).");
  });
});

describe("the verifier prompts", () => {
  it("defines each program kind and lets a list stay empty", () => {
    // Arrange
    const listing: string[] = [];

    // Act
    const p = buildReadinessPrompt(listing, "{}");

    // Assert
    assertMentions(p, [
      "cli (", "web (", "api (", "library (", "true only when the inputs show them", "Leave a list empty rather than guess",
    ]);
  });

  it("outlines a skill that ends on an observable signal and invents no command", () => {
    // Arrange
    const zone = "cli";

    // Act
    const { system } = buildVerifierSkillPrompt(zone);

    // Assert
    assertMentions(system, ["## Prerequisites", "## Steps", "## Pass", "## Report", "Use only commands the facts show"]);
  });
});
