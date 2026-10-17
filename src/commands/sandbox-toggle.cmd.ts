/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /sandbox-toggle (E-1) — toggle the sandbox session flag (baseline 04
// §/sandbox-toggle).
//
// B-9 made this command honest. It used to say the flag "gates future shell
// sandboxing", which reads as a switch that will one day bite; it will not.
// Ground truth §4: Orkeon Code runs inside the container and THAT is the sandbox.
// The VFS mounts already bound every file path, and `shell_command` runs on the
// host in both positions. So the flag records a preference and nothing more —
// stated up front, because a flag that implies enforcement it does not have is
// worse than no flag: an operator may relax their own caution on it.
import { toggleCommand } from "./_lib/session-config.ts";
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";
import { SANDBOX_MODE_STATE_KEY } from "../shared/domain/session-keys.ts";
import { SANDBOX_NOOP_NOTE } from "../shared/domain/agent-policy/behavior-flags.ts";

defineCommand(toggleCommand({
  name: "sandbox-toggle",
  description: "Record the sandbox preference (no-op: the container IS the sandbox).",
  key: SANDBOX_MODE_STATE_KEY,
  note: SANDBOX_NOOP_NOTE,
}, orkeonSessionIo()));
