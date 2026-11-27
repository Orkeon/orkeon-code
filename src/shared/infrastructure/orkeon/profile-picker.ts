// ProfilePicker adapters over the runtime's System One pick (Orkeon #460, experimental ORKEXP008): for a command,
// the `pick` service of `ctx.services` (PickService of the CLI typings), looked up at each call since the service is
// bound to the run that got it; for a crew's body, `ctx.llm.pick`. Both answer `{ profile?: { value, reason, picked,
// probability } }`, and throw on an option they refuse (a ladder naming a profile the host does not declare, a floor
// above the ceiling). A host without the pick and a reply that does not read are null: a command's host that wires no
// System One pick serves no `pick` service, a crew's always has `ctx.llm.pick`, which then rejects with its own
// sentence (JsLlmFacade.Pick.cs), read as no pick. A cancelled call is null too, without a word: the run stops anyway,
// as a cancelled decision call reads as no answer. A refusal, and anything else thrown on the way (the lookup
// included), is `{ refused }` with its message: the port never throws. The runtime spells the host's default model
// `default` (the value of a pick whose fallback was left out); the port says null. Asked for a thinking level too
// (`effort`, in the same call), the reply's `effort` is read the same way; one that does not read is left out.
/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
import type { EffortPick, ProfilePick, ProfilePickRefusal, ProfilePicker } from "../../application/ports.ts";
import { NO_PICK_WIRED } from "./markers.ts";
import { isEffortLevel } from "../../domain/agent-policy/behavior-flags.ts";
import { EFFORT_PICK_REASONS, ROUTE_REASONS } from "../../domain/agents/model-route.ts";
import type { EffortBounds, EffortPickReason, RouteBounds, RouteReason } from "../../domain/agents/model-route.ts";
import type { ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";

/** The name of the pick service among a command's services. */
const PICK_SERVICE = "pick";
/** The runtime's name for the host's default model. */
const HOST_DEFAULT_PROFILE = "default";

/** A cancellation as the runtime passes it through: .NET's OperationCanceledException (its name, or its sentence once
 *  wrapped), or the DOM's abort. Not TaskCanceled: .NET raises it for an HTTP timeout too, which is a failure. */
const CANCEL_NAME = /^OperationCanceled(?:Exception)?$|^AbortError$/;
const CANCEL_MESSAGE = /\bOperationCanceledException\b|\bthe operation was cancell?ed\b/i;

type PickCall = (request: string, options: { profile: Record<string, unknown>; effort?: EffortBounds }) => unknown;

/** The options as the runtime takes them: the bounds left out stay out. */
function profileOptions(options: RouteBounds): Record<string, unknown> {
  const out: Record<string, unknown> = { ladder: [...options.ladder] };
  if (options.floor !== undefined) out.floor = options.floor;
  if (options.ceiling !== undefined) out.ceiling = options.ceiling;
  if (options.fallback !== undefined) out.fallback = options.fallback;
  return out;
}

/** The level answer of a reply; undefined when it holds none, or one that does not read. */
function effortOf(reply: unknown): EffortPick | undefined {
  const effort = (reply as { effort?: unknown } | null | undefined)?.effort as Record<string, unknown> | null | undefined;
  if (typeof effort !== "object" || effort === null) return undefined;
  const { value, reason, picked, probability } = effort;
  if ((value !== null && !isEffortLevel(value)) || !(EFFORT_PICK_REASONS as readonly unknown[]).includes(reason)) return undefined;
  return {
    value: value as EffortPick["value"],
    reason: reason as EffortPickReason,
    picked: typeof picked === "string" ? picked : null,
    probability: typeof probability === "number" ? probability : null,
  };
}

/** The profile answer of a reply, with its level answer when it holds one; null when it does not read. */
function answerOf(reply: unknown): ProfilePick | null {
  const profile = (reply as { profile?: unknown } | null | undefined)?.profile as Record<string, unknown> | null | undefined;
  if (typeof profile !== "object" || profile === null) return null;
  const { value, reason, picked, probability } = profile;
  if (typeof value !== "string" || !(ROUTE_REASONS as readonly unknown[]).includes(reason)) return null;
  const effort = effortOf(reply);
  return {
    value: value.trim().toLowerCase() === HOST_DEFAULT_PROFILE ? null : value,
    reason: reason as RouteReason,
    picked: typeof picked === "string" ? picked : null,
    probability: typeof probability === "number" ? probability : null,
    ...(effort === undefined ? {} : { effort }),
  };
}

/** The text of what a call threw: an Error's message, else the value as a string (a wrapped CLR exception). */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether what a call threw is the run's cancellation. */
function cancelled(error: unknown): boolean {
  const { name, clrType } = (typeof error === "object" && error !== null ? error : {}) as { name?: unknown; clrType?: unknown };
  return [name, clrType].some((n) => typeof n === "string" && CANCEL_NAME.test(n)) || CANCEL_MESSAGE.test(errorText(error));
}

/** What `find`'s call answers; `find` runs inside the guard, so a lookup that throws is a refusal like the call's.
 *  `noPick` says whether a rejection is the host's word that it wires no pick. */
async function asked(
  find: () => PickCall | null, request: string, options: RouteBounds, effort: EffortBounds | undefined,
  noPick: (error: unknown) => boolean = () => false,
): Promise<ProfilePick | ProfilePickRefusal | null> {
  try {
    const call = find();
    if (call === null) return null;
    return answerOf(await call(request, { profile: profileOptions(options), ...(effort === undefined ? {} : { effort: { ...effort } }) }));
  } catch (error) {
    return cancelled(error) || noPick(error) ? null : { refused: errorText(error) };
  }
}

/** Whether a rejection of `ctx.llm.pick` is the host's word that it wires no System One pick. */
function noPickWired(error: unknown): boolean {
  return errorText(error).includes(NO_PICK_WIRED);
}

/** The pick of a command: the `pick` service, when the host serves it. */
export function createServicesProfilePicker(services: Pick<ServiceLocator, "has" | "get">): ProfilePicker {
  const find = (): PickCall | null => {
    if (!services.has(PICK_SERVICE)) return null;
    const service = services.get<{ pick?: unknown } | null>(PICK_SERVICE);
    return typeof service?.pick === "function" ? (request, options) => (service.pick as PickCall).call(service, request, options) : null;
  };
  return { pick: (request, options, effort) => asked(find, request, options, effort) };
}

/** The pick of a crew's body: `ctx.llm.pick`, when the runtime gives it. */
export function createLlmProfilePicker(llm: Partial<Pick<LlmFacade, "pick">>): ProfilePicker {
  const find = (): PickCall | null => {
    const pick: unknown = (llm as Partial<Pick<LlmFacade, "pick">> | null | undefined)?.pick;
    return typeof pick === "function" ? (request, options) => (pick as PickCall).call(llm, request, options) : null;
  };
  return { pick: (request, options, effort) => asked(find, request, options, effort, noPickWired) };
}
