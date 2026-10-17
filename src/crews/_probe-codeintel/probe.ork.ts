// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
// B-14 — deterministic code-intelligence probe (no LLM).
//
// The five code-intel tools sit in the main-loop catalogue and NOTHING in Orkeon Code had
// ever run them: their availability rested on framework DI registration, not on
// evidence from a run. Session 4 showed what that assumption is worth — two tools the
// backlog called "framework-registered and auto-bridged" were not registered at all,
// and `.tools([...])` drops an unknown name in silence.
//
// Running them turned out to be only half the problem. The first draft of this probe
// passed `symbol_name` (the parameter is `fqn`), asked for `direction: "callees"`
// (the enum is Forward | Backward | Both) and read counts from `files_indexed` (the
// field is `file_count`) — so it reported "3 passed, indexed 0 files" on a workspace
// the tool had just indexed correctly. Every name it uses now comes from
// shared/domain/code-intel-contract.ts, read off live calls and pinned by tests.
//
// Run:  bash scripts/run-crew.sh src/crews/_probe-codeintel/probe.ork.ts --mode source

import {
  CODE_INTEL_TOOLS, readIndexSummary, readMapEntries, readMapSymbolCount,
  readSearchHits, readSymbolSource, readFlowPathCount, firstSymbolFqn,
  readMatchOrigin, readRefreshedFiles, RAG_RAGGABLE_TREE_COLLECTION,
  readGraph, readImpact, readPackageSummary, readSymbolDetail,
} from "../../shared/domain/code-intel-contract.ts";
import { WORKSPACE_DOCS_COLLECTION } from "../../shared/domain/search-routing.ts";

