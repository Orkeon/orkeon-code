// The text of each review lens, read by its prompt: what it looks for, what it leaves to the others, its severity
// scale and the bar a finding meets. ../domain/lenses.ts pairs each with its key and its ceiling.

/** The prose of one lens, the fields of a ReviewLens the model reads. */
export interface LensText {
  looksFor: string;
  leaves: string;
  severities: string;
  bar: string;
}

export const CORRECTNESS_LENS: LensText = {
  looksFor:
    "behaviour the change gets wrong: an inverted or incomplete condition, an off-by-one, a value used " +
    "before it is set, a case the new code does not handle although its inputs allow it, a caller or a " +
    "contract the change breaks, a resource left open, steps that race; and, for each removed or replaced " +
    "line, what it guaranteed and whether the new code still does (such a finding points at the first " +
    "new line of the hunk that held the removed line, the new start its @@ header gives, and names the " +
    "removed line)",
  leaves:
    "style and naming, defensive checks for inputs the code cannot receive, security (another lens), " +
    "performance unless the change makes something fail",
  severities:
    "blocker (breaks the build, loses data or opens a hole in normal use), high (a wrong result in a " +
    "plausible case), medium (wrong in an edge case, or a maintenance cost with a concrete trigger), " +
    "low (minor), nit (style only)",
  bar: "say what goes wrong, for which input or state",
};

export const SECURITY_LENS: LensText = {
  looksFor:
    "a way in that the change opens: input reaching a shell, a query, a path or markup unescaped, a " +
    "secret written into code, logs or output, an authorisation check missing or weakened, unsafe " +
    "deserialisation, a file or network access wider than needed",
  leaves:
    "attacks with no input that reaches the code, a defence wished for code the diff does not touch, " +
    "issues the change neither adds nor touches, style and plain bugs (other lenses)",
  severities:
    "ranked by what an attacker needs: blocker (no condition, open in normal use), high (open under " +
    "specific conditions, such as a setting, a role or a timing), medium (a defence missing on a path " +
    "the diff shows an input reaching, with no way in shown), low (minor)",
  bar: "name the input an attacker controls, the path it takes to that line and what it gains them",
};

/** The style lens, its scale stopping at `ceiling`. */
export const styleLens = (ceiling: string): LensText => ({
  looksFor:
    "what makes the change harder to read or maintain: a misleading name, dead or duplicated code the " +
    "change adds, a comment that restates the code or narrates the change, a break with the conventions " +
    "the project states or the surrounding code follows",
  leaves: "what a formatter fixes, taste with no concrete cost, correctness and security (other lenses)",
  severities:
    `never above ${ceiling}: medium (a reader or maintainer will be misled or slowed), low (minor), ` +
    "nit (a small break with the convention)",
  bar:
    "quote the convention the project states, or the neighbouring code, that the line breaks, and say " +
    "what it costs a reader or maintainer",
});
