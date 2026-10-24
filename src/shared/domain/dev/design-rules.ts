// The design rules of the dev workflow: the 17 ids a plan classifies as applied or not
// applicable, and what each one asks, in this project's own words. The gate checks the
// ids; the planner's prompt reads the wording. Pure.

/** The 17 design-rule ids of the dev workflow, in order: DDD-01..DDD-11, APP-01..APP-05, PERF-01. */
export const DESIGN_RULE_IDS: readonly string[] = [
  "DDD-01", "DDD-02", "DDD-03", "DDD-04", "DDD-05", "DDD-06", "DDD-07", "DDD-08", "DDD-09", "DDD-10", "DDD-11",
  "APP-01", "APP-02", "APP-03", "APP-04", "APP-05", "PERF-01",
];

const KNOWN: ReadonlySet<string> = new Set(DESIGN_RULE_IDS);

export function isDesignRuleId(id: string): boolean {
  return KNOWN.has(id);
}

export type DesignRuleFamily = "DDD" | "APP" | "PERF";
export interface DesignRule {
  id: string;                // one of DESIGN_RULE_IDS
  family: DesignRuleFamily;
  behaviour: string;         // what the plan's code must do, one sentence
  appliesWhen: string;       // the situation that makes the id applicable
  records: string;           // what the sheet writes when the id applies
  notApplicableWhen: string; // the usual valid N/A reason, or "" when the id applies to every change it names
}

const rule = (
  id: string, family: DesignRuleFamily, behaviour: string, appliesWhen: string, records: string, notApplicableWhen: string,
): DesignRule => ({ id, family, behaviour, appliesWhen, records, notApplicableWhen });

/** The 17 rules in DESIGN_RULE_IDS order. */
export const DESIGN_RULES: readonly DesignRule[] = [
  rule("DDD-01", "DDD",
    "Code and tests speak the business: someone who knows the domain recognises every type, method and test name, and a purely mechanical name is not accepted",
    "something is added or renamed in the domain or application layer",
    "the sheet names the business terms introduced and the types that carry them",
    ""),
  rule("DDD-02", "DDD",
    "Each business rule has one guardian type, the one holding the data the rule is about; no other code can produce a state that breaks the rule",
    "a command alters business state",
    "the sheet names the guardian and the rule ids it guards",
    "no business state is altered"),
  rule("DDD-03", "DDD",
    "State moves only through methods named after what happens in the business; callers never write a field of the guardian",
    "a guardian's state moves",
    "the sheet names those methods",
    "no guardian's state moves"),
  rule("DDD-04", "DDD",
    "A value with constraints (an amount, an address, a range) is its own immutable type, built valid or not at all, and equal to any other with the same content",
    "a value carries a constraint of its own",
    "the sheet names the value type and its constraint",
    "the value is a plain primitive with no constraint"),
  rule("DDD-05", "DDD",
    "Guardians refer to one another through keys; one never carries another inside it",
    "one guardian has to point at another",
    "the sheet names the key and why it is followed",
    "no guardian points at another"),
  rule("DDD-06", "DDD",
    "Bringing something new into existence enforces its rules and may note the event; reloading stored data rebuilds it without judging it again",
    "an object is born, or reloaded from storage",
    "the sheet names the two entry points",
    "nothing is born or reloaded"),
  rule("DDD-07", "DDD",
    "What other parts are told is a named fact that already happened, carrying the data they need",
    "other parts are notified of a change",
    "the sheet names the fact and its data",
    "nobody is notified"),
  rule("DDD-08", "DDD",
    "A command persists the changes of one guardian; anything else it touches is only read, as narrowly as it can be",
    "something is persisted",
    "the sheet names the guardian persisted, and any second one with its business justification",
    "nothing is persisted"),
  rule("DDD-09", "DDD",
    "An operation lives where its data lives; a stand-alone service is the last resort, when no type can host it",
    "an operation has no obvious home, or a static helper looks easier",
    "the sheet names the hosting type",
    "the operation already has an obvious home"),
  rule("DDD-10", "DDD",
    "Domain code depends on nothing technical; storage, transport and frameworks are reached from outside it",
    "a domain file changes",
    "the sheet names the dependency kept outside",
    "no domain file changes"),
  rule("DDD-11", "DDD",
    "Something that may be missing is modelled as such — an empty collection, a dedicated \"none\" value, an optional business field — never by a stray null",
    "a domain or application input, field or result may be missing",
    "the sheet names the chosen form",
    "nothing can be missing"),
  rule("APP-01", "APP",
    "A use case coordinates — fetch, hand over to the domain, persist, answer — and decides nothing itself",
    "a use case or application service is added or changed",
    "the sheet names the coordination steps and where each decision lives",
    "the use case only fetches and answers"),
  rule("APP-02", "APP",
    "Each input or output need is an interface defined next to the code that consumes it; adapters plug into it from outside",
    "a new input or output need appears",
    "the sheet names the interface, its consumer and its adapter",
    "no new input or output need appears"),
  rule("APP-03", "APP",
    "A store handles one guardian type and converts its storage errors into errors the domain knows",
    "how a guardian is stored changes",
    "the sheet names the type, its save and load paths and the error mapping",
    "storage is not touched"),
  rule("APP-04", "APP",
    "Commands, endpoints and adapters translate formats and pass on; no business decision is taken there",
    "an entry point or an adapter changes",
    "the sheet names where the translation sits",
    "no entry point or adapter changes"),
  rule("APP-05", "APP",
    "Every limit (a size, a rate, a count, an unbounded read) has one defining place and is reused from there",
    "a limit or an unbounded read is involved",
    "the sheet names the limit and its home",
    "no limit is involved"),
  rule("PERF-01", "PERF",
    "A behaviour's input and output calls are a known constant, not proportional to its input; no such call sits in a loop over input items",
    "a use case or an adapter changes",
    "the sheet names the reads and writes per call",
    "the plan states and justifies an unbounded cost"),
];
