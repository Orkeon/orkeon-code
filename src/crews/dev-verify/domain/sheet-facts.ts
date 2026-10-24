// The facts the gate reads off a batch sheet now live in the shared dev domain, so that
// /dev-plan's self-check reads them the same way; this module keeps the old import path.
export { sheetFacts } from "../../../shared/domain/dev/sheet-facts.ts";
export type { SheetFacts } from "../../../shared/domain/dev/sheet-facts.ts";
