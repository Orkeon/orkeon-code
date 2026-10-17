/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /copy (E-1) — surface the last assistant output for copying (baseline 04
// §/copy). DEVIATION (recorded in RESULTS.md): no OS clipboard in the headless
// REPL; the full untruncated text is re-printed (the scrollback shows windowed
// excerpts) so the terminal's own copy takes over.
//
// B-11 acceptance 3: it ALSO writes /output/copy.txt. Re-printing only helps at a
// terminal a human is looking at — over a pipe, in CI, or through a log scrape the
// payload is unreachable, which is precisely when one wants it. /output is a
// mounted volume, so the file is retrievable from outside the container.
import { orkeonFiles, orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();
const files = orkeonFiles();

/** The mounted fallback: /output is rw in both the orkeon-code launcher. */
const COPY_FILE_PATH = "/output/copy.txt";

defineCommand({
  name: "copy",
  description: "Re-print the last assistant output in full (terminal copy; no OS clipboard).",
  handler: async (_args, ctx) => {
    const { messages } = await session.readMessages().catch(() => ({ stored: [], messages: [] }));
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        ctx.writeLine("── last assistant output (full) ──");
        ctx.writeLine(messages[i].content);
        // The file write is best-effort: losing it must not cost the re-print,
        // which is the path that works at an interactive terminal.
        let written = "";
        try {
          await files.write(COPY_FILE_PATH, messages[i].content);
          written = ` It is also in ${COPY_FILE_PATH} (mounted volume).`;
        } catch (e: any) {
          ctx.log.warn(`/copy could not write ${COPY_FILE_PATH}: ${String(e?.message ?? e).split("\n")[0]}`);
        }
        return ctx.continue(
          `(select in your terminal to copy — headless REPL has no OS clipboard)${written}`,
        );
      }
    }
    return ctx.continue("no assistant output in the buffer yet.");
  },
});
