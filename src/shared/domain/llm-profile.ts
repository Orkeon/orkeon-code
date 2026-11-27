// The host profile the agents of the commands run on (`llm.profile`): one of the host's LLM profiles
// (`Llm:Profiles:<name>`) or decision profiles (`Orkeon:Decision:Profiles:<name>`, a decision model such
// as Jev in front of an LLM profile). The command reads the session key and hands the name to the crew
// in its input, under `llmProfile`; the crew's composition root builds every agent on it
// (shared/infrastructure/orkeon/llm-profile.ts). Omitted, the agents run on the host's default model,
// as they always did.
import { PROFILE_NAME_EXPECTED, profileHoldsColon, profileHoldsSpace, profileIsAuto } from "./messages.ts";

export const LLM_PROFILE_CONFIG_KEY = "llm.profile";
/** The profile of every agent but the main turn's: the crews the commands launch and the explorer the main turn
 *  spawns. Omitted, they follow `llm.profile`. */
export const AGENTS_PROFILE_CONFIG_KEY = "agents.profile";
/** The name the runtime reserves for its own pick of a profile per task (Orkeon #434), in any case. */
export const RESERVED_AUTO_PROFILE = "auto";
/** The field of a crew input that carries the profile's name. */
export const LLM_PROFILE_INPUT_KEY = "llmProfile";
/** The field of the main loop's input that carries `agents.profile`: the profile of the agents its turn spawns. */
export const AGENTS_PROFILE_INPUT_KEY = "agentsLlmProfile";
/** The field of a crew input that marks `llmProfile` as picked by the routing, and carries the session's own profile
 *  ("" for the host's default model): what the crew runs on when the host declares no profile of the routed name. */
export const LLM_PROFILE_FALLBACK_INPUT_KEY = "llmProfileFallback";

/** The session's profile a routed crew input falls back on: undefined when the input was not routed, null for the
 *  host's default model. */
export function llmProfileFallbackOf(input: Readonly<Record<string, unknown>>): string | null | undefined {
  const value = input[LLM_PROFILE_FALLBACK_INPUT_KEY];
  if (typeof value !== "string") return undefined;
  return value.trim() === "" || llmProfileProblem(value) !== undefined ? null : value.trim();
}

/** The session's own profile a crew input carries: its `llmProfileFallback` when the launch was routed, else its
 *  `llmProfile`; null for the host's default model. */
export function llmSessionProfileOf(input: Readonly<Record<string, unknown>>): string | null {
  const fallback = llmProfileFallbackOf(input);
  return fallback === undefined ? llmProfileOf(input) : fallback;
}

/** Why a value is refused for `llm.profile`; undefined when it is a profile name. */
export function llmProfileProblem(value: string): string | undefined {
  const name = value.trim();
  if (name === "") return PROFILE_NAME_EXPECTED;
  if (/\s/.test(name)) return profileHoldsSpace(value);
  if (name.includes(":")) return profileHoldsColon(value);
  // The runtime refuses a host profile of that name (Orkeon #434): no host can declare one.
  if (name.toLowerCase() === RESERVED_AUTO_PROFILE) return profileIsAuto(value);
  return undefined;
}

/** The profile a crew input names, or null when it names none or the name is not one. */
export function llmProfileOf(input: Readonly<Record<string, unknown>>): string | null {
  const value = input[LLM_PROFILE_INPUT_KEY];
  return typeof value === "string" && llmProfileProblem(value) === undefined ? value.trim() : null;
}

/** The profile the main loop's input names for the agents its turn spawns, or null when it names none. */
export function agentsProfileOf(input: Readonly<Record<string, unknown>>): string | null {
  const value = input[AGENTS_PROFILE_INPUT_KEY];
  return typeof value === "string" && llmProfileProblem(value) === undefined ? value.trim() : null;
}

/** The input an agent the main turn spawns is built from: the turn's own, its profile replaced by the one
 *  `agents.profile` names; the turn's own, untouched, when it names none. */
export function spawnedAgentInput(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const profile = agentsProfileOf(input);
  if (profile === null) return input;
  const { [LLM_PROFILE_FALLBACK_INPUT_KEY]: _routed, ...rest } = input;
  return { ...rest, [LLM_PROFILE_INPUT_KEY]: profile };
}

/** The host providers that take no prompt-cache request: the runtime says at each call that it ignores one (the
 *  `agent-cli` provider, Orkeon #470, which drives a CLI that caches by its own rules). */
export const PROVIDERS_WITHOUT_PROMPT_CACHE: readonly string[] = ["agent-cli"];

/** Whether an agent on `provider` (`LlmConfig.provider`, in any case) requests the prompt cache; true when the
 *  provider is not known. */
export function takesPromptCache(provider: string | undefined): boolean {
  return provider === undefined || !PROVIDERS_WITHOUT_PROMPT_CACHE.includes(provider.trim().toLowerCase());
}
