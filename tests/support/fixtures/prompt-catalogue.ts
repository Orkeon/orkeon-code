// Every LLM-facing prompt of Orkeon Code, rendered as the model reads it, over the
// test doubles: the main loop through buildTurnPrompt, each crew through its own
// builder, on one set of sample inputs. Shared by tests/repository/prompt-contract.test.ts
// (the rules every prompt keeps) and scripts/render-prompts.mjs (a render to read
// and to diff when a prompt changes).
import { buildTurnPrompt } from "../../../src/crews/main-loop/application/turn-prompt.ts";
import { PERMISSION_MODES } from "../../../src/shared/domain/permission-modes.ts";
import { DEFAULT_BEHAVIOR_FLAGS } from "../../../src/shared/domain/agent-policy/behavior-flags.ts";
import type { BehaviorFlags } from "../../../src/shared/domain/agent-policy/behavior-flags.ts";
import { HOOKS_STATE_KEY, OUTPUT_STYLE_STATE_KEY, SKILLS_STATE_KEY } from "../../../src/shared/domain/session-keys.ts";
import {
  buildCompactedBuffer, buildMemoryExtractionPrompt, buildMemoryRecapMessage, buildRestoredFileMessage,
  buildRestoredFileNotice, buildRestoredSkillMessage, buildSummaryPrompt, buildTranscript, MEMORY_EXTRACTION_SCHEMA,
} from "../../../src/shared/domain/compaction.ts";
import { buildLensPrompt, cutDiff, FINDINGS_SCHEMA, LENSES } from "../../../src/crews/code-review/application/prompts.ts";
import { buildCommitPrompt } from "../../../src/crews/git-commit/application/draft.ts";
import { buildAdvicePrompt } from "../../../src/crews/advisor/domain/advice.ts";
import { SYNTHESIS_SYSTEM, buildSynthesisUser } from "../../../src/crews/analyze/domain/harvest.ts";
import {
  READINESS_SCHEMA, buildReadinessPrompt, buildVerifierSkillPrompt,
} from "../../../src/crews/init-verifiers/application/prompts.ts";
import {
  CONVENTIONS_SCHEMA, buildConventionsPrompt, buildInstructionsFilePrompt,
} from "../../../src/crews/project-init/application/prompts.ts";
import { SUMMARY_PROMPT } from "../../../src/shared/domain/session-summary.ts";
import { buildVerifyRequest } from "../../../src/shared/domain/verifiers.ts";
import { applyPrelude } from "../../../src/shared/domain/prelude.ts";
import {
  AUDITOR_SYSTEM, buildAnswerPrompt, buildAuditBrief, buildValidationFollowUp,
} from "../../../src/crews/dev-verify/application/auditor-prompt.ts";
import type { AuditBriefInput } from "../../../src/crews/dev-verify/application/auditor-prompt.ts";
import { AUDIT_ANSWER_SCHEMA } from "../../../src/crews/dev-verify/domain/audit-answer.ts";
import { buildLearnPrompt } from "../../../src/crews/dev-learn/application/learn-prompt.ts";
import type { LearnPromptInput } from "../../../src/crews/dev-learn/application/learn-prompt.ts";
import { LEARN_ANSWER_SCHEMA } from "../../../src/crews/dev-learn/domain/learn-answer.ts";
import { buildPlanPrompt } from "../../../src/crews/dev-plan/application/plan-prompt.ts";
import type { PlanPromptInput } from "../../../src/crews/dev-plan/application/plan-prompt.ts";
import { PLAN_ANSWER_SCHEMA } from "../../../src/crews/dev-plan/domain/plan-answer.ts";
import { REVIEW_ANSWER_SCHEMA } from "../../../src/shared/domain/dev/review-answer.ts";
import { buildReviewAnswerPrompt, buildReviewBrief, reviewSystem } from "../../../src/shared/domain/dev/review-prompt.ts";
import type { PromptPair } from "../../../src/shared/domain/types.ts";
import { FakeClock } from "../doubles/fake-clock.ts";
import { FakeShell } from "../doubles/fake-shell.ts";
import { FakeSessionStore } from "../doubles/fake-session-store.ts";
import { FakeFiles } from "../doubles/fake-files.ts";
import { FakeTelemetry } from "../doubles/fake-telemetry.ts";
import { FakeMemoryStore } from "../doubles/fake-memory-store.ts";
import { WORKSPACE } from "../../../src/shared/domain/vfs.ts";

