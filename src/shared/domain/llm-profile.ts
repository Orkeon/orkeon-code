// The host profile the agents of the commands run on (`llm.profile`): one of the host's LLM profiles
// (`Llm:Profiles:<name>`) or decision profiles (`Orkeon:Decision:Profiles:<name>`, a decision model such
// as Jev in front of an LLM profile). The command reads the session key and hands the name to the crew
// in its input, under `llmProfile`; the crew's composition root builds every agent on it
// (shared/infrastructure/orkeon/llm-profile.ts). Omitted, the agents run on the host's default model,
// as they always did.
import { PROFILE_NAME_EXPECTED, profileHoldsColon, profileHoldsSpace } from "./messages.ts";

export const LLM_PROFILE_CONFIG_KEY = "llm.profile";
/** The field of a crew input that carries the profile's name. */
export const LLM_PROFILE_INPUT_KEY = "llmProfile";
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

/** Why a value is refused for `llm.profile`; undefined when it is a profile name. */
export function llmProfileProblem(value: string): string | undefined {
  const name = value.trim();
  if (name === "") return PROFILE_NAME_EXPECTED;
  if (/\s/.test(name)) return profileHoldsSpace(value);
  if (name.includes(":")) return profileHoldsColon(value);
  return undefined;
}

/** The profile a crew input names, or null when it names none or the name is not one. */
export function llmProfileOf(input: Readonly<Record<string, unknown>>): string | null {
  const value = input[LLM_PROFILE_INPUT_KEY];
  return typeof value === "string" && llmProfileProblem(value) === undefined ? value.trim() : null;
}
