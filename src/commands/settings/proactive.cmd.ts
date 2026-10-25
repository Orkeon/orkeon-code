/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /proactive (E-1, consumed since B-9) — toggle proactive suggestions
// (baseline 04 §/proactive). While on, each /assistant turn asks for a short
// 'Next steps' list alongside the answer (the clause rides with the task —
// shared/domain/agent-policy/behavior-flags.ts).
import { toggleCommand } from "../_lib/session-config.ts";
import { orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";
import { PROACTIVE_STATE_KEY } from "../../shared/domain/session-keys.ts";

defineCommand(toggleCommand({
  name: "proactive",
  description: "Toggle proactive follow-up suggestions from the assistant.",
  key: PROACTIVE_STATE_KEY,
  note: "while on, /assistant answers end with up to three suggested next steps",
}, orkeonSessionIo()));
