// Every LLM-facing prompt of Orkeon Code, rendered as the model reads it, over the
// test doubles: the main loop through buildTurnPrompt, each crew through its own
// builder, on one set of sample inputs. Shared by tests/prompt-contract.test.ts
// (the rules every prompt keeps) and scripts/render-prompts.mjs (a render to read
// and to diff when a prompt changes).
import { buildTurnPrompt } from "../../src/crews/main-loop/application/turn-prompt.ts";
import { PERMISSION_MODES } from "../../src/shared/domain/permission-modes.ts";
import { DEFAULT_BEHAVIOR_FLAGS } from "../../src/shared/domain/agent-policy/behavior-flags.ts";
import type { BehaviorFlags } from "../../src/shared/domain/agent-policy/behavior-flags.ts";
import { HOOKS_STATE_KEY, OUTPUT_STYLE_STATE_KEY, SKILLS_STATE_KEY } from "../../src/shared/domain/session-keys.ts";
import {
  buildCompactedBuffer, buildMemoryExtractionPrompt, buildMemoryRecapMessage, buildRestoredFileMessage,
  buildRestoredFileNotice, buildRestoredSkillMessage, buildSummaryPrompt, buildTranscript, MEMORY_EXTRACTION_SCHEMA,
} from "../../src/shared/domain/compaction.ts";
import { buildLensPrompt, cutDiff, FINDINGS_SCHEMA, LENSES } from "../../src/crews/code-review/application/prompts.ts";
import { buildCommitPrompt } from "../../src/crews/git-commit/application/draft.ts";
import { buildAdvicePrompt } from "../../src/crews/advisor/domain/advice.ts";
import { SYNTHESIS_SYSTEM, buildSynthesisUser } from "../../src/crews/analyze/domain/harvest.ts";
import {
  READINESS_SCHEMA, buildReadinessPrompt, buildVerifierSkillPrompt,
} from "../../src/crews/init-verifiers/application/prompts.ts";
import {
  CONVENTIONS_SCHEMA, buildConventionsPrompt, buildInstructionsFilePrompt,
} from "../../src/crews/project-init/application/prompts.ts";
import { SUMMARY_PROMPT } from "../../src/shared/domain/session-summary.ts";
import { buildVerifyRequest } from "../../src/shared/domain/verifiers.ts";
import { applyPrelude } from "../../src/shared/domain/prelude.ts";
import type { PromptPair } from "../../src/shared/domain/types.ts";
import { FakeShell } from "./fake-shell.ts";
import { FakeSessionStore } from "./fake-session-store.ts";
import { FakeFiles } from "./fake-files.ts";
import { FakeTelemetry } from "./fake-telemetry.ts";
import { FakeMemoryStore } from "./fake-memory-store.ts";

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
  if (opts.instructions) files.files.set("/workspace/AGENTS.md", SAMPLE_INSTRUCTIONS);
  let language: string | undefined;
  if (opts.full) {
    session.messages = SAMPLE_HISTORY.map((m) => ({ ...m }));
    session.budget = { used: 151_000, window: 167_000 };
    session.state.set(OUTPUT_STYLE_STATE_KEY, "concise");
    session.state.set(HOOKS_STATE_KEY, JSON.stringify([{ event: "post-tool", command: "npm test" }]));
    session.state.set(SKILLS_STATE_KEY, JSON.stringify(["/workspace/docs/release-playbook.md"]));
    files.files.set("/workspace/docs/release-playbook.md", "# Release playbook\n\nRun `npm run check` before tagging.\n");
    telemetry.stats = { costUsd: 0.42, totalTokens: 98_000, totalCalls: 14 };
    memory.records.push({ id: 1, category: "user", content: "Prefers answers in French." });
    language = "French";
  }
  const config = { readValue: async (key: string) => ({ key, value: key === "answer.language" ? language : undefined, source: "unset" as const }) };
  return { shell, session, files, telemetry, memory, config, today: () => opts.today ?? SAMPLE_TODAY };
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
        { title: "restored skill", role: "text", text: buildRestoredSkillMessage("/workspace/docs/release-playbook.md", "# Release playbook").content },
        {
          title: "prelude result joined to the request", role: "text",
          text: applyPrelude("Summarize the meeting.", { tool: "transcribe_audio", args: {}, label: "Transcription" }, "Hello everyone."),
        },
      ],
    },
  ];
}
