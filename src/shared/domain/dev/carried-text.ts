// A text a brief carries so that the agent opens no file for it: a sheet, a test file, a diff.
// Each one goes under its title in a fenced block; past the room given, a text is cut and says
// so, the ones after it are left out and named, so the agent knows what it did not get. Pure.

export interface CarriedText {
  /** What the text is: a path, or a sentence ("what F1 changed (git show ab700a7)"). */
  title: string;
  text: string;
}

/** The line a cut block ends with. */
const CUT = (left: number): string => `… (cut: ${left} more characters)`;

/** The fenced blocks of `texts`, in order, within `room` characters in all: a text past the room is cut with a
 *  note, the ones after it are listed as not carried. Empty when nothing fits. */
export function carriedBlocks(texts: readonly CarriedText[], room: number): string[] {
  const out: string[] = [];
  const skipped: string[] = [];
  let left = room;
  for (const { title, text } of texts) {
    const body = text.replace(/\s+$/u, "");
    const frame = `### ${title}\n\`\`\`text\n\n\`\`\``.length + 1;
    if (left - frame < 200) {
      skipped.push(title);
      continue;
    }
    const fits = body.length <= left - frame;
    const kept = fits ? body : `${body.slice(0, left - frame - 40)}\n${CUT(body.length - (left - frame - 40))}`;
    out.push(`### ${title}\n\`\`\`text\n${kept}\n\`\`\``);
    left -= frame + kept.length;
  }
  if (skipped.length > 0) out.push(`Not carried (no room left): ${skipped.join(", ")}.`);
  return out;
}
