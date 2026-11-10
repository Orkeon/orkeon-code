// The session's `llm.profile`, read by a command before it launches a crew: the profile's name, or the
// line to warn with when the setting cannot be read or holds no profile name (the launch then goes on,
// on the host's default model).

import type { ConfigStore } from "./config-store.ts";
import { CONFIG_FILE_PATH } from "./config-store.ts";
import { LLM_PROFILE_CONFIG_KEY, llmProfileProblem } from "../domain/llm-profile.ts";
import { couldNotBeReadOrParsed, llmProfileRejected, llmProfileUnreadable } from "./messages.ts";

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
      return unreadable(couldNotBeReadOrParsed(CONFIG_FILE_PATH));
    }
    if (typeof value !== "string") return { profile: null };
    const problem = llmProfileProblem(value);
    if (problem !== undefined) {
      return { profile: null, warning: llmProfileRejected(LLM_PROFILE_CONFIG_KEY, problem) };
    }
    return { profile: value.trim() };
  } catch (e: unknown) {
    return unreadable(String((e as { message?: unknown })?.message ?? e));
  }
}

function unreadable(why: string): LlmProfileRead {
  return { profile: null, warning: llmProfileUnreadable(LLM_PROFILE_CONFIG_KEY, why) };
}
