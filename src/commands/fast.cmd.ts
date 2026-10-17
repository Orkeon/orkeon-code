/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /fast (E-1, consumed since B-9) — trade context for latency (baseline 04
// §/fast). The original picks a faster model; Orkeon Code cannot (the provider binds
// at startup — see /model), so `fast` buys latency the one way script-land can:
// the next /assistant turn skips the two ADVISORY prompt blocks, and skips
// gathering them too. That is a real degradation, so the loop logs it.
import { toggleCommand } from "./_lib/session-config.ts";
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";
import { FAST_MODE_STATE_KEY } from "../shared/domain/session-keys.ts";
import { FAST_MODE_DROPPED_BLOCKS } from "../shared/domain/agent-policy/behavior-flags.ts";

defineCommand(toggleCommand({
  name: "fast",
  description: "Toggle fast mode (drop the advisory prompt blocks for latency).",
  key: FAST_MODE_STATE_KEY,
  note: `while on, /assistant turns omit the ${FAST_MODE_DROPPED_BLOCKS.join(" and ")} blocks`,
}, orkeonSessionIo()));
