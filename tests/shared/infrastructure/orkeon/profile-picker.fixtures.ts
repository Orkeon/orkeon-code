// The ProfilePicker adapters over a FakePickService: served as a command's `pick` service, or as a crew's
// `ctx.llm.pick`.
import type { RouteBounds } from "../../../../src/shared/domain/agents/model-route.ts";
import { createLlmProfilePicker, createServicesProfilePicker } from "../../../../src/shared/infrastructure/orkeon/profile-picker.ts";
import { FakePickService } from "../../../support/doubles/fake-pick-service.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";

export const REQUEST = "Run the crew 'dev-plan' of a coding assistant for this command of its user:\n/dev-plan x";
export const OPTIONS: RouteBounds = { ladder: ["small", "large"], ceiling: "large", fallback: "large" };

/** A command's services that serve the pick, and the picker over them. */
export function pickerOverServices() {
  const service = new FakePickService();
  const services = new FakeServiceLocator();
  services.services.set("pick", service);
  return { service, services, picker: createServicesProfilePicker(services) };
}

/** A crew's `ctx.llm` whose `pick` is the fake's, and the picker over it. */
export function pickerOverLlm() {
  const service = new FakePickService();
  return { service, picker: createLlmProfilePicker(service) };
}

/** The bounds of a session on the top rung under a rule: every one of them given. */
export const ALL_BOUNDS: RouteBounds = { ladder: ["small", "medium", "large"], floor: "medium", ceiling: "large", fallback: "large" };

/** What the runtime throws on a ladder that names a profile the host does not declare. */
export const REFUSED_LADDER = "services.get(\"pick\").pick { profile.ladder } profile.ladder names the LLM profile 'tiny', which this host does not offer. Known profiles: default, small, large. A profile is defined by the host under Llm:Profiles:<name>.";
/** What the runtime throws on a floor above the ceiling. */
export const REFUSED_FLOOR = "ctx.llm.pick { profile.floor } 'large' is above the ceiling 'small' on the ladder (small, large)";
/** The part of the options a refusal names, by the option the runtime writes after what was called. */
export const REFUSED_PARTS: readonly { readonly name: string; readonly message: string; readonly part: "profile" | "effort" | undefined }[] = [
  {
    name: "tells a refusal of the level part",
    message: "services.get(\"pick\").pick { effort } leaves no level of Orkeon:Decision:Effort:Levels (medium, high) between min '(none)' and max 'low'.",
    part: "effort",
  },
  { name: "tells a refusal of a bound of the level", message: "ctx.llm.pick { effort.max } 'huge' is not a thinking level: write one of low, medium, high.", part: "effort" },
  { name: "tells a refusal of a bound of the profile", message: REFUSED_LADDER, part: "profile" },
  { name: "names no part for a refusal of the options as a whole", message: "ctx.llm.pick { options } takes { profile?, effort? }: give one of them, or both.", part: undefined },
  { name: "names no part for a failure that names no option", message: "the services of this run are gone", part: undefined },
  { name: "tells a refusal of the fallback of the profile from a command", message: "services.get(\"pick\").pick { profile.fallback } profile.fallback names the LLM profile 'ghost', which this host does not offer. Known profiles: default, small, large. A profile is defined by the host under Llm:Profiles:<name>.", part: "profile" },
  { name: "tells a refusal of the floor of the level from a crew", message: "ctx.llm.pick { effort.min } 'huge' is not a thinking level.", part: "effort" },
  { name: "tells a refusal of the ceiling of the profile from a crew", message: "ctx.llm.pick { profile.ceiling } 'xl' is not a rung of the ladder (small, large).", part: "profile" },
  { name: "names no part for an option named with no pick before it", message: "{ effort } leaves no level between min '(none)' and max 'low'.", part: undefined },
  { name: "names no part for an option named after a word that ends in pick", message: "repick { effort } leaves no level.", part: undefined },
  { name: "names no part for an option whose name only starts with a part's", message: "ctx.llm.pick { effortless } is not an option.", part: undefined },
  { name: "names no part for an option with a name under a part's that is no word", message: "ctx.llm.pick { profile.ladder2 } is not an option.", part: undefined },
  { name: "names no part for a bound named two levels down", message: "ctx.llm.pick { effort.max.value } is not an option.", part: undefined },
];
/** What a locator throws when it is used outside the run that got it. */
export const LOCATOR_GONE = "the services of this run are gone";

