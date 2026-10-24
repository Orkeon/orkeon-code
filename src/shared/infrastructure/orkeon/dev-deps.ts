/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// The ports of /dev-implement's and /dev-verify's use cases, built from the agent body that runs them: its own
// `ctx.tools`, `ctx.llm` and `ctx.log`. The crews' bodies use them, and so does a parallel /dev-batches' batch
// agent, beside others under their own working roots - where the global `tools` refuses a call from code
// (temp/26 L8P-D3). Given a root (the batch's worktree), the ports keep naming the checkout `/workspace` and map
// it onto the root (path-rebase.ts): the files, the shell and its jobs, the config, the act's callbacks (a call's
// paths back to `/workspace` before the rules see them) and the model's briefs (prompts and system texts out with
// the root's paths). The cost index is left out under a root: it indexes the main checkout. A spend, given, bounds
// the batch's tool calls: the runtime gives a delegated agent no budget (L8P-D12).

import type { ActRequest, CompleteRequest, Llm, Logger } from "../../application/ports.ts";
import type { WorkFolder } from "../../application/dev/resolve-work-folder.ts";
import { stepPrecedents } from "../../application/dev/step-precedents.ts";
import { harvestAfterGaps } from "../../application/shared-memory/harvest-after-gaps.ts";
import { memoryDirOf } from "../../application/shared-memory/memory-settings.ts";
import { mapStrings, textToRoot } from "../../domain/dev/path-rebase.ts";
import { parseSessionRules } from "../../domain/git/pull-request.ts";
import type { DevImplementDeps } from "../../../crews/dev-implement/application/run-dev-implement.ts";
import type { DevVerifyDeps } from "../../../crews/dev-verify/application/run-dev-verify.ts";
import { reportingWrites } from "../../../crews/dev-implement/application/report-writes.ts";
import { createLlm } from "./llm.ts";
import { memoryReadTools } from "./memory-tools.ts";
import type { MemoryToolPorts } from "./memory-tools.ts";
import { RUN_VALIDATION } from "./script-tools.ts";
import { shCode, shOut } from "./tool-results.ts";
import { devToolCallbacks, rootedCallbacks } from "./tool-callbacks.ts";
import type { ToolCallbacks } from "./tool-callbacks.ts";
import {
  orkeonConfigStore, orkeonCostIndex, orkeonFiles, orkeonMemoryToolPorts, orkeonPullRequestOpener, orkeonSharedMemory,
  orkeonShell, orkeonShellJobs,
} from "./wiring.ts";

/** What an agent body hands its deps: its own tools, model and log. */
export interface BodyContext {
  tools: OrkeonTools;
  llm: Pick<LlmFacade, "act" | "complete" | "extract" | "chat"> & Partial<Pick<LlmFacade, "permissionGate">>;
  log: Logger;
}

/** A batch's tool calls: counted, and refused once `limit` is reached. */
export interface Spend {
  readonly limit: number;
  calls(): number;
  exhausted(): boolean;
  /** Counts one call; false, and nothing counted, once the limit is reached. */
  take(): boolean;
}

export function createSpend(limit: number): Spend {
  let calls = 0;
  return {
    limit,
    calls: () => calls,
    exhausted: () => calls >= limit,
    take: () => (calls >= limit ? false : (calls++, true)),
  };
}

/** `callbacks` denying every call past the spend's limit; `callbacks` themselves without a spend. */
export function spendGuard<C extends Pick<ToolCallbacks, "forAct">>(callbacks: C, spend: Spend | undefined): C {
  if (spend === undefined) return callbacks;
  return {
    ...callbacks,
    forAct(mode: string, gateEnabled: boolean | undefined) {
      const inner = callbacks.forAct(mode, gateEnabled);
      return {
        ...inner,
        onToolCall: async (call) => (spend.take()
          ? inner.onToolCall(call)
          : { deny: `budget: this batch has spent its ${spend.limit} tool calls; end the act and say what is left` }),
      };
    },
  };
}

/** `llm` with every `/workspace` path of its prompts and system texts on the root; `llm` itself without one. */
export function rootedLlm(llm: Llm, root: string | undefined): Llm {
  if (root === undefined || root === "") return llm;
  const out = (text: string) => textToRoot(text, root);
  return {
    ...llm,
    act: (prompt: string, request: ActRequest) => llm.act(out(prompt), mapStrings(request, out)),
    complete: (prompt: string, request?: CompleteRequest) => llm.complete(out(prompt), request === undefined ? request : mapStrings(request, out)),
    extract: (prompt: string, schema: object) => llm.extract(out(prompt), schema),
  };
}

/** The tools of the agent body that runs, for the script tools built with its agent before any body runs. */
export function agentTools(): { bind(tools: OrkeonTools): void; memoryPorts(root?: string): () => MemoryToolPorts } {
  let bound: OrkeonTools | undefined;
  return {
    bind: (tools) => { bound = tools; },
    // Unbound (a host that calls the tool before the body), the global: the crews' own single agent.
    memoryPorts: (root) => () => orkeonMemoryToolPorts(bound, root),
  };
}

/** git's top as an agent under `root` sees it: the raw output, never mapped back to `/workspace`, so that a
 *  top other than the root shows (a parallel /dev-batches' probe, L8P-D11). A refused call throws. */
