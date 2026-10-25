/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /commit — draft + create a Conventional-Commits commit via the git-commit crew (SPEC §5.1).
//
// B-1: the launch is GATED. Until this item, `/commit` staged the entire working
// tree and committed it with no confirmation and no permission check — the
// framework's IPermissionGate only fires inside the `act` tool-calling loop, and
// the git-commit crew commits from its body, so nothing consulted anything
// (round-40 finding `commit-no-confirmation`). The original gates every
// destructive action through its decision table (baseline 08 §Decision table).
//
// Three things now stand between the command and a rewritten repository:
//   1. the effective permission mode is threaded into the crew inputs, exactly
//      as assistant.cmd.ts threads it to main-loop, and the crew refuses the
//      read-only modes before spending anything;
//   2. an interactive session must confirm a plan that names the file list (every
//      change, untracked files too, or the paths named; never the work folder);
//   3. a NON-interactive session without `--yes` is refused, not auto-approved —
//      the one case where a confirmation prompt silently degrades into consent.
import { launchCrew, writeCompleted } from "../_lib/dispatch.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { rawTokens } from "../_lib/args.ts";
import { buildCommitPlan, isCommitPermitted, parseCommitArgs } from "../../crews/git-commit/domain/commit.ts";
import { orkeonSessionIo, orkeonToolCatalogue } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createPermissionRules } from "../../shared/infrastructure/orkeon/permission-rules.ts";
import { GITHUB_TOOL, pullRequestCrewInputs } from "../../shared/domain/git/pull-request.ts";

const session = orkeonSessionIo();

/**
 * Asks for confirmation, distinguishing "declined" from "cannot ask".
 *
 * `ctx.prompt` needs an interactive console. In a headless session it throws (or
 * returns something that is not a boolean), and treating that as approval is how
 * an unattended run commits a whole tree. Anything that is not an explicit
 * `true` refuses, and the two cases are reported differently because the remedy
 * differs: one is "answer yes", the other is "pass --yes".
 */
async function confirmOrRefuse(ctx: any, notice: string, question: string): Promise<
  { ok: true } | { ok: false; message: string }
> {
  ctx.writeLine(notice);
  let answer: unknown;
  try {
    answer = await ctx.prompt({ type: "confirm", message: question, default: false });
  } catch (e: any) {
    return {
      ok: false,
      message:
        "refused: /commit needs a confirmation and this session cannot prompt " +
        `(${String(e?.message ?? e)}). Re-run as '/commit --yes' if you intend to stage ` +
        "and commit the changed files unattended.",
    };
  }
  if (answer === true) return { ok: true };
  if (typeof answer !== "boolean") {
    return {
      ok: false,
      message:
        "refused: the confirmation prompt returned no answer (non-interactive session). " +
        "Re-run as '/commit --yes' to stage and commit the changed files unattended.",
    };
  }
  return { ok: false, message: "cancelled — nothing was staged and nothing was committed." };
}

/**
 * What the crew needs to open the pull request itself (W0-C): whether the host
 * registers the github tool, and the session's rules, which the crew cannot read.
 * A read that fails leaves the tool out and the rules empty: the command is then
 * handed over, nothing is opened on a guess.
 */
function pullRequestContext(ctx: any): { githubTool: boolean; permissionRules: string[] } {
  let githubTool = false;
  let permissionRules: string[] = [];
  try {
    githubTool = orkeonToolCatalogue(ctx.services).find(GITHUB_TOOL) !== undefined;
  } catch { /* no tools service: the tool is not offered */ }
  try {
    const rules = createPermissionRules(ctx.services);
    if (rules.available()) permissionRules = rules.list();
  } catch { /* no rules service: none */ }
  return { githubTool, permissionRules };
}

defineAsyncCommand({
  name: "commit",
  description: "Draft and create a conventional commit of the changed files or the paths named, the work folder left out unless named (confirms first; --yes skips; --push pushes; --pr opens the pull request).",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const parsed = parseCommitArgs(rawTokens(args));
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    const { yes, push, pr, paths } = parsed.args;
    const { mode, via } = await session.resolveEffectiveSessionMode();

    // Refuse the read-only modes here too, so the operator learns why without
    // waiting for a crew round-trip. The crew re-checks — see domain/commit.ts.
    const permitted = isCommitPermitted(mode);
    if (!permitted.allowed) {
      ctx.writeLine(`✗ refused: ${permitted.reason}`);
      return { refused: permitted.reason };
    }

    if (!yes) {
      const plan = buildCommitPlan({ push, pr, paths });
      const verdict = await confirmOrRefuse(ctx, plan.notice, plan.question);
      if (!verdict.ok) {
        ctx.writeLine(`✗ ${verdict.message}`);
        return { refused: verdict.message };
      }
    }

    ctx.log.info(`commit approved — permission mode '${mode}' (${via})`);
    // A yes to a plan that named the pull request is the question the github call needs; --yes asked nothing.
    return launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "git-commit", {
      permissionMode: mode, paths, push, pr, ...pullRequestCrewInputs({ pr, push, yes, read: () => pullRequestContext(ctx) }),
    });
  },
  completed: (result, ctx) => writeCompleted(ctx, result, "commit"),
});
