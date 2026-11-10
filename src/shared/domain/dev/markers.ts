// The markers of the dev workflow's files: the headings, verdict words and lines a prompt or a renderer writes and
// a parser of shared/domain/dev reads back (ADR 0026).

// ── Open questions and decisions ────────────────────────────────────────────

export const OPEN_QUESTIONS_HEADER = ["| # | Severity | Question | Impact | Options |", "|---|---|---|---|---|"];

export const DECISIONS_HEADER = ["| # | Question | Answer | Date |", "|---|---|---|---|"];

/** The option a person picks to keep a question open; never written as an option of the file. */
export const LEAVE_OPEN = "Leave it open";

export const RECOMMENDED_MARK = " (recommended)";

export const OPEN_QUESTIONS_HEADING = /^## .*Open questions/;

export const DECISIONS_HEADING = /^## (\d+\. )?Decisions\s*$/;

// ── Specs and change briefs ─────────────────────────────────────────────────

export const MUST_NOT_CHANGE = /^## (\d+\. )?What must not change/;

export const BLOCKING_CELL = /\| *Blocking *\|/;

export const ID_HEADING = /^#{3,4} (UC|BR|CH)-(\d+)\s*[—:-]\s*(.+)$/;

export const SPEC_TITLE = /^# (\S+) — (.+)$/;

export const BRIEF_TITLE = /^# (\S+) — (.+) — (bug|refactor|perf)\s*$/;

export const STATEMENT = "**Statement**";

// ── Plans and batch sheets ──────────────────────────────────────────────────

export const PLAN_TITLE = /^# (\S+)-PLAN — (.+)$/;

export const SUMMARY_HEADING = /^## 0\. Summary/;

export const BATCH_LINE = /^### Batch (F\d+) — (.+) — (open|done \((\d{4}-\d{2}-\d{2})\))$/;

export const BATCH_PREFIX = /^### Batch (F\d+) — (.*)$/;

export const STEP_BOX = /^- \[( |x|X)\] (\d+)\. (.*)$/;

export const SHEET_TITLE = /^# (\S+)-PLAN-(F\d+) — (.+?)( — done \((\d{4}-\d{2}-\d{2})\))?$/;

export const DEPENDS_ON = /\*\*Depends on\*\*: (.+)$/;

export const STEP_HEADING = /^### Step (\d+) — (.+)$/;

export const TDD_LINE = /^TDD: RED \[( |x|X)\] GREEN \[( |x|X)\] COST \[( |x|X)\]$/;

export const DONE_LINE = /^Done \((\d{4}-\d{2}-\d{2})\) — /;

export const ASSUMPTION_ROW = /^\|\s*(H\d+)\s*\|(.*)\|(.*)\|\s*$/;

export const ASSUMPTION_BULLET = /^- (H\d+) — (.*) — to be validated by (.+)$/;

export const TICKED_TDD_LINE = "TDD: RED [x] GREEN [x] COST [x]";

export const OPEN_BOX = /(RED|GREEN|COST) \[ \]/;

export const APPLIED_ROW = /^\| *Applied rules *\|/;

export const BUILD_STEP = "Build and tests";

/** The one parse problem a reviewed plan may carry: a batch the review marked blocked. */
export const BLOCKED_BATCH = /^unknown batch line '### Batch F\d+ — .+ — blocked'$/;

// ── Verdicts ────────────────────────────────────────────────────────────────

export const VERDICT_TITLE = /^# (\S+)-VERIFY-(F\d+) — (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) — (\S+)$/;

export const VERDICT_HEADING = /^##\s+Verdict\s+—\s+(VALID|GAPS)\s*$/;

export const VALIDATIONS_LINE = /^Validations: (.+)$/;

export const NOT_RUN_LINE = /^Not run: (.+)$/;

export const MEASURE_LINE = /^Measure: (.+)$/;

export const CORRECTION_LINE = /^\s*→ \/dev-batches (\S+) (F\d+) — correction: (.+)$/m;

export const CLOSE_LINE = /^\s*→ \/dev-batches (\S+) (F\d+) --close\s*$/;

/** The gap of the row dev-verify writes when the step's budget stopped the audit: not a finding of the code, so
 *  neither the learning harvest nor a resumed audit takes it as one. Its reason goes in the evidence. */
export const AUDIT_UNFINISHED_GAP = "the audit did not finish: the step's budget ran out";
