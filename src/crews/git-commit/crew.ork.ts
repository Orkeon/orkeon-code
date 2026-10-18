// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// GitCommit crew (/commit) — exp 07 SPEC §4.3. Composition root only: it
// assembles the agent + crew and delegates the work to application/draft.
// Inspect work tree → draft a Conventional-Commits message → stage + commit.
//
// Run standalone:  bash scripts/run-crew.sh src/crews/git-commit/crew.ork.ts
// Via REPL:        /commit  →  script-host.runCrewAsync("git-commit", {})

import { AgentBuilder, CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import { orkeonFiles, orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createCrewMemory } from "../../shared/infrastructure/orkeon/crew-memory.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { inspectWorkTree, draftCommitMessage, commitAll } from "./application/draft.ts";
import { commitRefusal, isCommitPermitted, secretLikePaths, statusPaths } from "./domain/commit.ts";

const shell = orkeonShell();
const files = orkeonFiles();

const committer = AgentBuilder()
  .name("git-committer")
  .role("Commit Writer")
  .goal("Inspect the working tree, draft a Conventional-Commits message, and commit safely.")
  .tools(["shell_command"])
  .body(async (_input: any, ctx: any) => {
    // The permission mode is threaded by /commit (dispatch), exactly as
    // assistant.cmd.ts threads it to main-loop. Checked BEFORE inspecting the
    // tree so a read-only session spends nothing — not even an LLM draft.
    const mode = inputs().permissionMode;
    const permitted = isCommitPermitted(mode);
    if (!permitted.allowed) {
      ctx.log.warn(`git-commit refused: ${permitted.reason}`);
      return `✗ refused: ${permitted.reason}`;
    }

    const tree = await inspectWorkTree(shell, files);
    if (tree.status.trim().length === 0) {
      return "Nothing to commit — working tree clean.";
    }
    // A file that usually holds a secret stops the commit before any model call.
    const secrets = secretLikePaths(statusPaths(tree.status));
    if (secrets.length > 0) {
      return `✗ refused: ${secrets.join(", ")} usually ${secrets.length === 1 ? "holds" : "hold"} a secret; ` +
        "commit by hand if it is meant to be tracked, or add it to .gitignore";
    }
    const message = await draftCommitMessage({ llm: createLlm(ctx.llm), memory: createCrewMemory(ctx) }, tree);
    const refusal = commitRefusal(message);
    if (refusal !== null) return `✗ refused: the drafted message flagged ${refusal}`;
    return await commitAll(tree, message, mode, { shell, files });
  })
  .build();

publishCrew(
  CrewBuilder()
    .name("git-commit")
    .process("sequential")
    .withAgent(committer)
    .build(),
);
