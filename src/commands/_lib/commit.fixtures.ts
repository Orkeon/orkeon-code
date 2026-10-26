// The session modes, the answers to the confirmation and the pull-request context the /commit tests run over.
import { runCommitCommand } from "./commit.ts";
import type { CommitDispatch } from "./commit.ts";
import { GITHUB_TOOL } from "../../shared/domain/git/pull-request.ts";
import { gateLine } from "../../shared/domain/agent-policy/permission.ts";
import type { PermissionRule } from "../../shared/domain/agent-policy/permission.ts";
import { FakeLogger } from "../../../tests/support/doubles/fake-logger.ts";
import { FakePermissionRules } from "../../../tests/support/doubles/fake-permission-rules.ts";
import { FakeToolCatalogue } from "../../../tests/support/doubles/fake-tool-catalogue.ts";

export interface CommitSeed {
  /** The effective permission mode. */
  mode?: string;
  /** What the confirmation answers; an Error is thrown, as a session that cannot prompt does. */
  answer?: unknown;
}

export interface CommitHarness {
  /** The lines the command wrote, in order. */
  written: string[];
  /** The questions the confirmation was asked. */
  questions: string[];
  log: FakeLogger;
  /** Runs `/commit <tokens…>`. */
  run(...tokens: string[]): Promise<CommitDispatch>;
}

/** The session rule the pull-request context reads. */
export const SESSION_RULE: PermissionRule = { effect: "allow", tool: "github" };

/** /commit over a session in `mode`, a confirmation answering `answer`, a catalogue with the github tool and one rule. */
export function commitHarness(seed: CommitSeed = {}): CommitHarness {
  const written: string[] = [];
  const questions: string[] = [];
  const log = new FakeLogger();
  const catalogue = new FakeToolCatalogue();
  catalogue.tools.set(GITHUB_TOOL, {});
  const rules = new FakePermissionRules();
  rules.rules = [SESSION_RULE];
  const session = { resolveEffectiveSessionMode: async () => ({ mode: seed.mode ?? "acceptEdits", via: "test" }) };
  const confirm = async (question: string): Promise<unknown> => {
    questions.push(question);
    if (seed.answer instanceof Error) throw seed.answer;
    return seed.answer;
  };
  return {
    written,
    questions,
    log,
    run: (...tokens) => runCommitCommand(tokens, {
      session, confirm, write: (line) => written.push(line), log, pr: { catalogue: () => catalogue, rules: () => rules, session },
    }),
  };
}

/** The refusal of a session that cannot prompt, its error named. */
export const CANNOT_PROMPT_REFUSAL =
  "refused: /commit needs a confirmation and this session cannot prompt (no console). Re-run as '/commit --yes' " +
  "if you intend to stage and commit the changed files unattended.";

/** The refusal of a prompt that answered no boolean. */
export const NO_ANSWER_REFUSAL =
  "refused: the confirmation prompt returned no answer (non-interactive session). " +
  "Re-run as '/commit --yes' to stage and commit the changed files unattended.";

/** What a confirmed `/commit --push --pr` hands the crew. */
export const PUSH_PR_INPUT = {
  permissionMode: "acceptEdits", paths: [], push: true, pr: true,
  prAsked: true, githubTool: true, permissionRules: [gateLine(SESSION_RULE)],
};
