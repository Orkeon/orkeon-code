// The language the session answers in (`answer.language`), read through the config port. Shared by the main
// loop's prompt and the crews a command hands it to (/analyze), so neither depends on the other.
import type { ConfigStore } from "./config-store.ts";
import { ANSWER_LANGUAGE_CONFIG_KEY } from "../domain/agent-policy/output-styles.ts";

/** The `answer.language` setting; "" when unset, unreadable or without a store. */
export async function readLanguage(config: Pick<ConfigStore, "readValue"> | undefined): Promise<string> {
  if (config === undefined) return "";
  try {
    return String((await config.readValue(ANSWER_LANGUAGE_CONFIG_KEY)).value ?? "").trim();
  } catch {
    return "";
  }
}
