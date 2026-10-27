// The languages index_codebase is asked for: every grammar of the runtime's registry
// (src/analysis/Orkeon.Analysis/TreeSitter/LanguageRegistry.cs, twenty-five since Orkeon #195). The discovery keeps
// every file of a known grammar, then opens it to hash it; since Orkeon #215 the path validator lets a plain read
// of a shell script through (.sh, .bash, .ps1, .bat, .cmd, .vbs, .wsf) and the discovery skips a file the VFS still refuses
// instead of failing the whole index, so no grammar is held back any more. A grammar added framework-side must be
// mirrored here, as search-routing.ts does for the extensions. Pure.

/** The grammars of the runtime's registry, in its order. */
export const TREE_LANGUAGES: readonly string[] = [
  "typescript", "python", "csharp", "go", "rust", "javascript", "java", "c", "cpp", "php", "ruby", "bash",
  "markdown", "tsx", "agda", "css", "embedded-template", "haskell", "html", "json", "julia", "ql", "razor",
  "scala", "verilog",
];

/** What index_codebase is asked for: every grammar of the registry. */
export const INDEXED_LANGUAGES: readonly string[] = TREE_LANGUAGES;
