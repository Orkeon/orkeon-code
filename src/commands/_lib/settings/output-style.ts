// /output-style [<name>|show]: the session's answer style, consumed by the main-loop prompt assembly. One
// session-state key, deliberately not a /config key: two owners for one setting is how a value ends up read from the
// layer nobody wrote to.
import type { Chooser } from "../../../shared/application/ports.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { OUTPUT_STYLES, isOutputStyle } from "../../../shared/domain/agent-policy/output-styles.ts";
import { OUTPUT_STYLE_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { CommandView } from "../view.ts";
import { optionsOf } from "./choices.ts";

export interface OutputStyleDeps {
  session: Pick<SessionIo, "readState" | "writeState">;
  /** Where a bare /output-style opens a panel, when it can. */
  chooser?: Chooser;
}

/** `/output-style [<name>|show]`, from the command's raw tokens. No argument opens a panel, or without one shows the
 *  style, as `show` does. */
export async function runOutputStyle(tokens: string[], deps: OutputStyleDeps): Promise<CommandView> {
  const requested = (tokens[0] ?? "").trim();
  const current = (await deps.session.readState(OUTPUT_STYLE_STATE_KEY)) ?? "default";

  if (!requested && deps.chooser?.interactive) {
    const answer = await deps.chooser.choose({
      message: "Answer style for this session",
      options: optionsOf(OUTPUT_STYLES, current),
    });
    return answer ? runOutputStyle([answer.value], { session: deps.session }) : { text: "output style unchanged." };
  }
  if (!requested || requested === "show") {
    return {
      text: `output style: ${current}\n` +
        `usage: /output-style [<${OUTPUT_STYLES.join("|")}>|show]\n` +
        (current === "default"
          ? "the default adds no block to the prompt — an unconfigured session is byte-identical to before B-7."
          : "the style is injected as a <system-reminder> below the cache boundary, so it never breaks the prefix cache."),
    };
  }
  if (!isOutputStyle(requested)) {
    return { text: `unknown style '${requested}' — expected one of: ${OUTPUT_STYLES.join(", ")}, show.` };
  }
  await deps.session.writeState(OUTPUT_STYLE_STATE_KEY, requested);
  return {
    text: `output style set to '${requested}' — it applies from the next /assistant turn ` +
      "(/clear restores 'default').",
  };
}
