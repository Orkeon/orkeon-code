// Checks on the example settings.
import assert from "node:assert/strict";
import { withoutCommentProfilesAndDecision } from "./example-settings.fixtures.ts";

/** Every name of `expected` is among `examples`. */
export function assertExamplesInclude(examples: readonly string[], expected: readonly string[]): void {
  for (const name of expected) assert.ok(examples.includes(name), `${name} among ${examples.join(", ")}`);
}

/** The settings mount the folders their Whisper server reads at /audio and /transcripts, and start its script. */
export function assertWhisperMounts(settings: any): void {
  const mounts = settings.Orkeon.FileSystem.Mounts as string[];
  const env = settings.MCP.Servers.whisper.Env as Record<string, string>;
  assert.ok(mounts.includes(`${env.WHISPER_AUDIO_DIR}:/audio:ro`), mounts.join(", "));
  assert.ok(mounts.includes(`${env.WHISPER_OUT_DIR}:/transcripts:ro`), mounts.join(", "));
  const args = settings.MCP.Servers.whisper.Args as string[];
  assert.ok(args.at(-1)?.endsWith("/mcp/whisper/whisper_mcp.py"), args.join(" "));
  assert.equal(args[args.indexOf("--project") + 1] + "/whisper_mcp.py", args.at(-1));
}

/** The Jev example reaches TypeSafe through a key variable, never a key, and every profile its decision
 *  profile names (its target, the escalations of its stages) is an `Llm:Profiles` entry of the file. */
export function assertJevExampleKeyless(settings: any, file: string): void {
  assert.equal(settings.Orkeon.TypeSafe.ApiKey, undefined, `${file}: Orkeon:TypeSafe holds a key`);
  assert.equal(settings.Orkeon.TypeSafe.ApiKeyEnvVar, "TYPESAFE_API_KEY", `${file}: Orkeon:TypeSafe does not read TYPESAFE_API_KEY`);
  const guarded = settings.Orkeon.Decision.Profiles.guarded;
  const named = [guarded.Target, ...guarded.Stages.map((stage: any) => stage.EscalateTo).filter(Boolean)];
  const unknown = named.filter((name) => !settings.Llm.Profiles[name]);
  assert.deepEqual(unknown, [], `${file}: the decision profile names profiles that are not Llm:Profiles entries: ${unknown.join(", ")}`);
}

/** A decision example names its provider in Orkeon:Decision:Provider, reaches it through `keyVariable`, never a key,
 *  and holds no other provider's section. */
export function assertNamedDecisionExample(
  settings: any, file: string, section: string, keyVariable: string, provider: string,
): void {
  assert.equal(settings.Orkeon.Decision.Provider, provider, `${file}: Orkeon:Decision:Provider is not ${provider}`);
  assert.equal(settings.Orkeon[section].ApiKey, undefined, `${file}: Orkeon:${section} holds a key`);
  assert.equal(settings.Orkeon[section].ApiKeyEnvVar, keyVariable, `${file}: Orkeon:${section} does not read ${keyVariable}`);
  const others = ["TypeSafe", "Liquid", "Kev"].filter((name) => name !== section && settings.Orkeon[name] !== undefined);
  assert.deepEqual(others, [], `${file}: holds another decision provider's section: ${others.join(", ")}`);
}

/** The settings are the Jev example on another decision provider: the same file but for their comment, the provider's
 *  section and Orkeon:Decision:Provider, with the same LLM profiles and the same decision profiles. */
export function assertSameAsJevButProvider(settings: any, jev: any, file: string): void {
  assert.deepEqual(withoutCommentProfilesAndDecision(settings), withoutCommentProfilesAndDecision(jev), `${file}: differs from the Jev example outside its decision provider`);
  assert.deepEqual(settings.Llm.Profiles, jev.Llm.Profiles, `${file}: its Llm:Profiles differ from the Jev example's`);
  assert.deepEqual(settings.Orkeon.Decision.Profiles, jev.Orkeon.Decision.Profiles, `${file}: its decision profiles differ from the Jev example's`);
}

/** Every profile a `Fallback` of the file names is an `Llm:Profiles` entry of the file, and no chain names its own
 *  profile (the registry refuses both at the start). */
export function assertFallbacksKnown(settings: any, file: string): void {
  const profiles = settings.Llm.Profiles as Record<string, { Fallback?: string[] }>;
  for (const [name, profile] of Object.entries(profiles)) {
    const unknown = (profile.Fallback ?? []).filter((target) => target !== "default" && !profiles[target]);
    assert.deepEqual(unknown, [], `${file}: Llm:Profiles:${name}:Fallback names profiles the file does not define: ${unknown.join(", ")}`);
    assert.ok(!(profile.Fallback ?? []).includes(name), `${file}: Llm:Profiles:${name}:Fallback comes back to ${name}`);
  }
}
