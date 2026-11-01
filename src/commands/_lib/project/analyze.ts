// /analyze's use case: the crew input built from the command's flags and the session's `answer.language`, so the
// synthesis is written in the language the session answers in (crews/analyze).
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { readLanguage } from "../../../shared/application/answer-language.ts";

/** The flags of /analyze as the runtime parses them. */
export interface AnalyzeArgs {
  raw?: unknown;
  parallel?: unknown;
  rebuild?: unknown;
}

/** The input of the analyze crew: the flags, plus `language` when the session sets `answer.language`. */
export async function analyzeInput(
  args: AnalyzeArgs, config: Pick<ConfigStore, "readValue">,
): Promise<{ raw: boolean; parallel: unknown; rebuild: boolean; language?: string }> {
  const language = await readLanguage(config);
  return {
    raw: args.raw === true,
    parallel: args.parallel,
    rebuild: args.rebuild === true,
    ...(language !== "" ? { language } : {}),
  };
}
