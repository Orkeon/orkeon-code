// The profiles a command reads before it launches a crew. `llm.profile` is the session's: the main turn runs on it.
// `agents.profile` is the one of every other agent: the crews the commands launch and the explorer the main turn
// spawns; omitted, they follow `llm.profile`. Each read answers the profile's name, or the line to warn with when
// the setting cannot be read or holds no profile name (the launch then goes on without it).

import type { ConfigStore } from "./config-store.ts";
import { CONFIG_FILE_PATH } from "./config-store.ts";
import { AGENTS_PROFILE_CONFIG_KEY, LLM_PROFILE_CONFIG_KEY, llmProfileProblem } from "../domain/llm-profile.ts";
import {
  agentsProfileRejected, agentsProfileUnreadable, couldNotBeReadOrParsed, llmProfileRejected, llmProfileUnreadable,
} from "./messages.ts";

export interface LlmProfileRead {
  /** The profile the setting names; null when it names none. */
  profile: string | null;
  /** The line to warn with when the setting was not read as a profile. */
  warning?: string;
}

/** What a crew is launched on, and the lines to warn with on the way. */
export interface CrewProfileRead {
  /** `agents.profile`, else `llm.profile`; null for the host's default model. */
  profile: string | null;
  warnings: string[];
}

type ProfileConfig = Pick<ConfigStore, "readValue" | "readFile">;

interface ProfileKey {
  key: string;
  rejected: (key: string, problem: string) => string;
  unreadable: (key: string, why: string) => string;
}

const SESSION_KEY: ProfileKey = { key: LLM_PROFILE_CONFIG_KEY, rejected: llmProfileRejected, unreadable: llmProfileUnreadable };
const AGENTS_KEY: ProfileKey = { key: AGENTS_PROFILE_CONFIG_KEY, rejected: agentsProfileRejected, unreadable: agentsProfileUnreadable };

async function readProfile(config: ProfileConfig, { key, rejected, unreadable }: ProfileKey): Promise<LlmProfileRead> {
  try {
    const { value, source } = await config.readValue(key);
    if (source === "unset" && (await config.readFile()).malformed) {
      return { profile: null, warning: unreadable(key, couldNotBeReadOrParsed(CONFIG_FILE_PATH)) };
    }
    if (typeof value !== "string") return { profile: null };
    const problem = llmProfileProblem(value);
    if (problem !== undefined) return { profile: null, warning: rejected(key, problem) };
    return { profile: value.trim() };
  } catch (e: unknown) {
    return { profile: null, warning: unreadable(key, String((e as { message?: unknown })?.message ?? e)) };
  }
}

/** The session's `llm.profile`: what the main turn runs on. */
export const readLlmProfile = (config: ProfileConfig): Promise<LlmProfileRead> => readProfile(config, SESSION_KEY);

/** The session's `agents.profile`: null when the agents follow `llm.profile`. */
export const readAgentsProfile = (config: ProfileConfig): Promise<LlmProfileRead> => readProfile(config, AGENTS_KEY);

/** The profile a crew other than the main loop is launched on: `agents.profile`, else `llm.profile`. */
export async function readCrewProfile(config: ProfileConfig): Promise<CrewProfileRead> {
  const agents = await readAgentsProfile(config);
  const warnings = agents.warning === undefined ? [] : [agents.warning];
  if (agents.profile !== null) return { profile: agents.profile, warnings };
  const session = await readLlmProfile(config);
  if (session.warning !== undefined) warnings.push(session.warning);
  return { profile: session.profile, warnings };
}