/** One part of a prompt as it is sent: the system message, the user message, a schema. */
export interface PromptSection {
  title: string;
  /** "system" and "user" are messages; "schema" is the JSON schema of an extraction; "text" a plain prompt. */
  role: "system" | "user" | "schema" | "text";
  text: string;
}

/** One prompt of the catalogue. */
export interface RenderedPrompt {
  id: string;
  name: string;
  source: string;
  callSite: string;
  call: string;
  inputs: string;
  sections: PromptSection[];
}

// ── Sample inputs ─────────────────────────────────────────────────────────
export const SAMPLE_TODAY = "2026-10-17";
export const SAMPLE_INSTRUCTIONS = "# sample-repo\n\nBuild: `npm run build`. Test: `npm test`.\n";
export const SAMPLE_HISTORY = [
  { role: "user", content: "Add input validation to parseArgs and a test for it." },
  { role: "assistant", content: "parseArgs now rejects an empty flag name (src/args.ts:14); added src/args.test.ts. npm test: 12 passed." },
  { role: "user", content: "Also reject duplicated flags." },
];
/** A line of sample material no instruction may contain: it marks where material went. */
export const MATERIAL_MARK = "seen.add(a);";
export const SAMPLE_DIFF = [
  "diff --git a/src/args.ts b/src/args.ts",
  "--- a/src/args.ts",
  "+++ b/src/args.ts",
  "@@ -10,6 +10,9 @@ export function parseArgs(argv: string[]) {",
  "+    if (seen.has(a)) throw new Error(`duplicated flag ${a}`);",
  `+    ${MATERIAL_MARK}`,
].join("\n");
const TRANSCRIPT = buildTranscript(SAMPLE_HISTORY.concat([{ role: "assistant", content: MATERIAL_MARK }]));

/** The ports buildTurnPrompt reads, over the doubles: bare, or with every block filled. */
export function turnDeps(opts: { full?: boolean; instructions?: boolean; today?: string } = {}) {
  const shell = new FakeShell();
  shell.results["git status --porcelain=v1 -b"] = { stdout: "## main...origin/main\n M src/args.ts\n" };
  const session = new FakeSessionStore();
  const files = new FakeFiles();
  const telemetry = new FakeTelemetry();
  const memory = new FakeMemoryStore();
  if (opts.instructions) files.files.set(`${WORKSPACE}/AGENTS.md`, SAMPLE_INSTRUCTIONS);
  let language: string | undefined;
  if (opts.full) {
    session.messages = SAMPLE_HISTORY.map((m) => ({ ...m }));
    session.budget = { used: 151_000, window: 167_000 };
    session.state.set(OUTPUT_STYLE_STATE_KEY, "concise");
    session.state.set(HOOKS_STATE_KEY, JSON.stringify([{ event: "post-tool", command: "npm test" }]));
    session.state.set(SKILLS_STATE_KEY, JSON.stringify([`${WORKSPACE}/docs/release-playbook.md`]));
    files.files.set(`${WORKSPACE}/docs/release-playbook.md`, "# Release playbook\n\nRun `npm run check` before tagging.\n");
    telemetry.stats = { costUsd: 0.42, totalTokens: 98_000, totalCalls: 14 };
    memory.records.push({ id: 1, category: "user", content: "Prefers answers in French." });
    language = "French";
  }
  const config = { readValue: async (key: string) => ({ key, value: key === "answer.language" ? language : undefined, source: "unset" as const }) };
  const clock = new FakeClock();
  clock.at = Date.parse(`${opts.today ?? SAMPLE_TODAY}T10:00:00Z`);
  return { shell, session, files, telemetry, memory, config, clock: clock.now };
}

const flags = (extra: Partial<BehaviorFlags> = {}): BehaviorFlags => ({ ...DEFAULT_BEHAVIOR_FLAGS, ...extra });
const pair = (title: string, p: PromptPair): PromptSection[] => [
  { title: `${title} — system`, role: "system", text: p.system },
  { title: `${title} — user`, role: "user", text: p.user },
];
const schema = (title: string, s: unknown): PromptSection => ({ title, role: "schema", text: JSON.stringify(s, null, 2) });

