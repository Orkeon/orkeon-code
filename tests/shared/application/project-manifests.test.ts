// The manifest reads over FakeFiles. Run:
//   node --test tests/shared/application/project-manifests.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { listCiWorkflows, manifestsAsMaterial, readCiWorkflows, readConfigFiles, readManifests } from "../../../src/shared/application/project-manifests.ts";
import { MAX_CONFIG_FILE_CHARS, MAX_MANIFESTS_MATERIAL_CHARS, cutLine } from "../../../src/shared/domain/project-manifests.ts";
import { FakeFiles } from "../../support/doubles/fake-files.ts";
import {
  OVER_BUDGET, checkoutOfEveryKind, checkoutWithManifests, checkoutWithWorkflowFiles, checkoutWithWorkflows, dotnetCheckout,
} from "./project-manifests.fixtures.ts";
import { WORKSPACE } from "../../../src/shared/domain/vfs.ts";

describe("readManifests", () => {
  it("reads the manifests present in candidate order, skipping the absent and the empty ones", async () => {
    // Arrange
    const files = checkoutWithManifests();

    // Act
    const manifests = await readManifests(files);

    // Assert
    deepStrictEqual(manifests.map((m) => m.path), ["package.json", "go.mod"]);
  });

  it(`cuts a manifest at ${MAX_CONFIG_FILE_CHARS} characters`, async () => {
    // Arrange
    const files = checkoutWithManifests();

    // Act
    const manifests = await readManifests(files, ["go.mod"]);

    // Assert
    strictEqual(manifests[0].content.length, MAX_CONFIG_FILE_CHARS);
  });

  it("counts the characters left out of a cut manifest", async () => {
    // Arrange
    const files = checkoutWithManifests();

    // Act
    const manifests = await readManifests(files, ["go.mod"]);

    // Assert
    strictEqual(manifests[0].cut, 5000 - MAX_CONFIG_FILE_CHARS);
  });

  it("reads the top-level solution and project files found by one listing of the root", async () => {
    // Arrange
    const files = dotnetCheckout();

    // Act
    const manifests = await readManifests(files);

    // Assert
    deepStrictEqual(manifests, [{ path: "App.sln", content: "sln" }, { path: "App.csproj", content: "<Project/>" }]);
    deepStrictEqual(files.listed, [WORKSPACE]);
  });

  it("lists nothing when no suffix candidate is asked", async () => {
    // Arrange
    const files = checkoutWithManifests();

    // Act
    await readManifests(files, ["package.json"]);

    // Assert
    deepStrictEqual(files.listed, []);
  });
});

describe("listCiWorkflows", () => {
  it("names the files under .github/workflows", async () => {
    // Arrange
    const files = checkoutWithWorkflows();

    // Act
    const names = await listCiWorkflows(files);

    // Assert
    deepStrictEqual(names, ["ci.yml", "release.yml"]);
  });

  it("names none when the folder cannot be listed", async () => {
    // Arrange
    const files = new FakeFiles();
    files.listErrors.set(`${WORKSPACE}/.github/workflows`, new Error("not found"));

    // Act
    const names = await listCiWorkflows(files);

    // Assert
    deepStrictEqual(names, []);
  });
});

describe("readCiWorkflows", () => {
  it("reads the files under .github/workflows by their path, skipping the empty ones", async () => {
    // Arrange
    const files = checkoutWithWorkflowFiles();

    // Act
    const workflows = await readCiWorkflows(files);

    // Assert
    deepStrictEqual(workflows.map((w) => w.path), [".github/workflows/ci.yml", ".github/workflows/release.yml"]);
  });

  it(`cuts a workflow at ${MAX_CONFIG_FILE_CHARS} characters`, async () => {
    // Arrange
    const files = checkoutWithWorkflowFiles();

    // Act
    const workflows = await readCiWorkflows(files);

    // Assert
    strictEqual(workflows[1].content.length, MAX_CONFIG_FILE_CHARS);
  });

  it("reads none when the folder is absent", async () => {
    // Arrange
    const files = new FakeFiles();
    files.listErrors.set(`${WORKSPACE}/.github/workflows`, new Error("not found"));

    // Act
    const workflows = await readCiWorkflows(files);

    // Assert
    deepStrictEqual(workflows, []);
  });
});

describe("readConfigFiles", () => {
  it("reads the manifests that state commands, then the CI workflows, then the rules, CONTRIBUTING.md last", async () => {
    // Arrange
    const files = checkoutOfEveryKind();

    // Act
    const configs = await readConfigFiles(files);

    // Assert
    deepStrictEqual(configs.map((m) => m.path), ["Makefile", ".github/workflows/ci.yml", "biome.json", "CONTRIBUTING.md"]);
  });
});

describe("manifestsAsMaterial", () => {
  it("writes one file block per manifest, in order", () => {
    // Arrange
    const manifests = [{ path: "package.json", content: "{}" }, { path: "go.mod", content: "module m" }];

    // Act
    const material = manifestsAsMaterial(manifests);

    // Assert
    strictEqual(material, '<file path="package.json">\n{}\n</file>\n<file path="go.mod">\nmodule m\n</file>');
  });

  it("closes the block of a cut manifest with its cut line", () => {
    // Arrange
    const manifests = [{ path: "go.mod", content: "module m", cut: 7 }];

    // Act
    const material = manifestsAsMaterial(manifests);

    // Assert
    strictEqual(material, `<file path="go.mod">\nmodule m\n${cutLine(7)}\n</file>`);
  });

  it(`keeps every whole file while the material stays under ${MAX_MANIFESTS_MATERIAL_CHARS} characters`, () => {
    // Arrange
    const manifests = [{ path: "package.json", content: "p".repeat(MAX_CONFIG_FILE_CHARS) }, { path: "go.mod", content: "module m" }];

    // Act
    const material = manifestsAsMaterial(manifests);

    // Assert
    strictEqual(material.split("<file ").length - 1, 2);
  });

  it("leaves out a file over the budget, keeps a later one that fits, and names the one left out", () => {
    // Arrange
    const { manifests, max } = OVER_BUDGET;

    // Act
    const material = manifestsAsMaterial(manifests, max);

    // Assert
    strictEqual(material, OVER_BUDGET.expected);
  });
});
