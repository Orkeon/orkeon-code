// The motifs, texts and remotes the refused motifs file is tested on.
import { REFUSED_HEADER, appendRefused } from "../../../../src/shared/domain/shared-memory/refused.ts";

/** One refused motif of project orkeon-code. */
export const motif = { topic: "refusal-paths-untested", project: "orkeon-code", date: "2026-10-22", motif: "Refusal paths go untested" };

/** The header-only file: the first four lines of a new file. */
export const headerOnly = (): string => appendRefused(null, motif).split("\n").slice(0, 4).join("\n");

/** A file with a four-part line, then a line whose motif holds the separator. */
export const TWO_MOTIFS = `# Refused motifs\n\n${REFUSED_HEADER}\n\nabc | p | 2026-10-22 | x\nd-e | p | 2026-01-01 | one | two\n`;

/** A topic not kebab, a date not ISO, a line of three parts. */
export const BAD_LINES = "Bad Topic | p | 2026-10-22 | x\nabc | p | 22/10/2026 | x\nabc | p | 2026-10-22\n";

/** The new file appendRefused writes for `motif`. */
export const NEW_FILE =
  `# Refused motifs\n\n${REFUSED_HEADER}\n\nrefusal-paths-untested | orkeon-code | 2026-10-22 | Refusal paths go untested\n`;

export interface TextCase {
  name: string;
  text: string;
  expected: string;
}

/** Texts folded into a topic, words joined with dashes. */
export const TOPICS: readonly TextCase[] = [
  { name: "plain words", text: "Refusal paths go untested", expected: "refusal-paths-go-untested" },
  { name: "accents and punctuation", text: "Règle d'or: pas de I/O", expected: "regle-d-or-pas-de-i-o" },
];

/** Texts past 60 characters: cut at the last dash within 60, or hard at 60. */
export const LONG_TOPICS: readonly TextCase[] = [
  { name: "at the last dash", text: Array(20).fill("abcdefg").join(" "), expected: Array(7).fill("abcdefg").join("-") },
  { name: "hard at 60 without a dash", text: "x".repeat(80), expected: "x".repeat(60) },
];

/** Remotes and the project each names: the last segment, cleaned. */
export const REMOTES: readonly TextCase[] = [
  { name: "an https remote", text: "https://github.com/Orkeon/orkeon-code.git", expected: "orkeon-code" },
  { name: "an ssh remote with upper case and an underscore", text: "git@host:team/My_Repo.git", expected: "my-repo" },
  { name: "a remote padded and ending with a slash", text: " https://host/x/Proj/ \n", expected: "proj" },
];

/** Remotes that leave no project name. */
export const EMPTY_REMOTES: readonly string[] = ["", "https://host/__/"];
