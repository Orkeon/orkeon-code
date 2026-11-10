// The messages of dev-plan's domain: the problems the check of a plan answer reports, which the model reads back on a
// re-ask and the person in the refusal, and the sentences of a rendered plan that are not format literals (ADR 0026).

// ── The shape of a plan answer ──────────────────────────────────────────

export const missingOrNot = (field: string, what: string): string => `${field} is missing or not ${what}`;
export const ANCHOR_KINDS = "one of ref, create, existing";
export const TEST_LEVELS = "one of unit, integration, pinned";
export const ELEMENT_LAYERS = "one of domain, application, adapter, test";
export const DESIGN_RULE_ID = "design rule id";
export const NOT_AN_OBJECT = "the answer is not an object";
export const moreProblems = (count: number): string => `… ${count} more problems`;

// ── The cells ───────────────────────────────────────────────────────────

export const holdsCodeBreak = (head: string): string => `${head} holds a |, a backtick or a line break`;
export const holdsBreak = (head: string): string => `${head} holds a | or a line break`;
export const holdsLabel = (head: string): string => `${head} holds the label Applied rules or Non-applicable rules`;
export const startsWithMarker = (head: string): string => `${head} starts a line with one of #, TDD:, |, - [, >`;

// ── The anchors and the steps ───────────────────────────────────────────

export const refAnchorNeedsRef = (at: string): string => `${at}: a ref anchor needs a ref only`;
export const anchorNotShown = (at: string, ref: string): string => `${at}: anchor ${ref} is not an inventory entry shown`;
export const anchorNeedsPath = (at: string, kind: string): string =>
  `${at}: ${kind === "existing" ? "an" : "a"} ${kind} anchor needs a path only`;
export const cannotBeAnchored = (at: string, path: string): string => `${at}: ${path} cannot be anchored there`;
export const anchorPathColon = (at: string, path: string): string => `${at}: anchor path "${path}" holds ":"`;
export const inInventory = (at: string, path: string): string => `${at}: ${path} is in the inventory: use its ref`;
export const titleEmpty = (at: string): string => `${at}: the title is empty`;
export const titleTooLong = (at: string, max: number): string => `${at}: the title is longer than ${max} characters`;
export const titleIsBuildStep = (at: string, build: string): string => `${at}: the title is ${build}, the step code adds`;
export const titleRepeats = (at: string, step: number): string => `${at}: the title repeats step ${step}`;
export const noTest = (at: string): string => `${at}: no test`;
export const nameEmpty = (at: string): string => `${at}: the name is empty`;
export const nameTooLong = (at: string, max: number): string => `${at}: the name is longer than ${max} characters`;
export const projectEmpty = (at: string): string => `${at}: the project is empty`;
export const notSourceId = (at: string, id: string): string => `${at}: ${id} is not an id of the source`;
export const notUnpinnedRow = (at: string, row: string): string => `${at}: ${row} is not an unpinned row`;
export const namesNoId = (at: string): string => `${at}: names no id`;
export const memberIsNot = (at: string, ref: string | undefined, member: string, name: string): string =>
  `${at}: anchor ${ref}: member "${member}" is not ${name}; leave member out to add a member to it`;
export const noTestAnchor = (at: string): string => `${at}: no test anchor`;
export const noProductionAnchor = (at: string): string => `${at}: no production anchor`;

// ── The batches ─────────────────────────────────────────────────────────

export const fieldEmpty = (at: string, field: string): string => `${at}: ${field} is empty`;
export const stepCount = (at: string, count: number): string =>
  `${at}: ${count} behaviour steps; 2 to 5 (1 to 5 for documentation)`;
export const notDesignRuleId = (at: string, id: string): string => `${at}: ${id} is not a design rule id`;
export const notEarlierBatch = (at: string, dep: string): string => `${at}: depends on ${dep}, which is not an earlier batch`;
export const docsAndCode = (at: string): string => `${at}: documentation and code in one batch`;
export const noCodeElement = (at: string): string => `${at}: no code element`;
export const elementTooLong = (at: string, k: number, max: number): string => `${at}: element ${k} is longer than ${max} characters`;
export const elementHoldsBody = (at: string, k: number): string => `${at}: element ${k} holds a body`;

