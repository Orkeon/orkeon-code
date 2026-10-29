// The session-default permission mode: the mode a prompt runs in when it carries
// no explicit "mode:" prefix, persisted in the session state bag (survives crew
// runs; /clear restores "default"). /mode cycles, shows or sets it; typed by its
// alias /plan, it toggles it in and out of plan.

import type { Logger } from "../../../shared/application/ports.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { PERMISSION_MODES, isPermissionMode, getNextPermissionMode } from "../../../shared/domain/permission-modes.ts";
import { DEFAULT_MODE_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { policyFor } from "../../../shared/domain/agent-policy/mode-policy.ts";
import type { CommandView } from "../view.ts";

export interface ModeDeps {
  session: Pick<SessionIo, "resolveEffectiveSessionMode" | "readState" | "writeState">;
  log: Pick<Logger, "info">;
}

/** Persist + announce a mode transition; logs the read-only catalogue strip (E-12). */
async function applyMode(deps: ModeDeps, next: string, how: string): Promise<CommandView> {
  await deps.session.writeState(DEFAULT_MODE_STATE_KEY, next);
  if (policyFor(next).readOnly) {
    deps.log.info(`entering '${next}': the edit, network and shell tools stripped from the catalogue`);
  }
  return {
    text: `session default permission mode ${how} '${next}' ` +
      `(prompts without a "mode:" prefix now run in it; /clear restores 'default').`,
  };
}

/** `/mode [<mode>|show]`, from the command's raw tokens. No argument CYCLES to the
 *  next mode (E-12 — the original's Shift+Tab rotation); `show` displays without
 *  changing. Typed by its alias (`typed` "plan"), it toggles plan mode instead. */
export async function runMode(tokens: string[], deps: ModeDeps, typed = "mode"): Promise<CommandView> {
  if (typed === "plan") return runPlanToggle(deps);
  const requested = (tokens[0] ?? "").trim();
  if (!requested) {
    // E-12: bare /mode cycles default → acceptEdits → plan → bypassPermissions.
    // B-2: cycling starts from the EFFECTIVE mode, fallback included, so the
    // first press moves from what the session is actually running.
    const { mode: current } = await deps.session.resolveEffectiveSessionMode();
    return applyMode(deps, getNextPermissionMode(current), `cycled ${current} →`);
  }
  if (requested === "show") {
    const { mode: current, via } = await deps.session.resolveEffectiveSessionMode();
    return {
      text: `session default permission mode: ${current}\n` +
        `  ↳ ${via}\n` +
        `usage: /mode [<${PERMISSION_MODES.join("|")}>|show] — bare /mode cycles; ` +
        `an explicit "mode:" prefix on a prompt still wins.`,
    };
  }
  if (!isPermissionMode(requested)) {
    return { text: `unknown mode '${requested}' — expected one of: ${PERMISSION_MODES.join(", ")}, show.` };
  }
  return applyMode(deps, requested, "set to");
}

// ── /plan — a TOGGLE, as the baseline specifies ───────────────────────────

/** `/plan`: plan mode flipped and persisted, the catalogue strip or the way back logged. */
async function runPlanToggle(deps: ModeDeps): Promise<CommandView> {
  const current = await deps.session.readState(DEFAULT_MODE_STATE_KEY).catch(() => null);
  const { mode, entering } = togglePlanMode(current);
  await deps.session.writeState(DEFAULT_MODE_STATE_KEY, mode);
  if (entering) {
    deps.log.info("entering 'plan': the edit, network and shell tools stripped from the catalogue");
    return { text: "plan mode ON — prompts without a \"mode:\" prefix now run read-only. /plan again to leave." };
  }
  deps.log.info("leaving 'plan': session default back to 'default' (asks on writes)");
  return {
    text: "plan mode OFF — the session default is 'default' (asks on writes). " +
      "It is NOT restored to whatever it was before /plan: use /mode to pick another.",
  };
}

/**
 * `/plan` flips plan mode; it does not only enter it.
 *
 * Baseline 04 §/plan: "Toggle plan mode … flip the boolean, persist the new
 * value". The pre-B-11 handler wrote "plan" unconditionally, so `/plan` twice left
 * the session read-only and the only way out was `/mode` or `/clear` —
 * with the command still reporting success both times.
 *
 * Leaving plan returns to `default`, not to whatever preceded it: the mode before
 * could have been `bypassPermissions`, and silently restoring that on a second
 * `/plan` would hand back write access nobody asked for on that keystroke.
 */
export function togglePlanMode(currentMode: unknown): { mode: string; entering: boolean } {
  const entering = String(currentMode ?? "").trim() !== "plan";
  return { mode: entering ? "plan" : "default", entering };
}
