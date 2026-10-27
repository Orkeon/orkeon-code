// The languages index_codebase is asked for. The runtime's registry maps an extension to a grammar
// (src/analysis/Orkeon.Analysis/TreeSitter/LanguageRegistry.cs, twenty-five since Orkeon #195) and its
// discovery keeps every file of a known grammar, then opens it to hash it; the path validator refuses to
// read a shell script (.sh, .bash sit in its built-in blocked extensions) and the first refusal fails the
// whole index. Until the runtime lets a read through, or skips a refused file, the index is asked for every
// grammar but those. A grammar added framework-side must be mirrored here, as search-routing.ts does for
// the extensions. Pure.

/** The grammars of the runtime's registry, in its order. */
export const TREE_LANGUAGES: readonly string[] = [
  "typescript", "python", "csharp", "go", "rust", "javascript", "java", "c", "cpp", "php", "ruby", "bash",
  "markdown", "tsx", "agda", "css", "embedded-template", "haskell", "html", "json", "julia", "ql", "razor",
  "scala", "verilog",
];

/** The grammars whose files the runtime's path validator refuses to read: a script's extensions are blocked. */
export const UNREADABLE_LANGUAGES: readonly string[] = ["bash"];

/** What index_codebase is asked for: every grammar the runtime can read. */
export const INDEXED_LANGUAGES: readonly string[] = TREE_LANGUAGES.filter((l) => !UNREADABLE_LANGUAGES.includes(l));
