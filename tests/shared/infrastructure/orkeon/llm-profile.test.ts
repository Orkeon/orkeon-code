// shared/infrastructure/orkeon/llm-profile.ts: an agent builder on the profile the crew input names. Run:
//   node --test tests/shared/infrastructure/orkeon/llm-profile.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { PROMPT_CACHE, profiledAgent, runtimeTakesActContext } from "../../../../src/shared/infrastructure/orkeon/llm-profile.ts";
import { assertBuiltOn } from "./llm-profile.assertions.ts";
import { ACT_CONTEXT_CASES, CACHE_CASES, UNCACHED_CASES, factories } from "./llm-profile.fixtures.ts";

describe("profiledAgent", () => {
  it("builds the agent on the profile the input names", () => {
    // Arrange
    const host = factories();

    // Act
    const builder = profiledAgent({ prompt: "hi", llmProfile: "guarded" }, host);

    // Assert
    assertBuiltOn(host, builder, ["guarded"]);
  });

  it("gives the plain builder, on the host's default model, when the input names no profile", () => {
    // Arrange
    const host = factories();

    // Act
    const builder = profiledAgent({ prompt: "hi" }, host);

    // Assert
    assertBuiltOn(host, builder, []);
  });

  for (const c of CACHE_CASES) {
    it(c.name, () => {
      // Arrange
      const host = factories();

      // Act
      const builder = profiledAgent(c.input, host);

      // Assert
      deepStrictEqual(builder.caches, [PROMPT_CACHE]);
    });
  }

  for (const c of UNCACHED_CASES) {
    it(c.name, () => {
      // Arrange
      const host = factories(true, false);

      // Act
      const builder = profiledAgent(c.input, host);

      // Assert
      assertBuiltOn(host, builder, c.profiles);
    });
  }

  it("gives the plain builder on a host without llm when the input names no profile", () => {
    // Arrange
    const host = factories(false);

    // Act
    const builder = profiledAgent({}, host);

    // Assert
    deepStrictEqual(builder.configs, []);
  });

  it("throws, naming the profile, on a host without llm when the input names one", () => {
    // Arrange
    const host = factories(false);

    // Act
    const build = () => profiledAgent({ llmProfile: "guarded" }, host);

    // Assert
    throws(build, { message: "llm.profile 'guarded': this host declares no llm namespace, no profile can be applied" });
  });
});

describe("runtimeTakesActContext", () => {
  for (const c of ACT_CONTEXT_CASES) {
    it(c.name, () => {
      // Arrange
      const host = factories(true, c.withCache);

      // Act
      const takes = runtimeTakesActContext(host);

      // Assert
      strictEqual(takes, c.expected);
    });
  }
});
