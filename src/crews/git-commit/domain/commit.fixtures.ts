// The messages, modes, arguments, statuses and paths the commit domain is tested on.
import type { CommitArgs } from "./commit.ts";

export interface NormalizeCase {
  name: string;
  input: string;
  expected: string;
}

export const NORMALIZED: readonly NormalizeCase[] = [
  { name: "unwraps a fenced message", input: "```\nfeat: x\n```", expected: "feat: x" },
  { name: "falls back when empty", input: "   ", expected: "chore: update working tree" },
  { name: "passes a clean message through", input: "fix(api): handle null", expected: "fix(api): handle null" },
];

export const CONVENTIONAL_SUBJECTS: readonly string[] = ["feat(ui): add button", "chore!: drop node 18"];

export const READ_ONLY_MODES: readonly string[] = ["plan", "dontAsk"];
export const WRITING_MODES: readonly string[] = ["default", "acceptEdits", "bypassPermissions"];
export const ABSENT_MODES: ReadonlyArray<string | null | undefined> = [undefined, null, "", "   "];

/** Parsed arguments with no flag and no path, `over` replacing some. */
export const args = (over: Partial<CommitArgs> = {}): CommitArgs => ({ yes: false, push: false, pr: false, paths: [], ...over });

export interface ParseCase {
  name: string;
  words: string[];
  args: CommitArgs;
}

/** Words and the arguments they read as: the flags, the other words as paths, --pr implying the push. */
export const PARSED_ARGS: readonly ParseCase[] = [
  {
    name: "-y, --pr and two paths",
    words: ["-y", "src/a.ts", "--pr", "docs/"],
    args: args({ yes: true, push: true, pr: true, paths: ["src/a.ts", "docs/"] }),
  },
  { name: "no word", words: [], args: args() },
  { name: "--push alone", words: ["--push"], args: args({ push: true }) },
];

export const CONFIRM_FLAGS: readonly string[] = ["--yes", "-y", "-Y", " --yes "];

/** A status with a modified file, a rename, and two untracked files, one quoted. */
export const STATUS = " M src/a.ts\nR  old.ts -> src/new.ts\n?? notes/todo.md\n?? \"with space.txt\"\n";

export const SECRET_PATHS = [".env", "app/.env.production", "certs/server.pem", "deploy/id_rsa", "credentials.json", "keys/x.p12"];
/** What secretLikePaths flags in SECRET_PATHS: every one of them, in their order (a list of its own, not SECRET_PATHS). */
export const FLAGGED_SECRET_PATHS = [".env", "app/.env.production", "certs/server.pem", "deploy/id_rsa", "credentials.json", "keys/x.p12"];
export const ORDINARY_PATHS = [".env.example", "id_rsa.pub", "src/secret-manager.ts", "src/keys.ts", "README.md"];

export interface RefusalCase {
  name: string;
  reply: string;
  refusal: string | null;
}

export const REFUSALS: readonly RefusalCase[] = [
  { name: "reads a refusal and its reason", reply: "REFUSE: config.ts: an API key", refusal: "config.ts: an API key" },
  { name: "reads a refusal without a reason", reply: "REFUSE:", refusal: "no reason given" },
  { name: "lets a message through", reply: "feat: add flags", refusal: null },
];
