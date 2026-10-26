// Start blocks the runtime puts before a session's first free-text turn.
import { MAX_START_LINE_CHARS, MAX_START_LINES } from "../../../src/shared/domain/session-start.ts";

/** The block the runtime writes for a script's output and its source. */
export const block = (stdout: string, source = "echo hi") =>
  `[Session start script: /tmp/orkeon-code/session-start.sh]\n${stdout}\n[Script source]\n${source}\n[End of session start script]`;

/** Inputs taken as they are: no block at their head, or one cut short. */
export const NO_BLOCK_INPUTS: readonly { readonly name: string; readonly input: string }[] = [
  { name: "leaves an input with no block alone", input: "hello" },
  { name: "leaves a block cut short before its source alone", input: "[Session start script: /tmp/s.sh]\nline\nhello" },
  {
    name: "leaves a block with no end line alone",
    input: "[Session start script: /tmp/s.sh]\nline\n[Script source]\necho\nhello",
  },
];

/** An output of three lines more than the bound. */
export const TOO_MANY_LINES = Array.from({ length: MAX_START_LINES + 3 }, (_, i) => `l${i}`).join("\n");

/** A line fifty characters past the bound. */
export const TOO_LONG_LINE = "x".repeat(MAX_START_LINE_CHARS + 50);

/** Values that are no start output. */
export const NOT_START_OUTPUTS: readonly { readonly name: string; readonly value: unknown }[] = [
  { name: "null", value: null },
  { name: "a string", value: "x" },
  { name: "an empty object", value: {} },
  { name: "an empty script", value: { script: "", lines: ["a"] } },
  { name: "lines that are no list", value: { script: "/s", lines: "a" } },
  { name: "blank lines alone", value: { script: "/s", lines: [" "] } },
];
