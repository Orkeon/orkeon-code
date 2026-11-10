// /commit: the gate before the git-commit crew is launched (B-1). The arguments, the effective permission mode
// (the read-only modes are refused here, so the operator learns why without a crew round-trip; the crew
// re-checks), the plan and its confirmation, then the crew's input: the mode, the paths, push and pull request,
// the author's note when one is given, and what the crew needs to open the pull request itself (pr-context.ts), read only when the run may reach it.
import type { Logger } from "../../../shared/application/ports.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { pullRequestCrewInputs } from "../../../shared/domain/git/pull-request.ts";
import { buildCommitPlan, isCommitPermitted, parseCommitArgs } from "../../../crews/git-commit/domain/commit.ts";
import { commandLine, splitWords } from "../args.ts";
import { readPullRequestContext } from "../pr-context.ts";
import type { PullRequestContext, PullRequestContextPorts } from "../pr-context.ts";
import { COMMIT_CANCELLED, NO_ANSWER_REFUSAL, cannotPromptRefusal, commitApproved } from "./messages.ts";
import { refusedLine } from "../../../shared/application/git/messages.ts";
import { failedLine } from "../messages.ts";

export interface CommitCommandDeps {
  session: Pick<SessionIo, "resolveEffectiveSessionMode">;
  /** Asks the yes/no question: true approves; anything else, or a throw, refuses. */
  confirm(question: string): Promise<unknown>;
  write(line: string): void;
  log: Pick<Logger, "info">;
  pr: PullRequestContextPorts;
}

export type CommitDispatch = { refused: string } | { input: Record<string, unknown> };

/**
 * Asks for confirmation, distinguishing "declined" from "cannot ask".
 *
 * A headless session's prompt throws (or returns something that is not a boolean), and
 * treating that as approval is how an unattended run commits a whole tree. Anything that
 * is not an explicit `true` refuses, and the two cases are reported differently because
 * the remedy differs: one is "answer yes", the other is "pass --yes".
 */
async function confirmOrRefuse(deps: Pick<CommitCommandDeps, "confirm" | "write">, notice: string, question: string): Promise<string | null> {
  deps.write(notice);
  let answer: unknown;
  try {
    answer = await deps.confirm(question);
  } catch (e: any) {
    return cannotPromptRefusal(String(e?.message ?? e));
  }
  if (answer === true) return null;
  if (typeof answer !== "boolean") {
    return NO_ANSWER_REFUSAL;
  }
  return COMMIT_CANCELLED;
}

/** `/commit [--yes] [--push] [--pr] [--note <text>] [<path>…]`, from the command's raw tokens: the refusal, written,
 *  or the crew's input. The REPL keeps the quotes in the raw tokens: the line is split again, so
 *  `--note "the reason in several words"` reads as one note. */
export async function runCommitCommand(tokens: readonly string[], deps: CommitCommandDeps): Promise<CommitDispatch> {
  const parsed = parseCommitArgs(splitWords(commandLine(tokens)).map((w) => w.text));
  if (!parsed.ok) {
    deps.write(parsed.text);
    return { refused: parsed.text };
  }
  const { yes, push, pr, paths, note } = parsed.args;
  const { mode, via } = await deps.session.resolveEffectiveSessionMode();

  const permitted = isCommitPermitted(mode);
  if (!permitted.allowed) {
    deps.write(refusedLine(permitted.reason));
    return { refused: permitted.reason };
  }

  if (!yes) {
    const plan = buildCommitPlan({ push, pr, paths });
    const refusal = await confirmOrRefuse(deps, plan.notice, plan.question);
    if (refusal !== null) {
      deps.write(failedLine(refusal));
      return { refused: refusal };
    }
  }

  deps.log.info(commitApproved(mode, via));
  const context: PullRequestContext | null = pr || push ? await readPullRequestContext(deps.pr) : null;
  // A yes to a plan that named the pull request is the question the github call needs; --yes asked nothing.
  return {
    input: {
      permissionMode: mode, paths, push, pr,
      ...(note === undefined ? {} : { note }),
      ...pullRequestCrewInputs({
        pr, push, yes,
        read: () => ({ githubTool: context?.githubTool ?? false, permissionRules: context?.permissionRules ?? [] }),
      }),
    },
  };
}