export async function gitTopUnder(tools: Pick<OrkeonTools, "shellCommand">, root: string): Promise<{ exitCode: number; top: string }> {
  const r = await tools.shellCommand({ command: "git rev-parse --show-toplevel", working_directory: root });
  return { exitCode: shCode(r), top: shOut(r).trim() };
}

interface DevOptions {
  /** The /hooks registry the command passed. */
  hooks: unknown;
  effort: ActRequest["effort"] | undefined;
  /** memory_recall is attached (no session rule denies it). */
  memoryOn: boolean;
  /** The batch's worktree, a parallel /dev-batches' working root; none: the checkout itself. */
  root?: string;
  spend?: Spend;
}

function portsOf(ctx: BodyContext, root: string | undefined) {
  return {
    shell: orkeonShell(ctx.tools, root), files: orkeonFiles(ctx.tools, root), config: orkeonConfigStore(ctx.tools, root),
  };
}

const today = (): string => new Date().toISOString().slice(0, 10);

/** /dev-implement's deps over the body's context. */
export function implementDeps(
  ctx: BodyContext, opts: DevOptions & { toolSlot: DevImplementDeps["toolSlot"] },
): DevImplementDeps {
  const ports = portsOf(ctx, opts.root);
  const callbacks = (spec: Parameters<typeof devToolCallbacks>[0], wrote: (path: string) => void) =>
    spendGuard(rootedCallbacks(reportingWrites(devToolCallbacks(spec, { shell: ports.shell, log: ctx.log, files: ports.files, memoryDir: memoryDirOf(ports.config) }), wrote), opts.root), opts.spend);
  return {
    ...ports, jobs: orkeonShellJobs(ctx.tools, opts.root), log: ctx.log, today,
    ...(opts.toolSlot !== undefined ? { toolSlot: opts.toolSlot } : {}),
    ...(opts.root === undefined ? { costIndex: orkeonCostIndex(ctx.tools) } : {}),
    precedents: stepPrecedents({ ...ports, memory: orkeonSharedMemory(ctx.tools), log: ctx.log }, { on: opts.memoryOn }),
    // The close's opener, for the context read at the launch (the chained close reads it from the batch record).
    openerFor: (pr) => orkeonPullRequestOpener({ mode: pr.permissionMode, rules: parseSessionRules(pr.permissionRules), asked: false }, ctx.tools),
    // Each role's act runs under its own callbacks: the host's gate first, then the step's rule sets, the role's
    // roots and the /hooks the command passed. `wrote` hears each write those callbacks let through; `writable`:
    // the test author's stubs, which its own root denies leave open; `files`: the rewrite rule reads a write's path.
    roleLlm: (role, layout, wrote, writable) => rootedLlm(createLlm(ctx.llm, callbacks(
      { step: "dev-implement", role, layout, writable, hooks: opts.hooks, readTools: memoryReadTools(opts.memoryOn) }, wrote,
    ), { effort: opts.effort }), opts.root),
  };
}

/** /dev-verify's callbacks over the body's context: the step's rule sets again and the /hooks the command passed;
 *  run_validation and memory_recall, declared `read`, let through on a host without a gate. */
export function verifyCallbacks(ctx: Pick<BodyContext, "tools" | "log">, opts: DevOptions): ToolCallbacks {
  const ports = portsOf({ ...ctx, llm: undefined as never }, opts.root);
  return spendGuard(rootedCallbacks(devToolCallbacks(
    { step: "dev-verify", hooks: opts.hooks, readTools: [RUN_VALIDATION.name, ...memoryReadTools(opts.memoryOn)] },
    { shell: ports.shell, log: ctx.log, memoryDir: memoryDirOf(ports.config) },
  ), opts.root), opts.spend);
}

/** /dev-verify's deps over the body's context. The audit acts on the plain Llm (inline) unless `wrapLlm` hands it
 *  to a background child (the crew's); the harvest after GAPS runs only when asked (never in a batch: the driver's). */
export function verifyDeps(
  ctx: BodyContext,
  opts: DevOptions & { validationSlot: DevVerifyDeps["validationSlot"]; wrapLlm?: (llm: Llm) => Llm; harvest?: boolean },
): DevVerifyDeps {
  const ports = portsOf(ctx, opts.root);
  const clock = () => new Date();
  const plain = rootedLlm(createLlm(ctx.llm, verifyCallbacks(ctx, opts), { effort: opts.effort }), opts.root);
  return {
    ...ports, log: ctx.log, clock, llm: opts.wrapLlm === undefined ? plain : opts.wrapLlm(plain),
    ...(opts.validationSlot !== undefined ? { validationSlot: opts.validationSlot } : {}),
    ...(opts.root === undefined ? { costIndex: orkeonCostIndex(ctx.tools) } : {}),
    // T4: the shared memory's precedents in the auditor's brief, unless memory_recall is denied.
    precedents: stepPrecedents({ ...ports, memory: orkeonSharedMemory(ctx.tools), log: ctx.log }, { on: opts.memoryOn }),
    // M-7: after a GAPS verdict, the mistakes that recur become candidates.
    ...(opts.harvest === true
      ? { harvest: (work: Pick<WorkFolder, "folder" | "vfsPath">) => harvestAfterGaps({ ...ports, clock, log: ctx.log }, work) }
      : {}),
  };
}
