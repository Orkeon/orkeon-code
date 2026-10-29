import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commentKeysBelowRoot, listExamples, load, PROMISED_EXAMPLES, RESULT_LIMITS, withoutCommentAndLlm,
  withoutCommentOrkeonAndMcp, withoutCommentProfilesAndDecision,
} from "./example-settings.fixtures.ts";
import { assertExamplesInclude, assertJevExampleKeyless, assertWhisperMounts } from "./example-settings.assertions.ts";

// Orkeon judges its settings at the REPL's start and refuses a key it does not know
// inside the sections it declares ("Orkeon:Tools:Shell:_comment is not a setting"):
// an example a user copies must start as it is. Only the root may carry a comment.
// Every config/*.example.json is such an example.
const examples = listExamples();

test("the example settings exist: the default one, the Ollama one, the Ollama and Whisper one, the Jev one", () => {
  // Arrange
  const expected = PROMISED_EXAMPLES;

  // Act
  const found = listExamples();

  // Assert
  assertExamplesInclude(found, expected);
});

for (const name of examples) {
  test(`${name} carries no comment key inside a section`, () => {
    // Arrange
    const settings = load(name);

    // Act
    const keys = commentKeysBelowRoot(settings);

    // Assert
    assert.deepEqual(keys, []);
  });

  test(`${name} carries no API key`, () => {
    // Arrange
    const file = name;

    // Act
    const settings = load(file);

    // Assert
    assert.equal(settings.Llm?.ApiKey, undefined);
  });
}

// The Ollama example is the default one on a model of this machine: the same file but for its
// comment and its Llm section, which names no key variable since Orkeon asks Ollama for none.
test("the Ollama example differs from the default one in its Llm section and its comment only", () => {
  // Arrange
  const main = load("appsettings.example.json");

  // Act
  const ollama = load("appsettings.ollama.example.json");

  // Assert
  assert.deepEqual(withoutCommentAndLlm(ollama), withoutCommentAndLlm(main));
  assert.equal(ollama.Llm.BaseUrl, "http://localhost:11434");
  assert.equal(ollama.Llm.ApiKeyEnvVar, undefined);
  assert.ok(ollama.Llm.AvailableModels.includes(ollama.Llm.Model));
});

// The Ollama and Whisper example is the Ollama one with the Whisper server declared in the file,
// as config/appsettings.whisper.example.json declares it: the agents' /audio and /transcripts are
// mounts of the folders the server reads in Env, and the two spellings must match.
test("the Ollama and Whisper example is the Ollama one plus the Whisper declaration", () => {
  // Arrange
  const ollama = load("appsettings.ollama.example.json");

  // Act
  const both = load("appsettings.ollama-whisper.example.json");
  const { FileSystem, ...orkeon } = both.Orkeon;

  // Assert
  assert.deepEqual(withoutCommentOrkeonAndMcp(both), withoutCommentOrkeonAndMcp(ollama));
  assert.deepEqual(orkeon, ollama.Orkeon);
  assert.deepEqual(both.MCP.Servers.whisper.Env.WHISPER_MODEL, "turbo");
});

// The Jev example is the default one with a decision model in front of the LLM: the same file but for its comment,
// the named profiles the decision profile targets, and the TypeSafe and Decision sections.
test("the Jev example differs from the default one in its profiles and its decision sections only", () => {
  // Arrange
  const main = load("appsettings.example.json");

  // Act
  const jev = load("appsettings.jev.example.json");

  // Assert
  assert.deepEqual(withoutCommentProfilesAndDecision(jev), withoutCommentProfilesAndDecision(main));
});

test("the Jev example reaches TypeSafe through a key variable, never a key, and its decision profile targets a profile it declares", () => {
  // Arrange
  const file = "appsettings.jev.example.json";

  // Act
  const settings = load(file);

  // Assert
  assertJevExampleKeyless(settings, file);
});

for (const name of examples.filter((name) => load(name).MCP?.Servers?.whisper?.Env)) {
  test(`${name} trusts the annotations of its Whisper server, so the gate reads its read-only tools (Orkeon #223)`, () => {
    // Arrange
    const file = name;

    // Act
    const settings = load(file);

    // Assert
    assert.equal(settings.MCP.Servers.whisper.TrustAnnotations, true, `${file}: MCP.Servers.whisper.TrustAnnotations must be true`);
  });
}

for (const name of examples.filter((name) => load(name).MCP?.Servers?.whisper?.Env)) {
  test(`${name} mounts the folders its Whisper server reads`, () => {
    // Arrange
    const file = name;

    // Act
    const settings = load(file);

    // Assert
    assertWhisperMounts(settings);
  });
}

// The two settings of the runtime's resilience and of its result cuts, spelled out at their
// defaults so a user sees where to change them (ToolResultLimitsOptions, ResilienceDefaults).
for (const name of examples.filter((name) => load(name).Llm)) {
  test(`${name} waits out a rate-limit window of five minutes at most`, () => {
    // Arrange
    const file = name;

    // Act
    const settings = load(file);

    // Assert
    assert.equal(settings.Llm.MaxRateLimitWait, "00:05:00");
  });
}

for (const name of examples.filter((name) => load(name).Orkeon?.Tools)) {
  test(`${name} states the result cut of the shell and the read calls run at once`, () => {
    // Arrange
    const file = name;

    // Act
    const settings = load(file);

    // Assert
    assert.deepEqual(settings.Orkeon.Tools.ResultLimits, RESULT_LIMITS);
  });
}

// orkeon run registers the analysis tools (node_*, edit_batch, structural_*) only while
// RaggableTree is enabled: an act given the catalogue fails without them.
for (const name of examples) {
  test(`${name} keeps the analysis tools of orkeon run registered`, () => {
    // Arrange
    const file = name;

    // Act
    const settings = load(file);

    // Assert
    assert.notEqual(settings.RaggableTree?.Enabled, false);
  });
}

// D-6: the session persists, outside the project (the launcher names the folder, /sessions): said in every example
// that configures the REPL, so a user sees where to turn it off.
for (const name of examples.filter((name) => load(name).Orkeon?.Cli)) {
  test(`${name} keeps the session (Orkeon:Cli:Session:Persist)`, () => {
    // Arrange
    const file = name;

    // Act
    const settings = load(file);

    // Assert
    assert.equal(settings.Orkeon.Cli.Session?.Persist, true);
    assert.equal(settings.Orkeon.Cli.Session?.SessionsDirectory, undefined, "the launcher names the folder");
  });
}