// ── The traceability, the design rules, the shared anchors, a change ───

export const noTestCarries = (id: string): string => `${id}: no test carries it`;
export const ownerIsPath = (owner: string): string => `traceability: owner "${owner}" is a path, name the type or member`;
export const traceNotSourceId = (id: string): string => `traceability: ${id} is not an id of the source`;
export const traceTwice = (id: string): string => `traceability: ${id} appears twice`;
export const noCodeOwner = (id: string): string => `${id}: no code owner`;
export const appliedAndNa = (id: string): string => `${id}: applied and non-applicable`;
export const neitherAppliedNorNa = (id: string): string => `${id}: neither applied nor non-applicable`;
export const naTwice = (id: string): string => `${id}: non-applicable twice`;
export const naWithoutReason = (id: string): string => `${id}: N/A without a reason`;
export const shareUnordered = (first: string, second: string, path: string): string =>
  `${first} and ${second} share ${path} and neither depends on the other`;
export const pinnedNotInPlan = (name: string): string => `pinned test ${name} is not in the plan`;
export const noCharacterisation = (row: string): string => `${row}: no characterisation test`;
export const notInFirstStep = (row: string): string => `${row}: its test is not in the first step`;

// ── The plan's own fields ───────────────────────────────────────────────

export const FEATURE_EMPTY = "feature is empty";
export const featureTooLong = (max: number): string => `feature is longer than ${max} characters`;
export const LAYERS_EMPTY = "layers is empty";
export const batchCount = (max: number, count: number): string => `between 1 and ${max} batches, not ${count}`;
export const nameRepeats = (at: string, first: string): string => `${at}: the name repeats ${first}`;
export const reuseNotShown = (ref: string): string => `reuse: ${ref} is not an inventory entry shown`;
export const notBatchOfPlan = (row: string, batch: number): string => `${row}: batch ${batch} is not a batch of the plan`;

// ── The sentences of a rendered plan ───────────────────────────────────

export const TDD_PREAMBLE = [
  "Tests lead: a step's production code starts only once its tests exist and fail. Within the step, write the",
  "passing path first, then the refusals, then the integration checks.",
];
export const DECLARATIVE_LEAD = "Pure declarations left without a test of their own (each one exercised by the test of its behaviour)";
export const BUILD_STEP_BODY = "No test of its own: it runs the scopes of `## Test policy and scopes`.";
export const ANCHORS_LEAD = "Paths copied by the implementation step; an existing one carries the line of the member it names, from the inventory of the plan run.";
export const MAJOR_TAIL = "Not settled by the plan run: answer it here before the first failing test of the step it concerns.";
export const NO_PACK_TAIL = " — no repository pack: add .orkeon/repo.yaml";
export const NOT_IN_THE_PACK = "(not in the pack)";
export const blockedByQuestion = (n: number, prefix: string, date: string): string =>
  `- Blocked by question ${n} of ${prefix}-PLAN.md § 4 (${date})`;
export const reviewMajor = (date: string, question: string, evidence: string): string =>
  `- ${date} — review (Major): ${question} Evidence: ${evidence}. ${MAJOR_TAIL}`;

// ── The anchor paths against the repository ────────────────────────────

export const notCheckedFolders = (at: string, path: string, max: number): string =>
  `${at}: anchor "${path}" not checked: more than ${max} folders`;
export const notCheckedEntries = (at: string, path: string, cap: number): string =>
  `${at}: anchor "${path}" not checked: its folder lists more than ${cap} entries`;
export const doesNotExist = (at: string, path: string): string => `${at}: ${path} does not exist`;
export const existsAnchorIt = (at: string, path: string): string => `${at}: ${path} exists: anchor it as existing, or by its ref`;
