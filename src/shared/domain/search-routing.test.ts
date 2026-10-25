// Search routing by file type (tree vs rag). Run:
//   node --test src/shared/domain/search-routing.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import {
  TREE_CODE_EXTENSIONS, RAG_DOCUMENT_EXTENSIONS, WORKSPACE_DOCS_COLLECTION,
  extensionOf, routeForPath, hasRagLoader, describeSearchRouting,
} from "./search-routing.ts";

describe("the extension partition", () => {
  it("mirrors the thirteen Tree-sitter adapters exactly", () => {
    // Read from src/analysis/Orkeon.Analysis/Adapters/*.cs — a new adapter
    // framework-side must be mirrored here (the probe's partition step trips live).
    const adapters = [
      ".ts", ".tsx", ".cs", ".py", ".go", ".rs", ".js", ".jsx", ".mjs", ".cjs", ".java", ".c",
      ".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx", ".h", ".php", ".rb", ".sh", ".bash",
    ];
    strictEqual(TREE_CODE_EXTENSIONS.length, 23);
    for (const ext of adapters) {
      ok(TREE_CODE_EXTENSIONS.includes(ext), ext);
    }
  });

  it("keeps the two sides disjoint", () => {
    // An extension in both lists would make the routing rule ambiguous — the whole
    // point is that each file has ONE right tool.
    for (const ext of TREE_CODE_EXTENSIONS) {
      ok(!RAG_DOCUMENT_EXTENSIONS.includes(ext), `${ext} is in both lists`);
    }
  });
});

describe("routeForPath", () => {
  it("routes code extensions to the tree", () => {
    for (const p of ["/workspace/src/a.ts", "/workspace/App.tsx", "b.cs", "x/y.py", "m.go", "lib.rs"]) {
      strictEqual(routeForPath(p), "tree", p);
    }
  });

  it("routes documents and configs to the rag", () => {
    for (const p of ["/workspace/README.md", "notes.txt", "data.csv", "report.pdf", "page.html"]) {
      strictEqual(routeForPath(p), "rag", p);
    }
  });

  it("routes the languages of Orkeon #195 to the tree, and its parse-only grammars to the rag", () => {
    for (const p of ["/workspace/src/app.js", "Main.java", "include/x.h", "index.php", "lib/a.rb", "build.sh"]) {
      strictEqual(routeForPath(p), "tree", p);
    }
    // CSS, HTML and JSON parse for the structural tools but enter no index.
    for (const p of ["README.md", "page.html", "package.json", "site.css"]) {
      strictEqual(routeForPath(p), "rag", p);
    }
  });

  it("routes UNKNOWN extensions to the rag — the tree cannot hold them", () => {
    // The tree's discovery filters by adapter extension: a .yaml/.toml/.xyz never
    // enters its store, so sending the query there manufactures a guaranteed-empty
    // answer that reads as "not found". The RAG's text loader at least has a chance.
    for (const p of ["config.yaml", "pyproject.toml", "Makefile", "weird.xyz", "no-extension"]) {
      strictEqual(routeForPath(p), "rag", p);
    }
  });

  it("is case-insensitive on the extension", () => {
    strictEqual(routeForPath("A.TS"), "tree");
    strictEqual(routeForPath("B.MD"), "rag");
  });
});

describe("extensionOf", () => {
  it("takes the last dot of the basename only", () => {
    strictEqual(extensionOf("/a/b.c/file.spec.ts"), ".ts");
    strictEqual(extensionOf("/a.b/README"), "");
  });

  it("a leading dot is a hidden file, not an extension", () => {
    strictEqual(extensionOf("/workspace/.gitignore"), "");
    strictEqual(extensionOf(".env"), "");
  });
});

describe("hasRagLoader", () => {
  it("true for declared loader extensions, false for the rest", () => {
    ok(hasRagLoader("doc.md"));
    ok(hasRagLoader("table.csv"));
    ok(!hasRagLoader("conf.yaml")); // no declared loader — ingestion may still refuse
  });
});

describe("describeSearchRouting — the playbook renders THIS", () => {
  it("names both tools, the collection, and the self-healing ingest path", () => {
    const text = describeSearchRouting();
    ok(text.includes("codebase_search"));
    ok(text.includes("rag_search"));
    ok(text.includes(WORKSPACE_DOCS_COLLECTION));
    ok(text.includes("rag_ingest"));
    // The one instruction that stops the wrong-tool retry loop:
    ok(text.includes("do not retry there"));
    // The ingest example names the files to ingest, not only Markdown.
    ok(text.includes("globs of those files"));
  });
});
