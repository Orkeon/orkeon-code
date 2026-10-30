// The agent factories profiledAgent builds over (wiring.ts hands it the runtime's): a builder that records the LLM config and the cache it is given, and a
// `llm.profile` that answers a config naming the profile (or none, as a command engine declares no `llm`).
import type { AgentFactories } from "../../../../src/shared/infrastructure/orkeon/llm-profile.ts";

export class RecordingAgentBuilder {
  configs: LlmConfig[] = [];
  caches: LlmCacheOptions[] = [];

  cache(options: LlmCacheOptions): this {
    this.caches.push(options);
    return this;
  }

  llm(config: LlmConfig): this {
    this.configs.push(config);
    return this;
  }
}

/** A config as `llm.profile(name)` answers it. */
export const profileConfig = (name: string): LlmConfig => ({ provider: "host", profile: name, model: "", with: () => profileConfig(name) });

export function factories(withProfile = true): AgentFactories & { built: RecordingAgentBuilder[] } {
  const built: RecordingAgentBuilder[] = [];
  return {
    built,
    agent: () => { const builder = new RecordingAgentBuilder(); built.push(builder); return builder; },
    profile: withProfile ? profileConfig : undefined,
  };
}

/** The inputs every agent requests the prompt cache on: a profile named, or none. */
export const CACHE_CASES: { name: string; input: Record<string, unknown> }[] = [
  { name: "requests the prompt cache of the system prompt and the tools on a profile", input: { llmProfile: "guarded" } },
  { name: "requests the prompt cache of the system prompt and the tools on the host's default model", input: {} },
];
