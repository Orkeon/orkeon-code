// The agent factories profiledAgent builds over (wiring.ts hands it the runtime's): a builder that records the LLM config and the cache it is given
// (or, as a runtime before Orkeon #256 has, no cache at all), and a
// `llm.profile` that answers a config naming the profile (or none, as a command engine declares no `llm`).
import type { AgentFactories } from "../../../../src/shared/infrastructure/orkeon/llm-profile.ts";

/** A builder of a runtime before Orkeon #256 (the rc.6 release): it has no `cache`. */
export class UncachedAgentBuilder {
  configs: LlmConfig[] = [];

  llm(config: LlmConfig): this {
    this.configs.push(config);
    return this;
  }
}

export class RecordingAgentBuilder extends UncachedAgentBuilder {
  caches: LlmCacheOptions[] = [];

  cache(options: LlmCacheOptions): this {
    this.caches.push(options);
    return this;
  }
}

/** A config as `llm.profile(name)` answers it. */
export const profileConfig = (name: string): LlmConfig => ({ provider: "host", profile: name, model: "", with: () => profileConfig(name) });

export function factories(withProfile = true, withCache = true): AgentFactories & { built: UncachedAgentBuilder[] } {
  const built: UncachedAgentBuilder[] = [];
  return {
    built,
    agent: () => { const builder = withCache ? new RecordingAgentBuilder() : new UncachedAgentBuilder(); built.push(builder); return builder; },
    profile: withProfile ? profileConfig : undefined,
  };
}

/** The inputs every agent requests the prompt cache on: a profile named, or none. */
export const CACHE_CASES: { name: string; input: Record<string, unknown> }[] = [
  { name: "requests the prompt cache of the system prompt and the tools on a profile", input: { llmProfile: "guarded" } },
  { name: "requests the prompt cache of the system prompt and the tools on the host's default model", input: {} },
];

/** The inputs an agent is built on by a runtime whose builder has no cache: a profile named, or none. */
export const UNCACHED_CASES: { name: string; input: Record<string, unknown>; profiles: string[] }[] = [
  { name: "builds the agent on the profile without the prompt cache when the runtime's builder has no cache", input: { llmProfile: "guarded" }, profiles: ["guarded"] },
  { name: "builds the agent on the host's default model without the prompt cache when the runtime's builder has no cache", input: {}, profiles: [] },
];

/** Whether the runtime's act() reads `context`, told by its builder: one with `.cache` (after #256), or none (the rc.6 release). */
export const ACT_CONTEXT_CASES: { name: string; withCache: boolean; expected: boolean }[] = [
  { name: "says the runtime reads act's context when its builder has a cache", withCache: true, expected: true },
  { name: "says the runtime does not read act's context when its builder has no cache, as the rc.6 release", withCache: false, expected: false },
];
