// Strip-chain for LLM text output — pure, no IO. Ported from exp 02
// (crews/unified/domain/metrics.ts), keeping ONLY the in-domain helpers a
// coding agent needs. The design-spec-specific helpers (FQN citation
// counting, verifier floors, table-row counting) are deliberately NOT
// ported — they are out of the coding-agent domain (PLAN §R4).
//
// Today 07 strips fences ad-hoc and inline in three crews
// (git-commit:45, project-init:79, init-verifiers:78). This centralises
// that, and adds the thinking/preamble salvage DeepSeek output needs.
//
// Run tests: node_modules/.bin/tsx --test shared/domain/strip.test.ts

// Remove a single pair of code fences WRAPPING the whole text, e.g. a model
// that answered ```markdown\n<doc>\n``` instead of the bare document. Only the
// outermost wrapping fence is stripped (inner fenced blocks are preserved).
export function unwrapFences(text: string): string {
  if (!text) return text;
  return text
    .replace(/^\s*```[a-z0-9-]*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

// Strip a `<thinking>...</thinking>` reasoning region. The opening tag is
// matched case-insensitively; we strip from the first opener to the LAST
// matching closer (greedy) so a writer that re-opens scratch mid-document is
// fully cleaned. No closer → the rest of the string was scratch; drop it.
export function stripThinking(md: string): string {
  if (!md) return md;
  const openIdx = md.search(/<thinking>/i);
  if (openIdx < 0) return md;
  const closeMatch = md.match(/<\/thinking>(?![\s\S]*<\/thinking>)/i);
  if (!closeMatch || closeMatch.index === undefined) return md.slice(0, openIdx);
  const closeEnd = closeMatch.index + closeMatch[0].length;
  return md.slice(0, openIdx) + md.slice(closeEnd);
}

// Salvage a "draft-then-real" leak: the writer emits the document twice — a
// skeleton, a self-narration monologue, then the real document with an
// IDENTICAL H1. Conservative: only fires when the same `# title` appears ≥2×
// AND first-person planning prose precedes the last duplicate. Otherwise the
// text is returned byte-identical (idempotent on clean output).
const SCRATCH_OPENER = /^(?:Now (?:let|I)|Wait,|Actually,|OK,|Let me|Let's|I'll |I need to|I should|I want to|I'm going to|Here goes|One more|First,? (?:I|let)|Hmm,)/m;
export function stripLeakedScratch(md: string): string {
  if (!md) return md;
  const h1Re = /^# .+$/gm;
  const matches: Array<{ text: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = h1Re.exec(md)) !== null) matches.push({ text: m[0].trim(), index: m.index });
  if (matches.length < 2) return md;
  const firstTitle = matches[0].text;
  let lastDupIndex = -1;
  for (let i = matches.length - 1; i >= 1; i--) {
    if (matches[i].text === firstTitle) { lastDupIndex = matches[i].index; break; }
  }
  if (lastDupIndex < 0) return md;
  const head = md.slice(0, lastDupIndex);
  if (!SCRATCH_OPENER.test(head)) return md;
  return md.slice(lastDupIndex);
}

// Strip any LLM preamble before the first markdown heading so the deliverable's
// first non-whitespace char is `#` (or `<!--`).
export function stripPreamble(md: string): string {
  if (!md) return md;
  const trimmed = md.replace(/^\s+/, "");
  if (trimmed.startsWith("#") || trimmed.startsWith("<!--")) return trimmed;
  const hIdx = md.search(/\n#\s/);
  if (hIdx >= 0) return md.slice(hIdx + 1);
  // Scratchpad glued to heading without a newline ("Let me write it.# Title").
  // Guards: `#` preceded by ws/punct/SOL, and followed by uppercase/digit.
  const gluedMatch = md.match(/(?:^|[\s.!?])(#\s+[A-Z0-9])/);
  if (gluedMatch && gluedMatch.index !== undefined) {
    const headStart = gluedMatch.index + gluedMatch[0].length - gluedMatch[1].length;
    return md.slice(headStart);
  }
  const cIdx = md.indexOf("<!--");
  if (cIdx >= 0) return md.slice(cIdx);
  return md;
}

// The full chain for a markdown deliverable produced by an LLM: drop scratch,
// salvage a draft-then-real leak, drop preamble, then unwrap any wrapping fence.
// Trailing newline normalised by the caller. Idempotent on clean output.
export function cleanLlmMarkdown(raw: string): string {
  if (!raw) return raw;
  return unwrapFences(stripPreamble(stripLeakedScratch(stripThinking(raw)))).trim();
}
