// The `## Commands` section of a project's instructions file — the commands the
// project itself states, which a verification skill may run. Pure, no IO.

const COMMANDS_HEADING = /^##\s+Commands\b/i;
const SECTION_END = /^#{1,2}\s/;
const FENCE = /^\s*(```|~~~)/;

/** The index of the first `## Commands` heading outside a code fence; -1 when there is none. */
function headingIndex(lines: readonly string[]): number {
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) fenced = !fenced;
    else if (!fenced && COMMANDS_HEADING.test(lines[i])) return i;
  }
  return -1;
}

/**
 * The `## Commands` section of a Markdown text, its heading included, up to the
 * next heading of level one or two; a heading inside a code fence neither starts
 * nor ends it (a `# comment` line of a shell block, an example `## Commands` in a
 * fenced sample). "" when the text has none.
 */
export function commandsSection(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = headingIndex(lines);
  if (start < 0) return "";
  const kept = [lines[start]];
  let fenced = false;
  for (const line of lines.slice(start + 1)) {
    if (FENCE.test(line)) fenced = !fenced;
    else if (!fenced && SECTION_END.test(line)) break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}
