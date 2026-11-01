// The checkouts the project-init reads are tested over.
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeCodeIndex } from "../../../support/doubles/fake-code-index.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { MAX_EXISTING_FILE_CHARS } from "../../../../src/crews/project-init/domain/existing-files.ts";

/** A checkout with `count` top-level entries. */
export function checkoutWithEntries(count: number): FakeFiles {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, Array.from({ length: count }, (_, i) => `f${i}`));
  return files;
}

/** A checkout with a short package.json and a go.mod of 5 000 characters. */
export function checkoutWithConfigs(): FakeFiles {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/package.json`, "{}");
  files.files.set(`${WORKSPACE}/go.mod`, "m".repeat(5000));
  return files;
}

/** A checkout with a .cursorrules, a CLAUDE.md and a blank AGENTS.md. */
export function checkoutWithInstructions(): FakeFiles {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/.cursorrules`, "tabs\n");
  files.files.set(`${WORKSPACE}/CLAUDE.md`, "pnpm\n");
  files.files.set(`${WORKSPACE}/AGENTS.md`, "  \n");
  return files;
}

/** A checkout with a package.json and a CI workflow. */
export function checkoutWithWorkflow(): FakeFiles {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/package.json`, "{}");
  files.listings.set(`${WORKSPACE}/.github/workflows`, ["ci.yml"]);
  files.files.set(`${WORKSPACE}/.github/workflows/ci.yml`, "steps:\n  - run: npm test\n");
  return files;
}

/** A checkout whose CLAUDE.md is `extra` characters over the bound of an existing file. */
export function checkoutWithLongClaude(extra: number): FakeFiles {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/CLAUDE.md`, "c".repeat(MAX_EXISTING_FILE_CHARS + extra));
  return files;
}

/** An index holding one root: two packages, Api depending on Core. */
export function indexWithPackages(): FakeCodeIndex {
  const index = new FakeCodeIndex();
  index.roots = 1;
  index.maps["L1_Package"] = {
    entries: [
      { fqn: "/workspace::Core", name: "Core", kind: "package", children: 3 },
      { fqn: "/workspace::Api", name: "Api", kind: "package", children: 2 },
    ],
    symbolCount: 0,
  };
  index.graph = {
    nodes: [{ fqn: "/workspace::Core", name: "Core", kind: "package" }, { fqn: "/workspace::Api", name: "Api", kind: "package" }],
    edges: [{ from: "/workspace::Api", to: "/workspace::Core", kind: "imports" }],
    nodeCount: 2, edgeCount: 1, cycleCount: 0, cycles: [], cyclesTruncated: false,
  };
  return index;
}

/** The package map of indexWithPackages(). */
export const PACKAGE_MAP = "2 package(s), each with the packages it depends on:\n- Core\n- Api ← depends on Core";