const probe = (globalThis as any).agentBuilder()
  .name("probe")
  .role("Code-intelligence probe")
  .goal("Run every code-intel tool against the mounted workspace and report what each returned.")
  .tools([...CODE_INTEL_TOOLS, "file_write", "rag_search"])
  .body(async (_input: any, ctx: any) => {
    const t = (globalThis as any).tools;
    const steps: Array<{ tool: string; ok: boolean; detail: string }> = [];

    /** One probe step. A failure is RECORDED, never fatal: the point is one row per
     *  tool, and stopping at the first failure would hide the other four. */
    async function step(tool: string, call: () => Promise<any>, summarize: (r: any) => string) {
      try {
        const detail = summarize(await call());
        steps.push({ tool, ok: true, detail });
        ctx.log.info(`${tool}: ${detail}`);
      } catch (e: any) {
        const detail = String(e?.message ?? e).split("\n")[0];
        steps.push({ tool, ok: false, detail });
        ctx.log.warn(`${tool} FAILED: ${detail}`);
      }
    }

    // Languages omitted on purpose: auto-detected from what is mounted, so the probe
    // works on the TS fixture and on a C#/Python repo alike.
    await step(
      "index_codebase",
      () => t.indexCodebase({ root_path: "/workspace" }),
      (r) => {
        const s = readIndexSummary(r);
        // An index that found no file is a FAILED probe dressed as a pass — the
        // tools downstream would all return empty and each look fine.
        if (s.files === 0) throw new Error("indexed 0 files — nothing for the other tools to query");
        return `${s.files} file(s), ${s.nodes} node(s), ${s.edges} edge(s), ${s.statements} statement(s)` +
               (s.errors.length > 0 ? ` [${s.errors.length} error(s)]` : "");
      },
    );

    // The map is needed twice: as a step, and as the source of the FQN the
    // symbol-level tools take. Kept so a map failure does not double-report.
    let mapRaw: any = null;
    await step(
      "codebase_map",
      async () => (mapRaw = await t.codebaseMap({ level: "L3_Symbol", include_metrics: true })),
      (r) => `${readMapEntries(r).length} entr(y/ies), totals.symbol_count=${readMapSymbolCount(r)}`,
    );

    await step(
      "codebase_search",
      () => t.codebaseSearch({ query: "add", top_k: 5 }),
      (r) => {
        const hits = readSearchHits(r);
        return hits.length === 0
          ? "0 hits for 'add' (valid answer, but nothing to show)"
          : `${hits.length} hit(s), best ${hits[0].fqn} @ ${hits[0].score.toFixed(3)}`;
      },
    );

    // FQN taken from the map, never invented: an invented name would make the probe
    // fail on every workspace but this fixture.
    const fqn = firstSymbolFqn(mapRaw);
    if (fqn.length === 0) {
      for (const tool of ["symbol_source", "flow_trace"]) {
        steps.push({ tool, ok: false, detail: "skipped — the map reported no symbol to query" });
        ctx.log.warn(`${tool}: skipped, no symbol available`);
      }
    } else {
      await step(
        "symbol_source",
        () => t.symbolSource({ fqn }),
        (r) => {
          const s = readSymbolSource(r);
          if (s.source.length === 0) throw new Error(`no source returned for ${fqn}`);
          return `${s.source.length} chars from ${s.file}:${s.lines}`;
        },
      );
      await step(
        "flow_trace",
        () => t.flowTrace({ fqn, direction: "Forward", max_depth: 2 }),
        // 0 paths is a legitimate answer for a leaf symbol: the probe asserts the
        // call is ACCEPTED and shaped as promised, not that the fixture has a graph.
        (r) => `${readFlowPathCount(r)} path(s) forward from ${fqn}`,
      );
    }

    // ── Hybrid + freshness + RAG routing (PLAN C5) ─────────────────────────

    await step(
      "codebase_search (hybrid exact-identifier)",
      () => t.codebaseSearch({ query: "sumAndScale", top_k: 3 }),
      (r) => {
        const hits = readSearchHits(r);
        if (hits.length === 0) throw new Error("no hit for an identifier the index holds");
        const origin = readMatchOrigin((r?.hits ?? [])[0]);
        // The whole point of hybrid: an exact identifier must rank via the lexical
        // half (hybrid/bm25) — pure vector cannot guarantee that.
        if (origin === "vector") throw new Error(`top hit ranked vector-only (${hits[0].fqn}) — hybrid not engaged`);
        return `top hit ${hits[0].fqn} via ${origin}`;
      },
    );

    await step(
      "freshness round-trip (write → search sees it)",
      async () => {
        await t.fileWrite({
          path: "/workspace/src/probe-freshness.ts",
          content: "export function probeFreshnessSymbol(x: number): number {\n  return x + 1;\n}\n",
        });
        return await t.codebaseSearch({ query: "probeFreshnessSymbol", top_k: 3 });
      },
      (r) => {
        const hits = readSearchHits(r);
        const refreshed = readRefreshedFiles(r);
        if (!hits.some((h) => h.fqn.includes("probeFreshnessSymbol"))) {
          throw new Error("the just-written symbol is NOT in the results — freshness failed");
        }
        if (refreshed < 1) throw new Error("found the symbol but refreshed_files=0 — freshness not attributed");
        return `found after write; search paid refreshed_files=${refreshed}`;
      },
    );

    await step(
      "routing partition (tree ≠ docs): a .md is invisible to the code index, visible to the RAG",
      async () => {
        await t.fileWrite({
          path: "/workspace/PROBE-NOTES.md",
          content: "# Probe notes\n\nThe zanzibar-marker paragraph lives only in this markdown file.\n",
        });
        const tree = await t.codebaseSearch({ query: "zanzibar-marker", top_k: 3 });
        await t.ragIngest({ collection: WORKSPACE_DOCS_COLLECTION, sources: ["/workspace/PROBE-NOTES.md"] });
        const rag = await t.ragSearch({ question: "zanzibar-marker paragraph", collection: WORKSPACE_DOCS_COLLECTION });
        return { tree, rag };
      },
      (r) => {
        // The tree's discovery filters by adapter extension: the .md must NOT appear
        // there — a hit would mean the routing rule lies to the model.
        const treeHits = readSearchHits(r.tree).filter((h) => h.fqn.includes("PROBE-NOTES"));
        if (treeHits.length > 0) throw new Error(".md leaked into the code index — the partition is wrong");
        const ragText = String(r.rag ?? "");
        if (!ragText.includes("PROBE-NOTES")) throw new Error("ingested .md not found by rag_search");
        return "tree blind to the .md (by design), rag serves it after ingest";
      },
    );

    await step(
      "rag_search routed to the code index",
      () => t.ragSearch({ question: "greet function", collection: RAG_RAGGABLE_TREE_COLLECTION }),
      (r) => {
        const text = String(r ?? "");
        if (!text.includes("greet")) throw new Error("rag_search(raggable-tree) did not surface the symbol");
        return "sources include the greet symbol";
      },
    );

    // ── The analysis five (catalogue extension) ────────────────────────────
    // Each step logs the RAW payload before asserting: the contract pins in
    // code-intel-contract.ts are written from what these lines print on a live
    // run, never from the C# source alone (B-14 discipline — the map's own
    // `level: "l3_Symbol"` casing is the standing proof that guessing loses).

    await step(
      "dependency_graph",
      async () => {
        const r = await t.dependencyGraph({ scope: "L2_Module", max_nodes: 50, include_mermaid: false });
        ctx.log.info(`dependency_graph RAW: ${JSON.stringify(r)}`);
        return r;
      },
      (r) => {
        const g = readGraph(r);
        if (g.nodeCount === 0) throw new Error("a freshly indexed workspace reported an empty module graph");
        return `${g.nodeCount} node(s), ${g.edgeCount} edge(s), ${g.cycleCount} cycle(s)`;
      },
    );

    if (fqn.length === 0) {
      for (const tool of ["impact_analysis", "symbol_detail", "sub_graph"]) {
        steps.push({ tool, ok: false, detail: "skipped — the map reported no symbol to query" });
        ctx.log.warn(`${tool}: skipped, no symbol available`);
      }
    } else {
      await step(
        "impact_analysis",
        async () => {
          const r = await t.impactAnalysis({ target: fqn, direction: "Backward", max_depth: 2 });
          ctx.log.info(`impact_analysis RAW: ${JSON.stringify(r)}`);
          return r;
        },
        // Zero impact is legitimate for a leaf: the probe asserts the call is
        // ACCEPTED and the response is shaped as pinned, not that the fixture
        // has callers.
        (r) => {
          const s = readImpact(r);
          if (s.target.length === 0) throw new Error("response carries no target echo — reader misaligned?");
          return `${s.direct.length} direct, ${s.transitive.length} transitive, ${Object.keys(s.byPackage).length} package(s)`;
        },
      );

      await step(
        "symbol_detail",
        async () => {
          const r = await t.symbolDetail({ fqn, include_signature: true });
          ctx.log.info(`symbol_detail RAW: ${JSON.stringify(r)}`);
          return r;
        },
        (r) => {
          const d = readSymbolDetail(r);
          if (d.fqn.length === 0) throw new Error(`no detail returned for ${fqn}`);
          return `${d.kind} ${d.name}, signature ${d.signature.length > 0 ? "present" : "ABSENT"}, ${d.callers} caller(s)/${d.callees} callee(s)`;
        },
      );

      await step(
        "sub_graph",
        async () => {
          const r = await t.subGraph({ seeds: [fqn], depth: 2, direction: "Forward" });
          ctx.log.info(`sub_graph RAW: ${JSON.stringify(r)}`);
          return r;
        },
        (r) => {
          const g = readGraph(r);
          if (g.nodeCount === 0) throw new Error("a seeded sub-graph must at least contain its seed");
          return `${g.nodeCount} node(s), ${g.edgeCount} edge(s) from seed`;
        },
      );
    }

    await step(
      "package_summary",
      async () => {
        // The package FQN comes from the L1 map, same never-invent rule as `fqn`.
        const l1: any = await t.codebaseMap({ level: "L1_Package" });
        const pkgFqn = firstSymbolFqn(l1);
        if (pkgFqn.length === 0) throw new Error("skipped — the L1 map reported no package");
        const r = await t.packageSummary({ fqn: pkgFqn });
        ctx.log.info(`package_summary RAW: ${JSON.stringify(r)}`);
        return r;
      },
      (r) => {
        const p = readPackageSummary(r);
        if (p.fqn.length === 0) throw new Error("response carries no fqn echo — reader misaligned?");
        return `${p.fqn}: ${p.files} file(s), ${p.symbols} symbol(s), ${p.dependencies.length} dep(s)`;
      },
    );

    const passed = steps.filter((s) => s.ok).length;
    return JSON.stringify(
      { probe: "code-intel", tools: CODE_INTEL_TOOLS.length, passed, failed: steps.length - passed, steps },
      null,
      2,
    );
  })
  .build();

(globalThis as any).crew = (globalThis as any).crewBuilder()
  .name("probe-codeintel")
  .process("sequential")
  .withAgent(probe)
  .build();