/** What a crew's `ctx.llm.pick` rejects with on a host that wires no System One pick, as the CLR wrapper reads. */
export const NO_PICK_WIRED = "System.AggregateException: One or more errors occurred. (ctx.llm.pick: this host wires no System One pick " +
  "(ISystemOnePicker); run the script under orkeon run, orkeon-repl, orkeon-host or mcp serve --crew.)";

/** A plain Error whose name is `name`. */
function named(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** The shapes a cancelled pick rejects with: all read as no pick, without a refusal. */
export const CANCELLATIONS: readonly { readonly name: string; readonly failure: unknown }[] = [
  { name: "answers nothing when the call is cancelled, named OperationCanceledException", failure: named("OperationCanceledException", "The operation was canceled.") },
  { name: "answers nothing when the call is aborted", failure: named("AbortError", "This operation was aborted") },
  { name: "answers nothing when a wrapped CLR cancellation rejects", failure: { toString: () => "System.OperationCanceledException: The operation was canceled." } },
  { name: "answers nothing when the cancellation carries its CLR type", failure: Object.assign(new Error("stopped"), { clrType: "OperationCanceledException" }) },
];

/** A crew's `ctx.llm` whose `pick` cannot even be read. */
export function llmWhosePickThrows(): Parameters<typeof createLlmProfilePicker>[0] {
  return Object.defineProperty({}, "pick", { get: () => { throw new Error(LOCATOR_GONE); } });
}

/** The spellings of the runtime's default profile, all read as the host's default model. */
export const DEFAULT_SPELLINGS: readonly string[] = ["default", "Default", " default "];

/** A reply whose pick and probability are not what the runtime documents: both read as absent. */
export const MISTYPED_PICK = { profile: { value: "small", reason: "model", picked: 3, probability: "0.9" } };

export const MODEL_PICK = { value: "small", reason: "model", picked: "small", probability: 0.9 };

/** Replies of the runtime that read as no answer. */
export const UNREAD: readonly { readonly name: string; readonly reply: unknown }[] = [
  { name: "answers nothing when the reply has no profile part", reply: {} },
  { name: "answers nothing when the reason is not one of the pick's", reply: { profile: { value: "small", reason: "guess", picked: null, probability: null } } },
  { name: "answers nothing when the value is not a name", reply: { profile: { value: 3, reason: "model", picked: null, probability: null } } },
  { name: "answers nothing when the reply is empty", reply: undefined },
];

/** A reply that answers the profile and, in the same call, the thinking level. */
export const LEVEL_REPLY = {
  profile: { value: "small", reason: "model", picked: "small", probability: 0.9 },
  effort: { value: "low", reason: "model", picked: "low", probability: 0.8 },
};
export const MODEL_PICK_WITH_LEVEL = { ...MODEL_PICK, effort: { value: "low", reason: "model", picked: "low", probability: 0.8 } };

/** The effort parts of a reply that read, and the answer the pick makes of them. */
export const READ_LEVELS: readonly { readonly name: string; readonly effort: unknown; readonly answer: unknown }[] = [
  {
    name: "reads a level the pick was not sure of, with its reason, pick and probability",
    effort: { value: null, reason: "low-confidence", picked: "low", probability: 0.4 },
    answer: { ...MODEL_PICK, effort: { value: null, reason: "low-confidence", picked: "low", probability: 0.4 } },
  },
  {
    name: "reads a level whose probability is no number without a probability",
    effort: { value: "low", reason: "model", picked: "low", probability: "0.8" },
    answer: { ...MODEL_PICK, effort: { value: "low", reason: "model", picked: "low", probability: null } },
  },
];

/** The effort parts of a reply that do not read: the profile is answered without a level. */
export const UNREAD_LEVELS: readonly { readonly name: string; readonly effort: unknown }[] = [
  { name: "leaves out a level that is none of the runtime's", effort: { value: "extreme", reason: "model", picked: null, probability: null } },
  { name: "leaves out a level whose reason is not one of the pick's", effort: { value: "low", reason: "guess", picked: null, probability: null } },
  { name: "leaves out an effort part that is no object", effort: "low" },
];
