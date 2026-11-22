// ProfilePicker adapters over the runtime's System One pick (Orkeon #460, experimental ORKEXP008): for a command,
// the `pick` service of `ctx.services` (PickService of the CLI typings), looked up at each call since the service is
// bound to the run that got it; for a crew's body, `ctx.llm.pick`. Both answer `{ profile?: { value, reason, picked,
// probability } }`, and throw on an option they refuse (a ladder naming a profile the host does not declare, a floor
// above the ceiling): a host without the pick, a refusal, a throw and a reply that does not read are all null. The
// runtime spells the host's default model `default` (the value of a pick whose fallback was left out); the port says
// null.
import type { ProfilePick, ProfilePickOptions, ProfilePicker } from "../../application/ports.ts";
import type { RouteReason } from "../../domain/agents/model-route.ts";
import type { ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";

/** The name of the pick service among a command's services. */
export const PICK_SERVICE = "pick";
/** The runtime's name for the host's default model. */
export const HOST_DEFAULT_PROFILE = "default";

const REASONS: readonly RouteReason[] = ["model", "low-confidence", "no-answer", "circuit-off", "no-ladder", "floor", "ceiling"];

type PickCall = (request: string, options: { profile: Record<string, unknown> }) => unknown;

/** The options as the runtime takes them: the bounds left out stay out. */
function profileOptions(options: ProfilePickOptions): Record<string, unknown> {
  const out: Record<string, unknown> = { ladder: [...options.ladder] };
  if (options.floor !== undefined) out.floor = options.floor;
  if (options.ceiling !== undefined) out.ceiling = options.ceiling;
  if (options.fallback !== undefined) out.fallback = options.fallback;
  return out;
}

/** The profile answer of a reply; null when it does not read. */
function answerOf(reply: unknown): ProfilePick | null {
  const profile = (reply as { profile?: unknown } | null | undefined)?.profile as Record<string, unknown> | null | undefined;
  if (typeof profile !== "object" || profile === null) return null;
  const { value, reason, picked, probability } = profile;
  if (typeof value !== "string" || !REASONS.includes(reason as RouteReason)) return null;
  return {
    value: value.trim().toLowerCase() === HOST_DEFAULT_PROFILE ? null : value,
    reason: reason as RouteReason,
    picked: typeof picked === "string" ? picked : null,
    probability: typeof probability === "number" ? probability : null,
  };
}

async function asked(call: PickCall | null, request: string, options: ProfilePickOptions): Promise<ProfilePick | null> {
  if (call === null) return null;
  try {
    return answerOf(await call(request, { profile: profileOptions(options) }));
  } catch {
    return null;
  }
}

/** The pick of a command: the `pick` service, when the host serves it. */
export function createServicesProfilePicker(services: Pick<ServiceLocator, "has" | "get">): ProfilePicker {
  const call = (): PickCall | null => {
    try {
      if (!services.has(PICK_SERVICE)) return null;
      const service = services.get<{ pick?: unknown } | null>(PICK_SERVICE);
      return typeof service?.pick === "function" ? (request, options) => (service.pick as PickCall).call(service, request, options) : null;
    } catch {
      return null;
    }
  };
  return { pick: (request, options) => asked(call(), request, options) };
}

/** The pick of a crew's body: `ctx.llm.pick`, when the runtime gives it. */
export function createLlmProfilePicker(llm: object): ProfilePicker {
  const call = (): PickCall | null => {
    const pick = (llm as { pick?: unknown } | null | undefined)?.pick;
    return typeof pick === "function" ? (request, options) => (pick as PickCall).call(llm, request, options) : null;
  };
  return { pick: (request, options) => asked(call(), request, options) };
}
