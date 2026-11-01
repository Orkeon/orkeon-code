// The manifest lists and top-level listings the project-manifests helpers are tested on.

/** The manifests with scripts or targets, read first since the material is bounded, in their order. */
export const COMMANDS_FIRST = ["package.json", "pyproject.toml", "Makefile", "justfile", "Taskfile.yml", "Cargo.toml", "go.mod"];

/** The manifests the widened list adds, named or by suffix. */
export const WIDENED = [
  ".eslintrc.json", ".eslintrc.js", "eslint.config.js", "eslint.config.mjs", "biome.json", "ruff.toml",
  ".editorconfig", "justfile", "Taskfile.yml", "pom.xml", "build.gradle", "build.gradle.kts", "CONTRIBUTING.md",
  "*.csproj", "*.sln",
];

/** The expansions of a candidate list over a top-level listing. */
export const EXPANSIONS: Array<{ name: string; candidates: string[]; topLevel: string[]; expected: string[] }> = [
  { name: "keeps a named candidate as it is, listed or not", candidates: ["go.mod"], topLevel: [], expected: ["go.mod"] },
  {
    name: "replaces a suffix candidate by the top-level entries it matches, in listing order",
    candidates: ["package.json", "*.csproj"], topLevel: ["B.csproj", "src", "A.csproj"],
    expected: ["package.json", "B.csproj", "A.csproj"],
  },
  { name: "drops a suffix candidate that matches no entry", candidates: ["*.sln"], topLevel: ["src"], expected: [] },
  { name: "names a path once when two candidates reach it", candidates: ["App.sln", "*.sln"], topLevel: ["App.sln"], expected: ["App.sln"] },
];
