import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// Orkeon judges its settings at the REPL's start and refuses a key it does not know
// inside the sections it declares ("Orkeon:Tools:Shell:_comment is not a setting"):
// an example a user copies must start as it is. Only the root may carry a comment.
// Every config/*.example.json is such an example.
const configDir = new URL("../config/", import.meta.url);
const examples = readdirSync(configDir).filter((name) => name.endsWith(".example.json")).sort();
const load = (name: string) => JSON.parse(readFileSync(new URL(name, configDir), "utf8"));

function commentKeysBelowRoot(node: unknown, path: string[], found: string[]): string[] {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return found;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const here = [...path, key];
    if (path.length > 0 && key.startsWith("_")) found.push(here.join(":"));
    commentKeysBelowRoot(value, here, found);
  }
  return found;
}

test("the example settings exist: the default one, the Ollama one, the Ollama and Whisper one", () => {
  for (const name of ["appsettings.example.json", "appsettings.ollama.example.json", "appsettings.ollama-whisper.example.json"]) {
    assert.ok(examples.includes(name), `${name} among ${examples.join(", ")}`);
  }
});

for (const name of examples) {
  test(`${name} carries no comment key inside a section`, () => {
    assert.deepEqual(commentKeysBelowRoot(load(name), [], []), []);
  });

  test(`${name} carries no API key`, () => {
    assert.equal(load(name).Llm?.ApiKey, undefined);
  });
}

// The Ollama example is the default one on a model of this machine: the same file but for its
// comment and its Llm section, which names no key variable since Orkeon asks Ollama for none.
test("the Ollama example differs from the default one in its Llm section and its comment only", () => {
  const strip = ({ _comment, Llm, ...rest }: Record<string, unknown>) => rest;
  const main = load("appsettings.example.json");
  const ollama = load("appsettings.ollama.example.json");
  assert.deepEqual(strip(ollama), strip(main));
  assert.equal(ollama.Llm.BaseUrl, "http://localhost:11434");
  assert.equal(ollama.Llm.ApiKeyEnvVar, undefined);
  assert.ok(ollama.Llm.AvailableModels.includes(ollama.Llm.Model));
});

// The Ollama and Whisper example is the Ollama one with the Whisper server declared in the file,
// as config/appsettings.whisper.example.json declares it: the agents' /audio and /transcripts are
// mounts of the folders the server reads in Env, and the two spellings must match.
test("the Ollama and Whisper example is the Ollama one plus the Whisper declaration", () => {
  const strip = ({ _comment, Orkeon, MCP, ...rest }: Record<string, unknown>) => rest;
  const ollama = load("appsettings.ollama.example.json");
  const both = load("appsettings.ollama-whisper.example.json");
  assert.deepEqual(strip(both), strip(ollama));
  const { FileSystem, ...orkeon } = both.Orkeon;
  assert.deepEqual(orkeon, ollama.Orkeon);
  assert.deepEqual(both.MCP.Servers.whisper.Env.WHISPER_MODEL, "turbo");
});

for (const name of examples.filter((name) => load(name).MCP?.Servers?.whisper?.Env)) {
  test(`${name} mounts the folders its Whisper server reads`, () => {
    const settings = load(name);
    const mounts = settings.Orkeon.FileSystem.Mounts as string[];
    const env = settings.MCP.Servers.whisper.Env as Record<string, string>;
    assert.ok(mounts.includes(`${env.WHISPER_AUDIO_DIR}:/audio:ro`), mounts.join(", "));
    assert.ok(mounts.includes(`${env.WHISPER_OUT_DIR}:/transcripts:ro`), mounts.join(", "));
    const args = settings.MCP.Servers.whisper.Args as string[];
    assert.ok(args.at(-1)?.endsWith("/mcp/whisper/whisper_mcp.py"), args.join(" "));
    assert.equal(args[args.indexOf("--project") + 1] + "/whisper_mcp.py", args.at(-1));
  });
}
