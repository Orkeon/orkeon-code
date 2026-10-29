// The ports: what the application layer needs from outside, named after that need
// rather than after the runtime that provides it. One file per concern under ports/,
// re-exported here so that every importer names this module; types only, so it is
// erased from every bundle. A new port goes in ports/<concern>.ts, plus its line below.
// The Orkeon adapters live in shared/infrastructure/orkeon/ (and are wired by entry
// points), the test doubles in tests/support/doubles/.

export type { Clock } from "./ports/clock.ts";
export type { ShellResult, ShellOptions, Shell, ShellJobStatus, ShellJobs } from "./ports/shell.ts";
export type { Mount, Files } from "./ports/files.ts";
export type { ProgressSpec, Progress } from "./ports/progress.ts";
export type {
  StoredMessage, SessionMessages, TokenKinds, TokenBudget, SnipResult, SessionStore, SessionSwitch,
} from "./ports/session.ts";
export type { SessionMetadata, SessionCost, SessionStats, Telemetry } from "./ports/telemetry.ts";
export type { RuntimeInfo, RuntimeInfoReader } from "./ports/runtime.ts";
export type { UsageTokens, UsageSpent, ModelUsage, CommandUsage, UsageReport, UsageReader } from "./ports/usage.ts";
export type { MemoryEntry, MemoryStore } from "./ports/memory.ts";
export type { ToolOutcome, ToolCatalogue, PermissionRules } from "./ports/tools.ts";
export type { CrewHost, CrewLaunchOptions, RunningCrew, RunningCrews, ChildRuntime, Logger, RunState, CrewMemory } from "./ports/crew.ts";
export type { ModelOverride, CompleteRequest, ActRequest, Llm } from "./ports/llm.ts";
export type { HumanInput } from "./ports/human.ts";
export type { PendingApproval, PendingApprovals } from "./ports/approvals.ts";
export type {
  CodeMap, CodeSearchHit, SymbolLocation, CodeIndex, AnchorClosure, AnchorIndex, CostIndex, AffectedTests,
} from "./ports/code-index.ts";
export type { SharedHit, SharedIngest, SharedMemory } from "./ports/shared-memory.ts";
