// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// GitCommit crew (/commit) — exp 07 SPEC §4.3. Composition root only: it
// assembles the agent + crew and delegates the work to application/draft and the
// git close shared with the dev close (shared/application/git/commit-files).
// Status → the file list (the work folder left out) → git's identity → draft a
// Conventional-Commits message → commit those files alone → push when asked →
// the pull request opened with the github tool when the host offers it and the
// session's mode and rules allow it, else its command handed over.
//
// Run standalone:  bash scripts/run-crew.sh src/crews/git-commit/crew.ork.ts
// Via REPL:        /commit  →  script-host.runCrewAsync("git-commit", {})

import { AgentBuilder, CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import {
  orkeonConfigStore, orkeonFiles, orkeonPullRequestOpener, orkeonShell,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { createCrewMemory } from "../../shared/infrastructure/orkeon/crew-memory.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { loadDevContext } from "../../shared/application/dev/load-dev-context.ts";
import { defaultBranch, handOverPullRequest, pushBranch, readIdentity } from "../../shared/application/git/commit-files.ts";
import { DEV_PR_AUTO_CONFIG_KEY, identityStop, selectCommitFiles } from "../../shared/domain/git/close.ts";
import { parseStoredRule } from "../../shared/domain/agent-policy/permission.ts";
import type { PermissionRule } from "../../shared/domain/agent-policy/permission.ts";
import { inspectWorkTree, draftCommitMessage, commitSelected, readStatus } from "./application/draft.ts";
import { commitRefusal, commitSubject, isCommitPermitted, secretLikePaths } from "./domain/commit.ts";

const shell = orkeonShell();
const files = orkeonFiles();
const config = orkeonConfigStore();

/** The paths threaded by /commit: an array, or one path per line. */
function namedPaths(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split("\n");
  return list.map((p) => String(p ?? "").trim()).filter((p) => p.length > 0);
}

/** The session's rules threaded by /commit, as the gate reads them; a line that is no rule is left out. */
function sessionRules(raw: unknown): PermissionRule[] {
  return namedPaths(raw).map((line) => parseStoredRule(line)).filter((r): r is PermissionRule => r !== null);
}

async function prAuto(): Promise<boolean> {
  try {
    return (await config.readValue(DEV_PR_AUTO_CONFIG_KEY)).value?.trim() === "true";
  } catch {
    return false;
  }
}

const committer = AgentBuilder()
  .name("git-committer")
  .role("Commit Writer")
  .goal("Inspect the working tree, draft a Conventional-Commits message, and commit safely.")
  .tools(["shell_command"])
  .body(async (_input: any, ctx: any) => {
    // The permission mode is threaded by /commit (dispatch), exactly as
    // assistant.cmd.ts threads it to main-loop. Checked BEFORE inspecting the
    // tree so a read-only session spends nothing — not even an LLM draft.
    const args = inputs();
    const mode = args.permissionMode;
    const permitted = isCommitPermitted(mode);
    if (!permitted.allowed) {
      ctx.log.warn(`git-commit refused: ${permitted.reason}`);
      return `✗ refused: ${permitted.reason}`;
    }

    const status = await readStatus(shell);
    if (status.trim().length === 0) {
      return "Nothing to commit — working tree clean.";
    }
    const dev = await loadDevContext({ files, shell, config });
    const selection = selectCommitFiles({
      status, workFolder: dev.work.folder, named: namedPaths(args.paths), namedWorkFolder: true,
    });
    const refusals = [
      selection.unchanged.length > 0 ? `no change under ${selection.unchanged.join(", ")}` : "",
      selection.unsafe.length > 0 ? `${selection.unsafe.join(", ")} cannot go through the shell (commit by hand)` : "",
    ].filter((r) => r.length > 0);
    if (refusals.length > 0) return `✗ refused: ${refusals.join("; ")}`;
    const leftOut = selection.leftOut.length > 0
      ? [`left out: ${selection.leftOut.length} file(s) of the work folder ${dev.work.folder}/`] : [];
    if (selection.files.length === 0) return [...leftOut, "Nothing to commit outside the work folder."].join("\n");
    // A file that usually holds a secret stops the commit before any model call.
    const secrets = secretLikePaths(selection.files);
    if (secrets.length > 0) {
      return `✗ refused: ${secrets.join(", ")} usually ${secrets.length === 1 ? "holds" : "hold"} a secret; ` +
        "commit by hand if it is meant to be tracked, or add it to .gitignore";
    }
    // git's own identity, before the draft: none, and nothing is spent or invented.
    const identity = await readIdentity(shell);
    if (!identity.ok) return identityStop(identity.detail, "/commit");

    const tree = await inspectWorkTree(shell, files, { status, files: selection.files });
    const message = await draftCommitMessage({ llm: createLlm(ctx.llm), memory: createCrewMemory(ctx) }, tree);
    const refusal = commitRefusal(message);
    if (refusal !== null) return `✗ refused: the drafted message flagged ${refusal}`;
    const committed = await commitSelected(tree, message, mode, { files: selection.files, status }, { shell, files });
    if (!committed.startsWith("✓")) return [...leftOut, committed].join("\n");

    const lines = [committed, ...leftOut];
    // A crew input may come as a string from the REPL: "true" counts as true.
    const flag = (v: unknown): boolean => v === true || v === "true";
    const wantPr = flag(args.pr);
    const push = flag(args.push) || wantPr;
    let pushed = false;
    if (push) {
      const step = await pushBranch(shell, tree.branch);
      pushed = step.ok;
      lines.push(step.ok ? `✓ pushed ${tree.branch} to origin` : `✗ ${step.line}`);
    }
    // The pull request is offered only when it was asked for: a push, --pr or dev.prAuto.
    const open = wantPr || (await prAuto());
    const base = push || open ? await defaultBranch(shell) : null;
    if ((push || open) && tree.branch.length > 0 && base !== tree.branch) {
      // The github tool, when /commit found it registered; the decision is the gate's, mirrored (W0-C).
      const opener = flag(args.githubTool)
        ? orkeonPullRequestOpener({ mode: String(mode ?? ""), rules: sessionRules(args.permissionRules), asked: flag(args.prAsked) })
        : undefined;
      lines.push(...await handOverPullRequest({ files, opener }, {
        work: { folder: dev.work.folder, vfsPath: dev.work.vfsPath }, branch: tree.branch, base,
        title: commitSubject(message), pushed, open,
        summary: {
          batch: `\`${tree.branch}\` — ${commitSubject(message)}`,
          layers: [{ layer: "Changed", paths: selection.files }],
        },
      }));
    }
    return lines.join("\n");
  })
  .build();

publishCrew(
  CrewBuilder()
    .name("git-commit")
    .process("sequential")
    .withAgent(committer)
    .build(),
);
