/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /resume (E-1) — resume the (single, in-memory) session: show what the buffer
// still holds so the user picks up where they left off. DEVIATION (recorded in
// RESULTS.md): the original resumes among PERSISTED sessions; the runtime's
// ISessionBufferService is in-memory, so there is exactly one resumable session.
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

const TAIL_TURNS = 3;

defineCommand({
  name: "resume",
  description: "Resume the current in-memory session (shows the recent turns).",
  handler: async (_args, ctx) => {
    const { messages } = await session.readMessages().catch(() => ({ stored: [], messages: [] }));
    if (messages.length === 0)
      return ctx.continue("nothing to resume — the session buffer is empty (in-memory store).");
    const tail = messages.slice(-TAIL_TURNS)
      .map((m) => `  ${m.role}: ${m.content.slice(0, 200)}${m.content.length > 200 ? "…" : ""}`);
    return ctx.continue(
      `session resumed — ${messages.length} message(s) in the buffer. Last turns:\n` + tail.join("\n"),
    );
  },
});
