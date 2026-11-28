// The packages the repository tests place: each with the paths of its exports, as package_summary returns them.
import type { PackageSummary } from "../../../../src/shared/domain/code-intel-contract.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

const fqnOf = (name: string): string => `${WORKSPACE}::${name}`;

/** A package whose code sits under the top folder `folder`, depending on the packages named. */
export function packageIn(folder: string, name: string, dependencies: string[] = []): PackageSummary {
  return {
    fqn: fqnOf(name), name, files: 2, symbols: 4, dependencies: dependencies.map(fqnOf), entryPoints: [],
    exports: [`${WORKSPACE}/${folder}/src/${name}/A.cs::A`, `${WORKSPACE}/${folder}/src/${name}/B.cs::B`],
  };
}

/** A package with the entry modules and exports given, as the index names them. */
export function packageNaming(entryPoints: string[], exports: string[]): PackageSummary {
  return { fqn: fqnOf("P"), name: "P", files: 1, symbols: 1, dependencies: [], entryPoints, exports };
}

/** Packages and the top folder each sits in: none when its names give no folder, or more than one. */
export const FOLDER_CASES: readonly { readonly name: string; readonly pkg: PackageSummary; readonly folder: string | undefined }[] = [
  { name: "reads the folder from the exports", pkg: packageNaming([], [`${WORKSPACE}/api/src/A.cs::A`]), folder: "api" },
  { name: "reads the folder from an entry module", pkg: packageNaming([`${WORKSPACE}/api/src/Program.cs`], []), folder: "api" },
  { name: "gives none to a package whose names sit in two folders",
    pkg: packageNaming([], [`${WORKSPACE}/api/src/A.cs::A`, `${WORKSPACE}/web/src/A.cs::A`]), folder: undefined },
  { name: "gives none to a package with a file at the root of the checkout",
    pkg: packageNaming([], [`${WORKSPACE}/api/src/A.cs::A`, `${WORKSPACE}/build.cs::Build`]), folder: undefined },
  { name: "gives none to a package that names nothing", pkg: packageNaming([], []), folder: undefined },
  { name: "gives none to a name outside the checkout", pkg: packageNaming([], ["/elsewhere/api/A.cs::A"]), folder: undefined },
];

/** Two services and a documentation folder: the API and its tests take the contracts of the platform. */
export const ACROSS: PackageSummary[] = [
  packageIn("api", "Api", ["Api.Domain", "Platform.Sdk", "Platform.Models"]),
  packageIn("api", "Api.Domain"),
  packageIn("platform", "Platform.Sdk", ["Platform.Models"]),
  packageIn("platform", "Platform.Models"),
  packageIn("docs", "convert"),
  packageIn("api", "Api.Tests", ["Api", "Platform.Sdk"]),
];

/** The repository of each package of ACROSS, `docs` being no repository. */
export const ACROSS_REPOSITORIES: ReadonlyArray<readonly [string, string]> = [
  [fqnOf("Api"), "api"], [fqnOf("Api.Domain"), "api"], [fqnOf("Platform.Sdk"), "platform"],
  [fqnOf("Platform.Models"), "platform"], [fqnOf("Api.Tests"), "api"],
];

/** What crosses between the repositories of ACROSS. */
export const ACROSS_DEPENDENCIES = [
  {
    from: "api", to: "platform",
    edges: [
      { from: fqnOf("Api"), to: [fqnOf("Platform.Sdk"), fqnOf("Platform.Models")] },
      { from: fqnOf("Api.Tests"), to: [fqnOf("Platform.Sdk")] },
    ],
  },
];
