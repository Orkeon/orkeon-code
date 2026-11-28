/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /assistant "<request>" — the interactive coding loop (main-loop crew), async (SPEC §5.2).
// Reads an optional leading permission mode (e.g. "plan: refactor X" → plan mode).
//
// launchMainLoop resolves what decides the crew's tool catalogue before the crew
// loads — the mode (the prefix, else the session's), the extra tools the host
// registers, the session's rules (handed to the host gate first) — and passes it
// in `inputs`: the crew builds its catalogue at MODULE scope, which is synchronous
// and cannot await the state bag.
//
// A turn that ran in plan mode ends on the approval of its plan (_lib/session/plan-approval): approved, the
// plan is carried out by a second turn, launched from `completed` in the mode picked. The plan turn's launch
// attaches a state that `completed` receives back as `result.state`: the use case asks only for that launch.
//
// The first free-text turn of a session carries what the session's start script
// printed (Orkeon:Cli:Session:StartScript), at the head of the raw input alone: it is
// taken off there and passed as `sessionStart`, the request parsed from the tokens.
import type { CommandRuntimeContext } from "../.orkeon/orkeon-cli.d.ts";
import { parseAssistantInput, rawText } from "../_lib/args.ts";
import { splitStartOutput } from "../../shared/domain/session-start.ts";
import { writeCompleted } from "../_lib/dispatch.ts";
import { approvePlan, launchAssistantTurn } from "../_lib/session/plan-approval.ts";
import { createChooser } from "../../shared/infrastructure/orkeon/chooser.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonHostContext, orkeonSessionIo, orkeonToolCatalogue,
} from "../../shared/infrastructure/orkeon/wiring.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore() };

const launchDeps = (ctx: CommandRuntimeContext) => ({
  ...deps, catalogue: orkeonToolCatalogue(ctx.services), crews: createCrewHost(ctx.services),
  gate: createPermissionRules(ctx.services), host: orkeonHostContext, log: ctx.log,
});

defineAsyncCommand({
  name: "assistant",
  description: "Ask the interactive coding agent to work on a request.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    // permissionMode is null when the prompt has no "mode:" prefix: launchMainLoop
    // then resolves the session's mode (/mode, else the fallback).
    const { prompt, permissionMode } = parseAssistantInput(rawText(args));
    const { start } = splitStartOutput(String(ctx.command?.rawInput ?? ""));
    return await launchAssistantTurn(
      launchDeps(ctx), { prompt, permissionMode, ...(start ? { sessionStart: start } : {}) }, ctx.interactive,
    );
  },
  // A plan turn ends on the question of its approval; the plan approved is carried out by a turn launched here.
  completed: async (result, ctx) => {
    writeCompleted(ctx, result, "assistant");
    const lines = await approvePlan(result, { ...launchDeps(ctx), chooser: createChooser(ctx) });
    for (const line of lines) ctx.writeLine(line);
  },
});
