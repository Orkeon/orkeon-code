/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /doctor — health check: version, toolchain, LLM configuration, tool catalogue, VFS
// mounts and the project values set aside, one pass/fail row per check (baseline 04 §/doctor). Entry point: wires
// the shell, the telemetry, the tool catalogue, the files and the settings into _lib/doctor.ts
// (runDoctor), which holds the checks.
import { runDoctor } from "./_lib/doctor.ts";
import { showView } from "./_lib/view.ts";
import {
  orkeonConfigStore, orkeonFiles, orkeonShell, orkeonTelemetry, orkeonToolCatalogue,
} from "../shared/infrastructure/orkeon/wiring.ts";

const deps = {
  shell: orkeonShell(),
  telemetry: orkeonTelemetry(),
  files: orkeonFiles(),
  config: orkeonConfigStore(),
};

defineCommand({
  name: "doctor",
  description: "Health check: toolchain, LLM configuration, tool catalogue and VFS mounts.",
  handler: async (_args, ctx) =>
    showView(ctx, await runDoctor({ ...deps, catalogue: orkeonToolCatalogue(ctx.services) })),
});
