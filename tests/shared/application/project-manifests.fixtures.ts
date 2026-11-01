// The checkouts the manifest reads are tested over.
import { FakeFiles } from "../../support/doubles/fake-files.ts";
import { WORKSPACE } from "../../../src/shared/domain/vfs.ts";

/** A checkout with a short package.json, a go.mod of 5 000 characters and an empty Makefile. */
export function checkoutWithManifests(): FakeFiles {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/package.json`, "{}");
  files.files.set(`${WORKSPACE}/go.mod`, "m".repeat(5000));
  files.files.set(`${WORKSPACE}/Makefile`, "");
  return files;
}

/** A .NET checkout: a solution and a project at the top level, beside a folder. */
export function dotnetCheckout(): FakeFiles {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, ["App.csproj", "src", "App.sln"]);
  files.files.set(`${WORKSPACE}/App.sln`, "sln");
  files.files.set(`${WORKSPACE}/App.csproj`, "<Project/>");
  return files;
}

/** A checkout with two CI workflows. */
export function checkoutWithWorkflows(): FakeFiles {
  const files = new FakeFiles();
  files.listings.set(`${WORKSPACE}/.github/workflows`, ["ci.yml", "release.yml"]);
  return files;
}

/** A workflow of 5 000 characters. */
export const LONG_WORKFLOW = "w".repeat(5000);

/** A checkout with the workflows ci.yml (one step), release.yml (LONG_WORKFLOW) and an empty nightly.yml. */
export function checkoutWithWorkflowFiles(): FakeFiles {
  const files = new FakeFiles();
  files.listings.set(`${WORKSPACE}/.github/workflows`, ["ci.yml", "release.yml", "nightly.yml"]);
  files.files.set(`${WORKSPACE}/.github/workflows/ci.yml`, "steps:\n  - run: npm test\n");
  files.files.set(`${WORKSPACE}/.github/workflows/release.yml`, LONG_WORKFLOW);
  files.files.set(`${WORKSPACE}/.github/workflows/nightly.yml`, "");
  return files;
}

/** A checkout with a lint configuration, a CI workflow, CONTRIBUTING.md and a Makefile. */
export function checkoutOfEveryKind(): FakeFiles {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, ["CONTRIBUTING.md", "biome.json", "Makefile", ".github"]);
  files.listings.set(`${WORKSPACE}/.github/workflows`, ["ci.yml"]);
  for (const path of ["CONTRIBUTING.md", "biome.json", "Makefile", ".github/workflows/ci.yml"]) {
    files.files.set(`${WORKSPACE}/${path}`, "x");
  }
  return files;
}

/** Three manifests under a 100-character budget: the second (a 60-character Makefile) does not fit, the third does. */
export const OVER_BUDGET = {
  manifests: [
    { path: "package.json", content: "a".repeat(10) },
    { path: "Makefile", content: "b".repeat(60) },
    { path: "go.mod", content: "c".repeat(10) },
  ],
  max: 100,
  expected: [
    `<file path="package.json">\n${"a".repeat(10)}\n</file>`,
    `<file path="go.mod">\n${"c".repeat(10)}\n</file>`,
    "[… cut: 1 file(s) left out, over 100 characters: Makefile …]",
  ].join("\n"),
};
