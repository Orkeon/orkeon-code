// /model (E-1, hot-swap since B-10) — show the active model, or switch the model
// used by subsequent turns WITHOUT relaunching (baseline 04 §/model).
//
// How it works, and why the old deviation is gone. The provider still binds at
// host startup, so there is no second provider to switch to; what changed is that
// the loop now passes the preference to `ctx.llm.act` as `{ llm: { model } }`,
// which the scripting facade applies as a PATCH on the provider's own
// configuration. Credentials, endpoint and timeout are inherited; only the model
// name changes, for that call.
//
// Two limits, stated rather than discovered:
//   - the override travels over the SAME provider, so it can only name a model
//     that provider serves ('claude-…' on a DeepSeek endpoint is a 4xx from the
//     API, not a local error);
//   - the preference is session state, so /clear drops it back to the
//     boot model.
//
// Framework note (the B-10 verification step): `LlmConfigOverride` — the Domain
// cascade vehicle — carries ResponseFormat/Temperature/MaxTokens/TopP/Thinking/
// Cache and NO model field, so it is not the vehicle here. The options bag is,
// and it needed a framework fix to be usable at all: call-time settings used to
// be built from LlmConfig.Default() and REPLACE the provider's config wholesale,
// which dropped the API key. Patched in Orkeon.Scripting (JsLlmFacade.ConfigFrom).

import type { Logger, SessionMetadata, SessionStore, Telemetry } from "../../shared/application/ports.ts";
import { MODEL_PREFERENCE_STATE_KEY } from "../../shared/domain/session-keys.ts";
import {
  judgeModelChoice, renderModelList, NO_CATALOGUE_NOTE,
} from "../../shared/domain/model-catalog.ts";
import type { CommandView } from "./view.ts";

export interface ModelDeps {
  session: Pick<SessionStore, "readState" | "writeState">;
  telemetry: Pick<Telemetry, "readMetadata">;
  log: Pick<Logger, "warn">;
}

/**
 * What the host reports as the active model, or "" when it reports nothing.
 *
 * `session_store get_metadata` is the ONLY channel a script has for this. It used
 * to be empty in every host: `AddOrkeonSessionTools` registered the buffer as
 * `new InMemorySessionBufferService()` and never passed the constructor's optional
 * model, so `SessionMetadata.Model` was always null. Fixed framework-side; the
 * empty case survives here because a host may still register no provider at all,
 * and that case must be SAID rather than dressed up as a reading — the old
 * "(unknown — reported by provider config)" claimed the provider had been asked.
 */
async function readHostModels(telemetry: ModelDeps["telemetry"]): Promise<{ boot: string; declared: string[] }> {
  const md = await telemetry.readMetadata().catch((): SessionMetadata => ({}));
  return {
    boot: (md.model ?? "").trim(),
    // `Llm:AvailableModels` — what this host DECLARES the provider serves.
    declared: md.availableModels ?? [],
  };
}

export const NO_MODEL_REPORTED =
  "not reported by the host — no LLM provider is registered, or the host predates the " +
  "session-metadata fix. Turns will no-op: check that the settings file has an `Llm` section.";

/** `/model [show|list|reset|clear|<name>]`, from the command's raw tokens. */
export async function runModel(tokens: string[], deps: ModelDeps): Promise<CommandView> {
  const { session, telemetry, log } = deps;
  const first = (tokens[0] ?? "").toLowerCase();

  // `show` is explicit; a bare /model does the same thing.
  if (tokens.length === 0 || first === "show" || first === "list") {
    const [{ boot, declared }, pref] = await Promise.all([
      readHostModels(telemetry),
      session.readState(MODEL_PREFERENCE_STATE_KEY).catch(() => null),
    ]);
    const effective = pref || boot;
    const catalogue = renderModelList(declared, effective);

    // `/model list` is the catalogue alone — the question is "what can I pick".
    if (first === "list") {
      return { text: catalogue ? `declared models (* = effective):\n${catalogue}` : NO_CATALOGUE_NOTE };
    }

    return {
      text: `effective model for the next turn: ${effective || "(none — see below)"}\n` +
        `  boot model      : ${boot || NO_MODEL_REPORTED}\n` +
        `  session override: ${pref || "(none)"}\n` +
        (catalogue ? `declared models (* = effective):\n${catalogue}\n` : `declared models: ${NO_CATALOGUE_NOTE}\n`) +
        "usage: /model <name> | /model list | /model reset | /model show",
    };
  }

  if (first === "reset" || first === "clear") {
    await session.writeState(MODEL_PREFERENCE_STATE_KEY, "");
    const { boot } = await readHostModels(telemetry);
    return {
      text: boot
        ? `model override cleared — turns go back to ${boot}.`
        : `model override cleared. Boot model: ${NO_MODEL_REPORTED}`,
    };
  }

  const requested = tokens.join(" ").trim();
  // Checked against the declared list BEFORE writing, and applied either way: the
  // list is a settings-file hint that may lag the provider, so refusing on it would
  // block a model that works. The warning is the whole value here — without it the
  // mistake surfaces one turn later as an API error buried in the log.
  const { declared } = await readHostModels(telemetry);
  const verdict = judgeModelChoice(declared, requested);
  if (verdict.warning) log.warn(verdict.warning);
  await session.writeState(MODEL_PREFERENCE_STATE_KEY, requested);
  if (verdict.warning) {
    // Terse inline, full reason in the log: in the split-pane console the two land
    // in different panes, and repeating four lines verbatim next to themselves
    // trains the eye to skip them.
    return {
      text: `model set to '${requested}' — ⚠ NOT among the models this host declares ` +
        `(${declared.join(", ")}). Applied anyway; see the log. /model list to review.`,
    };
  }
  return {
    text: `model set to '${requested}' — it applies from the next /assistant turn, no relaunch.\n` +
      "It travels over the configured provider, so it must be a model that provider serves; " +
      "/clear (or /model reset) returns to the boot model.",
  };
}
