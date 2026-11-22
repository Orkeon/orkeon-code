// The values the Orkeon adapters write and read back: the human_input answers that came from no person, and the
// runtime's sentences an adapter recognises.

/** The default value no option holds: an answer equal to it came from no person. */
export const NO_ANSWER = "(no answer)";
/** The first option of a `multi`: picked by the auto-approver, it decides nothing. */
export const DECIDE_LATER = "Decide later";
/** What a crew's `ctx.llm.pick` rejects with on a host that wires no System One pick (Orkeon JsLlmFacade.Pick.cs). */
export const NO_PICK_WIRED = "ctx.llm.pick: this host wires no System One pick";
