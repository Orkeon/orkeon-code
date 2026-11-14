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
//     boot model;
//   - `llm.profile` wins: under a profile the loop does not send the override (the
//     profile names the model, and a decision profile's escalation target would get
//     it too), so `show` names the profile and a switch warns that it is not sent.
//
// Framework note (the B-10 verification step): `LlmConfigOverride` — the Domain
// cascade vehicle — carries ResponseFormat/Temperature/MaxTokens/TopP/Thinking/
// Cache and NO model field, so it is not the vehicle here. The options bag is,
// and it needed a framework fix to be usable at all: call-time settings used to
// be built from LlmConfig.Default() and REPLACE the provider's config wholesale,
// which dropped the API key. Patched in Orkeon.Scripting (JsLlmFacade.ConfigFrom).

import type { Chooser, Logger, ReasoningReader, SessionMetadata, SessionStore, Telemetry } from "../../../shared/application/ports.ts";
import { DEFAULT_EFFORT, EFFORT_LEVELS, providerEffort } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import { EFFORT_STATE_KEY, MODEL_PREFERENCE_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { readLlmProfile } from "../../../shared/application/llm-profile.ts";
import { judgeModelChoice, renderModelList } from "../../../shared/domain/model-catalog.ts";
import { NO_CATALOGUE_NOTE } from "../../../shared/domain/messages.ts";
import type { CommandView } from "../view.ts";
import { optionsOf } from "./choices.ts";
import { runEffort, storedEffortWarning } from "./effort.ts";
import {
  MODEL_CHOICE, MODEL_UNCHANGED, NO_EFFECTIVE_MODEL, OVERRIDE_CLEARED_NO_BOOT, declaredCatalogue, modelSet,
  modelSetUndeclared, modelSetWarned, modelShown, overrideCleared, overrideNotSent, profileNamesModel,
  profileWinsOverride,
} from "./messages.ts";

export interface ModelDeps {
  session: Pick<SessionStore, "readState" | "writeState">;
  telemetry: Pick<Telemetry, "readMetadata">;
  /** Where the session's `llm.profile` is read: under a profile, the override is not sent. */
  config: Pick<ConfigStore, "readValue" | "readFile">;
  log: Pick<Logger, "warn">;
  /** Where a bare /model opens a panel, when it can and there is something to pick. */
  chooser?: Chooser;
  /** What the model switched to makes of the effort /effort stored; absent: nothing is said of it. */
  reasoning?: ReasoningReader;
}

/** `text`, then the warning when the stored effort does not go as asked on the model the turns now run on. */
async function withEffortWarning(text: string, deps: ModelDeps): Promise<string> {
  const warning = await storedEffortWarning(deps);
  return warning === "" ? text : `${text}\n${warning}`;
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

/** `/model [show|list|reset|clear|<name>]`, from the command's raw tokens. */
export async function runModel(tokens: string[], deps: ModelDeps): Promise<CommandView> {
  const { session, telemetry, config, log } = deps;
  const first = (tokens[0] ?? "").toLowerCase();

  // `show` is explicit; a bare /model does the same thing.
  if (tokens.length === 0 || first === "show" || first === "list") {
    const [{ boot, declared }, pref, { profile }] = await Promise.all([
      readHostModels(telemetry),
      session.readState(MODEL_PREFERENCE_STATE_KEY).catch(() => null),
      readLlmProfile(config),
    ]);
    // Under a profile no declared model of the host is the effective one: the profile names its own.
    const effective = profile === null ? pref || boot : "";
    if (tokens.length === 0 && deps.chooser?.interactive && profile === null && declared.length > 0) {
      return pickModel(deps, deps.chooser, { declared, effective, boot, override: pref ?? "" });
    }
    const catalogue = renderModelList(declared, effective);

    // `/model list` is the catalogue alone — the question is "what can I pick".
    if (first === "list") {
      return { text: catalogue ? declaredCatalogue(catalogue) : NO_CATALOGUE_NOTE };
    }

    const override = pref ? (profile === null ? pref : overrideNotSent(pref)) : "(none)";
    return { text: modelShown(effectiveLine(effective, profile), boot, override, catalogue, NO_CATALOGUE_NOTE) };
  }

  if (first === "reset" || first === "clear") {
    await session.writeState(MODEL_PREFERENCE_STATE_KEY, "");
    const { boot } = await readHostModels(telemetry);
    return { text: await withEffortWarning(boot ? overrideCleared(boot) : OVERRIDE_CLEARED_NO_BOOT, deps) };
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
  const { profile } = await readLlmProfile(config);
  if (profile !== null) {
    // Stored all the same: it applies again once the profile is unset.
    const warning = profileWinsOverride(profile, requested);
    log.warn(warning);
    return { text: modelSetWarned(requested, warning) };
  }
  if (verdict.warning) {
    // Terse inline, full reason in the log: in the split-pane console the two land
    // in different panes, and repeating four lines verbatim next to themselves
    // trains the eye to skip them.
    return { text: await withEffortWarning(modelSetUndeclared(requested, declared), deps) };
  }
  return { text: await withEffortWarning(modelSet(requested), deps) };
}

/** The panel of a bare /model: the declared models, the effective one when the host does not declare it (Enter must
 *  not switch away from a model the list hides), the boot model when an override hides it, and the session's
 *  effort on the side arrows. Only what the answer changes is written, so opening it and pressing Enter turns no
 *  provider thinking on. */
async function pickModel(
  deps: ModelDeps,
  chooser: Chooser,
  { declared, effective, boot, override }: { declared: string[]; effective: string; boot: string; override: string },
): Promise<CommandView> {
  const effort = providerEffort(await deps.session.readState(EFFORT_STATE_KEY).catch(() => null)) ?? DEFAULT_EFFORT;
  const isDeclared = !effective || declared.some((name) => name.toLowerCase() === effective.toLowerCase());
  const answer = await chooser.choose({
    message: MODEL_CHOICE,
    options: [
      ...optionsOf(declared, effective),
      ...(isDeclared ? [] : [{ value: effective, current: true }]),
      ...(override ? [{ value: "reset", label: "Boot model", description: boot }] : []),
    ],
    control: { label: "Effort", values: EFFORT_LEVELS, value: effort },
  });
  if (!answer) return { text: MODEL_UNCHANGED };

  const texts: string[] = [];
  if (answer.value.toLowerCase() !== effective.toLowerCase()) {
    texts.push((await runModel([answer.value], { ...deps, chooser: undefined })).text ?? "");
  }
  if (answer.control && answer.control !== effort) {
    texts.push((await runEffort([answer.control], { session: deps.session, config: deps.config, reasoning: deps.reasoning })).text ?? "");
  }
  return { text: texts.length > 0 ? texts.join("\n") : MODEL_UNCHANGED };
}

/** The first line of `show`: the profile when one is set, else the effective model. */
function effectiveLine(effective: string, profile: string | null): string {
  if (profile !== null) return profileNamesModel(profile);
  return effective || NO_EFFECTIVE_MODEL;
}
