// Paths and extensions for the search routing tests.
import { WORKSPACE } from "./vfs.ts";

/** Read from src/analysis/Orkeon.Analysis/Adapters/*.cs — a new adapter framework-side must be mirrored here (the
 *  probe's partition step trips live). */
export const ADAPTER_EXTENSIONS: readonly string[] = [
  ".ts", ".tsx", ".cs", ".py", ".go", ".rs", ".js", ".jsx", ".mjs", ".cjs", ".java", ".c",
  ".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx", ".h", ".php", ".rb", ".sh", ".bash",
];

export const CODE_PATHS: readonly string[] = [`${WORKSPACE}/src/a.ts`, `${WORKSPACE}/App.tsx`, "b.cs", "x/y.py", "m.go", "lib.rs"];

export const DOCUMENT_PATHS: readonly string[] = [`${WORKSPACE}/README.md`, "notes.txt", "data.csv", "report.pdf", "page.html"];

/** The languages of Orkeon #195. */
export const ORKEON_195_PATHS: readonly string[] = [
  `${WORKSPACE}/src/app.js`, "Main.java", "include/x.h", "index.php", "lib/a.rb", "build.sh",
];

/** CSS, HTML and JSON parse for the structural tools but enter no index. */
export const PARSE_ONLY_PATHS: readonly string[] = ["README.md", "page.html", "package.json", "site.css"];

/** The tree's discovery filters by adapter extension: a .yaml/.toml/.xyz never enters its store, so sending the
 *  query there manufactures a guaranteed-empty answer that reads as "not found". The RAG's text loader at least has a
 *  chance. */
export const UNKNOWN_PATHS: readonly string[] = ["config.yaml", "pyproject.toml", "Makefile", "weird.xyz", "no-extension"];

/** Each group of paths and the route they all take. */
export const ROUTE_GROUPS: readonly { readonly name: string; readonly paths: readonly string[]; readonly route: string }[] = [
  { name: "routes code extensions to the tree", paths: CODE_PATHS, route: "tree" },
  { name: "routes documents and configs to the rag", paths: DOCUMENT_PATHS, route: "rag" },
  { name: "routes the languages of Orkeon #195 to the tree", paths: ORKEON_195_PATHS, route: "tree" },
  { name: "routes the parse-only grammars of Orkeon #195 to the rag", paths: PARSE_ONLY_PATHS, route: "rag" },
  { name: "routes UNKNOWN extensions to the rag — the tree cannot hold them", paths: UNKNOWN_PATHS, route: "rag" },
];

export const UPPER_CASE_ROUTES: readonly { readonly path: string; readonly route: string }[] = [
  { path: "A.TS", route: "tree" },
  { path: "B.MD", route: "rag" },
];

export const EXTENSION_CASES: readonly { readonly name: string; readonly path: string; readonly extension: string }[] = [
  { name: "takes the last dot of the basename only", path: "/a/b.c/file.spec.ts", extension: ".ts" },
  { name: "takes no dot of a folder for an extension", path: "/a.b/README", extension: "" },
  { name: "a leading dot is a hidden file, not an extension", path: `${WORKSPACE}/.gitignore`, extension: "" },
  { name: "a leading dot is a hidden file, not an extension, without a folder", path: ".env", extension: "" },
];

/** conf.yaml has no declared loader — ingestion may still refuse. */
export const LOADER_CASES: readonly { readonly path: string; readonly has: boolean }[] = [
  { path: "doc.md", has: true },
  { path: "table.csv", has: true },
  { path: "conf.yaml", has: false },
];
