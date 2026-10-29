// The session's `llm.profile`, read by a command before it launches a crew: the profile's name, or the
// line to warn with when the setting cannot be read or holds no profile name (the launch then goes on,
// on the host's default model).

import type { ConfigStore } from "./config-store.ts";
import { CONFIG_FILE_PATH } from "./config-store.ts";
import { LLM_PROFILE_CONFIG_KEY, llmProfileProblem } from "../domain/llm-profile.ts";

export interface LlmProfileRead {
  /** The profile every agent of the crew runs on; null when the session names none. */
  profile: string | null;
  /** The line to warn with when the setting was not read as a profile. */
  warning?: string;
}

export async function readLlmProfile(config: Pick<ConfigStore, "readValue" | "readFile">): Promise<LlmProfileRead> {
  try {
    const { value, source } = await config.readValue(LLM_PROFILE_CONFIG_KEY);
    if (source === "unset" && (await config.readFile()).malformed) {
      return unreadable(`${CONFIG_FILE_PATH} could not be read or parsed`);
    }
    if (typeof value !== "string") return { profile: null };
    const problem = llmProfileProblem(value);
    if (problem !== undefined) {
      return { profile: null, warning: `${LLM_PROFILE_CONFIG_KEY}: ${problem}; the host's default model this launch` };
    }
    return { profile: value.trim() };
  } catch (e: unknown) {
    return unreadable(String((e as { message?: unknown })?.message ?? e));
  }
}

function unreadable(why: string): LlmProfileRead {
  return { profile: null, warning: `${LLM_PROFILE_CONFIG_KEY} could not be read (${why}): the host's default model this launch` };
}