/** The main loop's system header for every mode, as buildTurnPrompt sends it. */
export async function renderHeaders(opts: { instructions?: boolean } = {}): Promise<Array<{ mode: string; system: string }>> {
  const out: Array<{ mode: string; system: string }> = [];
  for (const mode of PERMISSION_MODES) {
    out.push({ mode, system: (await buildTurnPrompt("…", mode, flags(), turnDeps(opts))).system });
  }
  return out;
}

/** The whole catalogue. */
export async function renderCatalogue(): Promise<RenderedPrompt[]> {
  const request = SAMPLE_HISTORY[2].content;
  const headers = await renderHeaders();
  const withFile = await buildTurnPrompt("…", "default", flags(), turnDeps({ instructions: true }));
  const bare = await buildTurnPrompt(request, "default", flags(), turnDeps());
  const full = await buildTurnPrompt(request, "default", flags({ proactive: true }), turnDeps({ full: true }));
  const plan = await buildTurnPrompt(request, "plan", flags(), turnDeps({ full: true }));
  const prior = [{ severity: "low", file: "src/args.ts", line: 12, category: "style", finding: "magic string" }];
  const detected = { buildCommand: "npm run build", testCommand: "npm test", frameworks: ["node"], conventions: [] };
  const pkg = JSON.stringify({ name: "sample-repo", scripts: { test: "node --test" } }, null, 2);
  const auditInput: AuditBriefInput = {
    mode: "fast", batch: "F2", sheetPath: `${WORKSPACE}/workbench/demo/DEMO-PLAN-F2.md`,
    captureFiles: [`${WORKSPACE}/workbench/demo/capture-F2/index.txt`, `${WORKSPACE}/workbench/demo/capture-F2/diff-001.txt`],
    table: `| Axis | Status | Evidence |\n|---|---|---|\n| Build | ok | capture-F2/build.txt |\n| Test | gap | ${MATERIAL_MARK} |`,
    appliedRules: "DDD-01, APP-02",
    commands: { testClass: "dotnet test tests/Ledger.Tests --filter FullyQualifiedName~<class>" },
    previousGaps: null,
  };
  const auditBrief = buildAuditBrief(auditInput);
  const auditValidation = "dotnet test tests/Ledger.Tests --filter FullyQualifiedName~AccountTests";
  const previousGap = {
    severity: "Major" as const, axis: "Reuse" as const, gap: "Parses amounts by hand",
    evidence: "src/Ledger/Account.cs:18", fix: "Call the existing amount parser",
  };
  const learnRow = (id: string, batch: string, gap: string, evidence: string, fix: string) =>
    ({ id, batch, severity: "Major" as const, axis: "Test", gap, evidence, fix, source: `${batch}.md`, line: 7 });
  const learnInput: LearnPromptInput = {
    axis: "Test",
    rows: [
      learnRow("c936075d95", "ledger/F1", "the refusal of a negative amount has no test", "src/ledger/withdraw.ts:14", "add the negative case"),
      learnRow("b983faad38", "ledger/F3", `no test triggers the overdraft refusal: ${MATERIAL_MARK}`, "tests/ledger.test.ts:40", "write the overdraft case"),
      learnRow("3a59a45e69", "invoices/F2", "the refusal text for an unknown currency is never asserted", "tests/invoices.test.ts:88", "assert the text"),
      learnRow("e61ec378db", "ledger/F1", "the rejection of an empty label is not covered", "src/ledger/label.ts:9", "cover the empty label"),
    ],
    refused: ["rounding-inside-handlers — Rounding inside handlers"],
    owners: ["CONTRIBUTING.md", "tests/repository/architecture.test.ts"],
  };
  const planInventory = [
    "I1 · src/shared/domain/memory.ts:18 · interface MemoryEntry · layer domain · for UC-01, BR-01 · export interface MemoryEntry {",
    "I2 · src/commands/_lib/memory.ts:40 · function runMemory · layer other · for UC-01, BR-02 · callers: src/commands/memory.cmd.ts::run · export async function runMemory(tokens: string[]) {",
    `I3 · tests/commands-memory.test.ts:12 · symbol memory command · layer tests · for BR-02 · ${MATERIAL_MARK}`,
  ].join("\n");
  const planInput: PlanPromptInput = {
    sourceShown: "workbench/prune/SPEC-prune.md", kind: "spec",
    sourceText: [
      "# prune — Prune old memory entries", "", "### UC-01 — Prune old memory entries",
      "- **Statement**: the user removes the entries saved before a cut-off", "",
      "### BR-01 — An entry older than the cut-off is removed", "### BR-02 — A dry run removes nothing", "", MATERIAL_MARK,
    ].join("\n"),
    ids: [
      { id: "UC-01", title: "Prune old memory entries", statement: "the user removes the entries saved before a cut-off", line: 3 },
      { id: "BR-01", title: "An entry older than the cut-off is removed", statement: "", line: 6 },
      { id: "BR-02", title: "A dry run removes nothing", statement: "", line: 7 },
    ],
    pinned: [], unpinned: [],
    repoCommands: "restore `npm ci` · build `npm run build` · build_test (not in the pack) · test `npm test` — from `.orkeon/repo.yaml`",
    repoLayout: "domain `src/shared/domain` · tests `tests` — from `.orkeon/repo.yaml`",
    inventory: planInventory, workShown: "workbench",
  };
  const reviewBrief = buildReviewBrief({
    mode: "plan", folder: "workbench/prune",
    files: ["workbench/prune/PRUNE-PLAN.md", "workbench/prune/PRUNE-PLAN-F1.md", "workbench/prune/PRUNE-PLAN-F2.md"],
    source: "workbench/prune/SPEC-prune.md", inventory: planInventory, targets: ["plan", "F1", "F2"],
  });
  const buffer = buildCompactedBuffer({ role: "user", content: SAMPLE_HISTORY[0].content }, "1. The request: validate flags.");
  return [
    {
      id: "01", name: "main-loop-system-header", source: "src/crews/main-loop/domain/prompt-assembly.ts",
      callSite: "/assistant, free text, /summary, /verify → crews/main-loop → turn-prompt.ts → run-main-loop.ts runAct",
      call: "act, the system message", inputs: "every permission mode; the sample instructions file for the last section",
      sections: [
        ...headers.map((h) => ({ title: `mode ${h.mode}`, role: "system" as const, text: h.system })),
        { title: "mode default, with AGENTS.md", role: "system", text: withFile.system },
      ],
    },
    {
      id: "02", name: "main-loop-user-body", source: "src/crews/main-loop/domain/prompt-assembly.ts, agent-policy/permission.ts",
      callSite: "same as 01", call: "act, the user message",
      inputs: "an unconfigured session; then every block filled (style, language, skill, memory, hook, history, gauge at the warning tier, proactive)",
      sections: [
        { title: "unconfigured session, mode default", role: "user", text: bare.user },
        { title: "every block filled, mode default", role: "user", text: full.user },
        { title: "every block filled, mode plan", role: "user", text: plan.user },
      ],
    },
    {
      id: "03", name: "compaction-summary", source: "src/shared/domain/compaction.ts",
      callSite: "/compact and the automatic compaction → shared/application/compaction/compact-session.ts",
      call: "complete with a system message", inputs: "the sample transcript; then a focus",
      sections: [...pair("summary", buildSummaryPrompt(TRANSCRIPT)), ...pair("with a focus", buildSummaryPrompt(TRANSCRIPT, "the test names"))],
    },
    {
      id: "04", name: "memory-extraction", source: "src/shared/domain/compaction.ts",
      callSite: "before each compaction → shared/application/compaction/extract-memories.ts",
      call: "extract (JSON schema)", inputs: "the sample transcript and one known memory",
      sections: [
        { title: "prompt", role: "text", text: buildMemoryExtractionPrompt(TRANSCRIPT, ["Releases are cut from main only."]) },
        schema("schema", MEMORY_EXTRACTION_SCHEMA),
      ],
    },
    {
      id: "05", name: "code-review-lenses", source: "src/crews/code-review/application/prompts.ts, domain/lenses.ts",
      callSite: "/review [--lens], /security-review → crews/code-review → application/review.ts",
      call: "extract (JSON schema), one call per lens and pass", inputs: "the sample diff; one prior finding; sample conventions",
      sections: [
        ...LENSES.map((lens) => ({
          title: `lens ${lens.key}, pass 1`, role: "text" as const,
          text: buildLensPrompt(lens, cutDiff(SAMPLE_DIFF, 12_000), 1, [], "Tabs, not spaces."),
        })),
        { title: `lens ${LENSES[0].key}, pass 2`, role: "text", text: buildLensPrompt(LENSES[0], SAMPLE_DIFF, 2, prior as never) },
        schema("schema", FINDINGS_SCHEMA),
      ],
    },
    {
      id: "06", name: "commit-message", source: "src/crews/git-commit/application/draft.ts",
      callSite: "/commit → crews/git-commit → draft.ts draftCommitMessage", call: "complete with a system message",
      inputs: "a modified file and an untracked one",
      sections: pair("commit", buildCommitPrompt({
        branch: "main", recent: "a1b2c3d feat(args): parse flags\n", status: " M src/args.ts\n?? src/args.test.ts\n",
        diff: SAMPLE_DIFF, untracked: [{ path: "src/args.test.ts", content: "import { parseArgs } from \"./args.ts\";\n" }],
      })),
    },
    {
      id: "07", name: "advisor-second-opinion", source: "src/crews/advisor/domain/advice.ts",
      callSite: "/advisor → crews/advisor → application/run-advisor.ts", call: "complete with a system message (the advisor model)",
      inputs: "the last exchange of the sample history and the turns before it",
      sections: pair("advice", buildAdvicePrompt(
        { request: request, answer: MATERIAL_MARK },
        `user: ${SAMPLE_HISTORY[0].content}\nassistant: ${SAMPLE_HISTORY[1].content}`,
      )),
    },
    {
      id: "08", name: "analyze-synthesis", source: "src/crews/analyze/domain/harvest.ts",
      callSite: "/analyze → crews/analyze → application/run-analyze.ts", call: "act with no tool, one iteration",
      inputs: "a three-line sample harvest",
      sections: [
        { title: "system", role: "system", text: SYNTHESIS_SYSTEM },
        { title: "user", role: "user", text: buildSynthesisUser(`## Packages\n- \`sample.args\`\n## Module edges\n- ${MATERIAL_MARK}`) },
      ],
    },
    {
      id: "09", name: "init-verifiers", source: "src/crews/init-verifiers/application/prompts.ts",
      callSite: "/init-verifiers → crews/init-verifiers → application/authoring.ts",
      call: "extract (readiness), then complete with a system message (one skill per zone)", inputs: "a small package.json; the zone cli",
      sections: [
        { title: "readiness", role: "text", text: buildReadinessPrompt(["package.json", "src"], pkg) },
        schema("readiness schema", READINESS_SCHEMA),
        ...pair("verification skill", buildVerifierSkillPrompt("cli", { pkg, readiness: { appTypes: ["cli"], frameworks: [], zonesNeedingVerifier: ["cli"] } })),
      ],
    },
    {
      id: "10", name: "project-init", source: "src/crews/project-init/application/prompts.ts",
      callSite: "/init → crews/project-init → application/detect.ts",
      call: "extract (conventions), then complete with a system message (AGENTS.md)", inputs: "a package.json; an existing CLAUDE.md; a README",
      sections: [
        { title: "conventions", role: "text", text: buildConventionsPrompt("package.json:\n{ \"scripts\": { \"test\": \"node --test\" } }") },
        schema("conventions schema", CONVENTIONS_SCHEMA),
        ...pair("instructions file", buildInstructionsFilePrompt(["package.json", "src"], detected, [{ file: "CLAUDE.md", content: MATERIAL_MARK }], "# sample-repo\n")),
      ],
    },
    {
      id: "11", name: "session-requests", source: "src/shared/domain/session-summary.ts, src/shared/domain/verifiers.ts",
      callSite: "/summary (plan mode) and /verify (the session's mode) → the main loop", call: "act, as the request",
      inputs: "none; the zone cli for /verify",
      sections: [
        { title: "/summary", role: "text", text: SUMMARY_PROMPT },
        { title: "/verify cli", role: "text", text: buildVerifyRequest("cli") },
        { title: "/verify", role: "text", text: buildVerifyRequest("") },
      ],
    },
    {
      id: "12", name: "markers-and-prelude", source: "src/shared/domain/compaction.ts, src/shared/domain/prelude.ts",
      callSite: "the compaction rewrites the buffer; a prelude's result joins the request (/transcribe --then)",
      call: "none of their own: the main loop reads them in its history and request", inputs: "sample summary, file, skill and transcription",
      sections: [
        { title: "compacted summary", role: "text", text: String(buffer[2].content) },
        { title: "memory recap", role: "text", text: buildMemoryRecapMessage([{ category: "project", content: "Releases are cut from main only." }]).content },
        { title: "restored file", role: "text", text: buildRestoredFileMessage("src/args.ts", "export function parseArgs() {}").content },
        { title: "restored file, too large", role: "text", text: buildRestoredFileNotice("src/big.ts").content },
        { title: "restored skill", role: "text", text: buildRestoredSkillMessage(`${WORKSPACE}/docs/release-playbook.md`, "# Release playbook").content },
        {
          title: "prelude result joined to the request", role: "text",
          text: applyPrelude("Summarize the meeting.", { tool: "transcribe_audio", args: {}, label: "Transcription" }, "Hello everyone."),
        },
      ],
    },
    {
      id: "13", name: "dev-auditor", source: "src/crews/dev-verify/application/auditor-prompt.ts, domain/audit-answer.ts",
      callSite: "/dev-verify → crews/dev-verify → application/audit.ts",
      call: "act in plan mode with four read tools, then extract (JSON schema); a second act after the validations",
      inputs: "a two-row table, two capture paths, one previous gap (resume)",
      sections: [
        { title: "system", role: "system", text: AUDITOR_SYSTEM },
        { title: "brief, mode fast", role: "user", text: auditBrief },
        { title: "brief, mode resume", role: "user", text: buildAuditBrief({ ...auditInput, mode: "resume", previousGaps: [previousGap] }) },
        {
          title: "after the validations", role: "user",
          text: buildValidationFollowUp(auditInput, {
            verdict: "VALID", rows: [], validations: [auditValidation], undecided: [{ check: "Cost", reason: "not measured" }],
          }, [{ command: auditValidation, outcome: "exit 1", tail: "Failed AccountTests.ShouldWithdraw_WhenBalanceSuffices" }]),
        },
        { title: "answer, second try", role: "text", text: buildAnswerPrompt(`Verdict GAPS. ${MATERIAL_MARK}`, ["row 1: evidence cites no path:line"]) },
        schema("schema", AUDIT_ANSWER_SCHEMA),
      ],
    },
    {
      id: "14", name: "dev-learn", source: "src/crews/dev-learn/application/learn-prompt.ts, domain/learn-answer.ts",
      callSite: "/dev-learn [<axis>] → crews/dev-learn → application/run-dev-learn.ts",
      call: "extract (JSON schema), one call per eligible axis, one re-ask with the problems",
      inputs: "four rows of the Test axis over three batches, one refused motif, two owner files",
      sections: [
        { title: "axis Test, first try", role: "text", text: buildLearnPrompt(learnInput, []) },
        {
          title: "axis Test, second try", role: "text",
          text: buildLearnPrompt(learnInput, ["motif 1: row 'abc' is not one of the rows given"]),
        },
        schema("schema", LEARN_ANSWER_SCHEMA),
      ],
    },
    {
      id: "15", name: "dev-plan", source: "src/crews/dev-plan/application/plan-prompt.ts, domain/plan-answer.ts",
      callSite: "/dev-plan → crews/dev-plan → application/run-dev-plan.ts",
      call: "extract (JSON schema), once more with the problems of a refused answer or a failed self-check",
      inputs: "a two-rule spec with one use case, three inventory entries, a pack without build_test",
      sections: [
        { title: "first try", role: "text", text: buildPlanPrompt(planInput, []) },
        { title: "second try", role: "text", text: buildPlanPrompt(planInput, ["B1 S1: anchor I9 is not an inventory entry shown"]) },
        schema("schema", PLAN_ANSWER_SCHEMA),
      ],
    },
    {
      id: "16", name: "dev-reviewer", source: "src/shared/domain/dev/review-prompt.ts, review-answer.ts",
      callSite: "/dev-plan → crews/dev-plan → application/run-dev-plan.ts (runSubAgent)",
      call: "act in plan mode with six read tools, then extract (JSON schema), one re-ask over the same reply",
      inputs: "a plan folder with two sheets and three inventory entries",
      sections: [
        { title: "system, mode plan", role: "system", text: reviewSystem("plan") },
        { title: "brief", role: "user", text: reviewBrief },
        { title: "answer, second try", role: "text", text: buildReviewAnswerPrompt(`GAPS. ${MATERIAL_MARK}`, ["row 1: the question must be one closed question ending with ?"]) },
        schema("schema", REVIEW_ANSWER_SCHEMA),
      ],
    },
  ];
}
