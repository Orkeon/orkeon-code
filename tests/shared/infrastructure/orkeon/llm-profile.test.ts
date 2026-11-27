// shared/infrastructure/orkeon/llm-profile.ts: an agent builder on the profile the crew input names. Run:
//   node --test tests/shared/infrastructure/orkeon/llm-profile.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects, strictEqual, throws } from "node:assert";
import { PROMPT_CACHE, declaredRoute, profiledAgent } from "../../../../src/shared/infrastructure/orkeon/llm-profile.ts";
import { assertBuiltOn } from "./llm-profile.assertions.ts";
import { CACHE_CASES, DECLARED_ROUTES, FALLBACK_CASES, NO_CACHE_CASES, TASK, factories } from "./llm-profile.fixtures.ts";

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

  for (const c of FALLBACK_CASES) {
    it(c.name, () => {
      // Arrange
      const host = factories(true, ["small"]);

      // Act
      const builder = profiledAgent(c.input, host);

      // Assert
      assertBuiltOn(host, builder, c.profiles);
    });
  }

  it("still fails the load for an unknown profile that was not routed", () => {
    // Arrange
    const host = factories(true, ["small"]);

    // Act
    const act = () => profiledAgent({ llmProfile: "small" }, host);

    // Assert
    throws(act, /unknown LLM profile 'small'/);
  });

  it("throws a failure of a routed profile that is no refusal instead of falling back", () => {
    // Arrange
    const host = factories(true, [], ["small"]);

    // Act
    const act = () => profiledAgent({ llmProfile: "small", llmProfileFallback: "large" }, host);

    // Assert
    throws(act, /the profile 'small' cannot be read/);
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

  for (const c of NO_CACHE_CASES) {
    it(c.name, () => {
      // Arrange
      const host = factories(true, ["small"], [], c.providers);

      // Act
      const builder = profiledAgent(c.input, host);

      // Assert
      deepStrictEqual(builder.caches, []);
    });
  }

  it("requests the prompt cache on a host without llm", () => {
    // Arrange
    const host = factories(false);

    // Act
    const builder = profiledAgent({}, host);

    // Assert
    deepStrictEqual(builder.caches, [PROMPT_CACHE]);
  });

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

describe("declaredRoute", () => {
  for (const c of DECLARED_ROUTES) {
    it(c.name, async () => {
      // Arrange
      const host = factories(c.withProfile, ["small"]);

      // Act
      const { profile } = await declaredRoute(async () => ({ profile: c.answer, effort: null }), host)(TASK);

      // Assert
      strictEqual(profile, c.profile);
    });
  }

  it("keeps the thinking level of a route whose profile the host does not declare", async () => {
    // Arrange
    const host = factories(true, ["small"]);

    // Act
    const routed = await declaredRoute(async () => ({ profile: "small", effort: "low" }), host)(TASK);

    // Assert
    deepStrictEqual(routed, { profile: null, effort: "low" });
  });

  it("rejects with a failure of the routed profile that is no refusal", async () => {
    // Arrange
    const host = factories(true, [], ["small"]);

    // Act
    const act = declaredRoute(async () => ({ profile: "small", effort: null }), host)(TASK);

    // Assert
    await rejects(act, /the profile 'small' cannot be read/);
  });
});
