// The words of the plan's JSON schema the model reads: what each field holds, in a few words (ADR 0026). The runtime
// prints the schema whole after the prompt; plan-answer.ts builds it from these.

export const PLAN_FIELDS = {
  feature: (max: number): string => `Max ${max} chars`,
  layers: "Folders touched",
  reuse: "I<n> refs alone",
  assumptions: "Assumed, never an open question answered",
  naReason: (min: number): string => `Stands alone, min ${min} chars`,
  nonApplicable: "Rules no batch applies",
  owners: "Type or member names, never a path",
  traceability: "One row per source id",
  designIds: "Source UC/BR/CH ids",
  designBatch: "1-based batch",
  intent: "What it delivers",
  reason: "Why it is cut here",
  documentation: "Docs alone, no code",
  dependsOn: "F<n> of earlier batches, n its place from 1",
  accessCost: "Storage or network reached",
  batchDesign: "All written; a sentence if none applies",
  decisions: "Choices made, why",
  declarative: "Pure declarations, no test of their own",
  stepTitle: (max: number): string => `Behaviour, max ${max} chars`,
  testName: (max: number): string => `As the repository names tests, unique, max ${max} chars`,
  level: "pinned: one the brief pins",
  testIds: "UC/BR/CH ids it proves",
  covers: "U<n> rows characterised",
  note: "Empty or 2 lines: merged cycle, container",
  anchors: "Files filled or created. kind ref: a shown entry, I<n> in ref; create: a new file, existing: an unindexed one, " +
    "both by relative path; member: the one filled, omitted if new",
  steps: "Behaviour steps; code adds the build",
  buildScope: "Scope of the build step code adds",
  notRun: "Not run, why",
  testPolicy: "Sheet test policy, a sentence each",
  signature: (max: number): string => `Max ${max} chars, never a body`,
  rule: "What it does or gains",
  batches: (max: number): string => `At most ${max}, cut by behaviour`,
  answer: "Text fields: one line (a note two), no |; no backtick in a test name, project, path, member or owner; " +
    "no line opens with #, TDD:, |, - [ or >",
} as const;

// The inventory lines the planner's prompt shows when the index found nothing, or when entries were left out.
export const INVENTORY_EMPTY = "(the code index holds no symbol for these titles)";
export const entriesLeftOut = (left: number): string => `… ${left} entries left out: they cannot be anchors`;
