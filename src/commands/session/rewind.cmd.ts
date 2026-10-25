/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /rewind (E-1) — drop the last exchange from the conversation buffer: every
// trailing message up to AND INCLUDING the most recent user turn. Repeatable
// to step further back (baseline 04 §/rewind — rewind session state).
import { orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "rewind",
  description: "Rewind the session by one exchange (drops the last user turn and what followed).",
  handler: async (_args, ctx) => {
    const { messages } = await session.readMessages().catch(() => ({ stored: [], messages: [] }));
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") { lastUser = i; break; }
    }
    if (lastUser < 0)
      return ctx.continue("nothing to rewind — no user turn in the buffer.");
    const kept = messages.slice(0, lastUser);
    await session.writeMessages(kept);
    return ctx.continue(
      `rewound 1 exchange (${messages.length - kept.length} message(s) dropped, ${kept.length} kept).`,
    );
  },
});
