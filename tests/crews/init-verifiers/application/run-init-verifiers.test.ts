// The init-verifiers use case over FakeFiles, FakeLlm and FakeLogger. Run:
//   node --test tests/crews/init-verifiers/application/run-init-verifiers.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { runInitVerifiers } from "../../../../src/crews/init-verifiers/application/run-init-verifiers.ts";
import { READINESS_SCHEMA, buildVerifierSkillPrompt } from "../../../../src/crews/init-verifiers/application/prompts.ts";
import {
  DOCUMENTED_MATERIAL, PYPROJECT, PYPROJECT_SCRIPT, TWO_SKILLS, documentedSetup, initVerifiersSetup,
} from "./run-init-verifiers.fixtures.ts";
import { assertEverySkillMentions } from "./run-init-verifiers.assertions.ts";
import { assertMentions } from "../../../support/assertions/text.ts";

describe("runInitVerifiers", () => {
  it("reports no gap when every zone has a verifier", async () => {
    // Arrange
    const { files, llm, deps } = initVerifiersSetup();
    llm.extractions = [{ appTypes: ["cli", "lib"], frameworks: [], zonesNeedingVerifier: [] }];

    // Act
    const out = await runInitVerifiers(deps);

    // Assert
    strictEqual(out, "No verifier gaps detected (types: cli, lib).");
    deepStrictEqual(files.writes, []);
  });

  it("authors one skill per zone lacking a verifier, each with the skill outline", async () => {
    // Arrange
    const { files, llm, deps } = initVerifiersSetup();
    llm.extractions = [{ appTypes: [], frameworks: [], zonesNeedingVerifier: ["api", "Web UI"] }];
    llm.completions = ["# api checks", "# ui checks"];

    // Act
    const out = await runInitVerifiers(deps);

    // Assert
    strictEqual(out, "✓ authored 2 verifier skill(s) under /output/verifiers/ (zones: api, Web UI)");
    deepStrictEqual(llm.completes.map((c) => c.override?.system), [
      buildVerifierSkillPrompt("api").system, buildVerifierSkillPrompt("Web UI").system,
    ]);
    deepStrictEqual(files.writes, TWO_SKILLS);
  });

  it("gives the readiness prompt the manifests, the Commands section and the steps of the CI workflows", async () => {
    // Arrange
    const { llm, deps } = documentedSetup();
    llm.extractions = [{ appTypes: [], frameworks: [], zonesNeedingVerifier: [] }];

    // Act
    await runInitVerifiers(deps);

    // Assert
    assertMentions(llm.extracts[0].prompt, DOCUMENTED_MATERIAL);
  });

  it("asks the readiness extract for READINESS_SCHEMA", async () => {
    // Arrange
    const { llm, deps } = initVerifiersSetup();
    llm.extractions = [{ appTypes: [], frameworks: [], zonesNeedingVerifier: [] }];

    // Act
    await runInitVerifiers(deps);

    // Assert
    deepStrictEqual(llm.extracts.map((e) => e.schema), [READINESS_SCHEMA]);
  });

  it("gives each skill prompt the manifests, the Commands section and the steps of the CI workflows", async () => {
    // Arrange
    const { llm, deps } = documentedSetup();
    llm.extractions = [{ appTypes: ["cli"], frameworks: [], zonesNeedingVerifier: ["cli", "api"] }];
    llm.completions = ["# checks"];

    // Act
    await runInitVerifiers(deps);

    // Assert
    assertEverySkillMentions(llm.completes, DOCUMENTED_MATERIAL);
  });

  it("gets the commands of a pyproject.toml into the material when there is no package.json", async () => {
    // Arrange
    const { llm, deps } = initVerifiersSetup({ files: { "pyproject.toml": PYPROJECT } });
    llm.extractions = [{ appTypes: ["library"], frameworks: [], zonesNeedingVerifier: ["library"] }];
    llm.completions = ["# library checks"];

    // Act
    await runInitVerifiers(deps);

    // Assert
    assertEverySkillMentions(llm.completes, [PYPROJECT_SCRIPT]);
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
