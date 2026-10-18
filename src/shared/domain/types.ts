// Pure shared types — no IO, no runtime globals. Imported by every layer.
//
// These were previously inline shapes scattered across the crew bodies
// (code-review findings, git-commit draft, project-init conventions,
// session buffer messages). Centralised so the domain helpers + tests can
// reference one definition.

/** Severity ladder used by the code-review crew (and any finding producer). */
export type Severity = "blocker" | "high" | "medium" | "low" | "nit";

/** A single review finding (code-review crew). */
export interface Finding {
  severity: Severity | string;
  file: string;
  line?: number;
  category?: string;
  finding: string;
  suggestion?: string;
  /** Which review lens surfaced it (correctness | security | style). */
  lens?: string;
}

/** Detected build/test/lint conventions (project-init crew). */
export interface DetectedConventions {
  buildCommand?: string;
  testCommand?: string;
  /** How to run one test file or case, when the configuration shows it. */
  singleTestCommand?: string;
  lintCommand?: string;
  frameworks: string[];
  conventions: string[];
}

/** Test-readiness classification (init-verifiers crew). */
export interface TestReadiness {
  appTypes: string[];
  frameworks: string[];
  hasUnitTests?: boolean;
  hasE2E?: boolean;
  zonesNeedingVerifier: string[];
}

/** One conversation-buffer turn (session_store messages). */
export interface SessionMsg {
  role: string;
  content: string;
}

/** Typed post-compaction boundary marker (E-9) — lets the scrollback and
 *  session-memory tracking distinguish pre- vs post-compact messages. The
 *  content marker doubles as the detector because the C# session store may
 *  round-trip only role/content. */
export interface CompactBoundaryMessage extends SessionMsg {
  role: "system";
  subtype: "compact_boundary";
}

/** A prompt as two messages: the instructions (the system message) and the
 *  material they apply to (the user message), so text inside the material never
 *  carries the authority of an instruction. */
export interface PromptPair {
  system: string;
  user: string;
}
