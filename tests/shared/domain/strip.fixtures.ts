// Model outputs for the strip-chain tests, and what each step leaves of them.

export interface StripCase {
  readonly name: string;
  readonly raw: string;
  readonly cleaned: string;
}

export const UNWRAP_FENCES_CASES: readonly StripCase[] = [
  { name: "strips a wrapping ```markdown fence", raw: "```markdown\n# Title\nbody\n```", cleaned: "# Title\nbody" },
  { name: "strips a bare ``` fence", raw: "```\nfeat: x\n```", cleaned: "feat: x" },
  { name: "is a no-op on unfenced text", raw: "feat(scope): subject", cleaned: "feat(scope): subject" },
];

/** A document fenced whole, holding a fenced block of its own. */
export const FENCE_IN_FENCE = "```md\n# Doc\n```js\ncode\n```\n```";

export const STRIP_THINKING_CASES: readonly StripCase[] = [
  { name: "removes a <thinking> region", raw: "<thinking>scratch</thinking># Real", cleaned: "# Real" },
  {
    name: "is case-insensitive and greedy to the last closer",
    raw: "<Thinking>a</Thinking>X<thinking>b</thinking>Y",
    cleaned: "Y",
  },
  { name: "no closer → drops from opener to end", raw: "keep<thinking>rest", cleaned: "keep" },
  { name: "no opener → no-op", raw: "# Title", cleaned: "# Title" },
];

export const STRIP_PREAMBLE_CASES: readonly StripCase[] = [
  { name: "drops prose before the first heading", raw: "Here you go:\n# Title\nbody", cleaned: "# Title\nbody" },
  { name: "is a no-op when already starting with #", raw: "# Title", cleaned: "# Title" },
  { name: "recovers a heading glued to scratch", raw: "Let me write it.# Title", cleaned: "# Title" },
];

export const STRIP_LEAKED_SCRATCH_CASES: readonly StripCase[] = [
  {
    name: "salvages a draft-then-real duplicate H1 with scratch between",
    raw: "# Doc\nskeleton\nNow let me write the full version.\n# Doc\nreal body",
    cleaned: "# Doc\nreal body",
  },
  { name: "is idempotent on a clean single-H1 document", raw: "# Doc\nbody only", cleaned: "# Doc\nbody only" },
  { name: "does not fire without a scratch signal", raw: "# Doc\na\n# Doc\nb", cleaned: "# Doc\na\n# Doc\nb" },
];

/** Thinking, a preamble and a fence around the document. */
export const FULL_CHAIN_RAW = "<thinking>plan</thinking>Sure!\n```markdown\n# Title\nbody\n```";
