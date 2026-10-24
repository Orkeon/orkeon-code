// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// SharedMemoryAdmit crew (/memory-admit). Composition root: it wires
// application/shared-memory/admit-entries, which writes the candidates the operator confirmed to
// entries/<type>/, rewrites what they supersede, turns their candidate files into pointers,
// refreshes CANDIDATES.md and INDEX.md and re-ingests entries/ into the memory-<project> collection.
//
// Input (globalThis.inputs): { admit: string[] } — ids the command already confirmed.
// Run standalone:  bash scripts/run-crew.sh src/crews/shared-memory-admit/crew.ork.ts --inputs '{"admit":["<id>"]}'
//
// No tool callbacks: the admitter has no tool and makes no model call, so there is no tool call to guard.

import { AgentBuilder, CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import { orkeonConfigStore, orkeonFiles, orkeonSharedMemory, orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";
import { readMemorySettings } from "../../shared/application/shared-memory/memory-settings.ts";
import { admitEntries, admitReport, admittedIds } from "../../shared/application/shared-memory/admit-entries.ts";

const ports = { files: orkeonFiles(), shell: orkeonShell(), config: orkeonConfigStore(), memory: orkeonSharedMemory() };

const admitter = AgentBuilder()
  .name("memory-admitter")
  .role("Shared memory keeper")
  // NO tools on purpose: every write is code's, decided by the operator in /memory-admit.
  .tools([])
  .goal("Apply the admissions the operator confirmed, then re-index the shared memory.")
  .body(async () => {
    const settings = await readMemorySettings(ports);
    const outcome = await admitEntries({ ...ports, clock: () => new Date() }, settings, { admit: admittedIds(inputs()), refuse: [] });
    return [...settings.warnings.map((w) => `warning: ${w}`), admitReport(outcome)].join("\n");
  })
  .build();

publishCrew(
  CrewBuilder()
    .name("shared-memory-admit")
    .process("sequential")
    .withAgent(admitter)
    .build(),
);
