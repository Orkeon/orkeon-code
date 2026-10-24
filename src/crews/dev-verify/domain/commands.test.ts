// Unit tests for the frozen shell lines of /dev-verify. Run:
//   node --test src/crews/dev-verify/domain/commands.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  GIT_CHANGED_TRACKED, GIT_DIFF_CHECK, buildOutputProblem, excludePathspecs, findNewer,
  gitDiffTracked, gitDiffUntracked, gitMethodGrep, gitStatusShort, gitTestFilesNaming, gitTraitGrep, gitUntracked,
  shellWord,
} from "./commands.ts";

const EX = excludePathspecs(["bin", "obj"]);
const ERE = '\\[Trait\\("BR", *"[BCU][CHR]-[0-9]+"\\)\\]';

describe("shellWord", () => {
  it("keeps a plain word, quotes a spaced one, refuses a single quote", () => {
    strictEqual(shellWord("src/Ledger/Account.cs"), "src/Ledger/Account.cs");
    strictEqual(shellWord("a-b_c.d/e@f+g,h:i=j"), "a-b_c.d/e@f+g,h:i=j");
    strictEqual(shellWord("docs/my notes.md"), "'docs/my notes.md'");
    strictEqual(shellWord("$(x)"), "'$(x)'");
    strictEqual(shellWord(""), "''");
    strictEqual(shellWord("it's"), null);
  });
});

describe("buildOutputProblem and excludePathspecs", () => {
  it("refuses a path, '.', '..' and the empty name", () => {
    for (const o of ["", ".", "..", "out/bin"]) {
      strictEqual(buildOutputProblem(o), `layout.build_outputs takes folder names, not paths: ${o}`);
    }
    strictEqual(buildOutputProblem("bin"), undefined);
  });
  it("gives one quoted exclude pathspec per folder", () => {
    deepStrictEqual(EX, ["':(exclude,glob)**/bin/**'", "':(exclude,glob)**/obj/**'"]);
    deepStrictEqual(excludePathspecs([]), []);
  });
});

describe("the frozen lines", () => {
  it("GIT_CHANGED_TRACKED, GIT_DIFF_CHECK", () => {
    strictEqual(GIT_CHANGED_TRACKED, "git diff --name-only HEAD");
    strictEqual(GIT_DIFF_CHECK, "git diff --check HEAD");
  });
  it("gitUntracked", () => {
    strictEqual(gitUntracked(EX),
      "git ls-files --others --exclude-standard -- . ':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'");
    strictEqual(gitUntracked([]), "git ls-files --others --exclude-standard -- .");
  });
  it("gitTraitGrep", () => {
    strictEqual(gitTraitGrep(ERE, ["src", "tests"], EX),
      `git grep --untracked -I -noE -e '${ERE}' -- src tests ':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'`);
    strictEqual(gitTraitGrep("// *rule: *[BCU][CHR]-[0-9]+", ["."], []),
      "git grep --untracked -I -noE -e '// *rule: *[BCU][CHR]-[0-9]+' -- .");
  });
  it("gitStatusShort", () => {
    strictEqual(gitStatusShort(EX), "git status --short -- . ':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'");
    strictEqual(gitStatusShort([]), "git status --short -- .");
  });
  it("gitDiffTracked and gitDiffUntracked, per file", () => {
    strictEqual(gitDiffTracked("src/A.cs"), "git diff HEAD -- src/A.cs");
    strictEqual(gitDiffTracked("docs/a b.md"), "git diff HEAD -- 'docs/a b.md'");
    strictEqual(gitDiffTracked("it's.md"), null);
    strictEqual(gitDiffUntracked("src/B.cs"), "git diff --no-index -- /dev/null src/B.cs");
    strictEqual(gitDiffUntracked("it's.md"), null);
  });
  it("gitMethodGrep", () => {
    strictEqual(gitMethodGrep(["ShouldA", "ShouldB"], ["tests"], EX),
      "git grep --untracked -I -n -o -w -F -e ShouldA -e ShouldB -- tests ':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'");
    strictEqual(gitMethodGrep(["m"], ["tests", "spec"], []), "git grep --untracked -I -n -o -w -F -e m -- tests spec");
  });
  it("gives null when a list is left empty once the unquotable entries are dropped", () => {
    strictEqual(gitTraitGrep(ERE, ["it's"], EX), null);
    strictEqual(gitMethodGrep(["it's"], ["tests"], []), null);
    strictEqual(gitMethodGrep(["m"], ["it's"], []), null);
    strictEqual(gitMethodGrep(["m", "it's"], ["tests", "it's"], []), "git grep --untracked -I -n -o -w -F -e m -- tests");
  });
  it("puts -e before a trait pattern that starts with '-'", () => {
    strictEqual(gitTraitGrep("-x", ["."], []), "git grep --untracked -I -noE -e '-x' -- .");
  });
  it("gitTestFilesNaming", () => {
    strictEqual(gitTestFilesNaming("Account", ["tests", "."], "cs", EX),
      "git grep --untracked -I -lw -e Account -- ':(glob)tests/**/*.cs' ':(glob)**/*.cs' ':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'");
    strictEqual(gitTestFilesNaming("Account", [""], "ts", []), "git grep --untracked -I -lw -e Account -- ':(glob)**/*.ts'");
    strictEqual(gitTestFilesNaming("Order.Lines", ["tests"], "cs", []), null);
    strictEqual(gitTestFilesNaming("Account", ["it's"], "cs", []), null);
  });
  it("findNewer", () => {
    strictEqual(findNewer(["src/A.cs", "a b.cs"], "workbench/x/logs/build.txt"),
      "find ./src/A.cs './a b.cs' -maxdepth 0 -newer workbench/x/logs/build.txt");
    strictEqual(findNewer(["-delete", "src/a.ts"], "w/logs/F1-build.txt"), "find ./-delete ./src/a.ts -maxdepth 0 -newer w/logs/F1-build.txt");
    strictEqual(findNewer(["/etc/passwd"], "log"), null);
    strictEqual(findNewer(["it's"], "log"), null);
    strictEqual(findNewer(["a"], "it's"), null);
    strictEqual(findNewer(Array.from({ length: 201 }, (_, i) => `f${i}`), "log"), null);
    strictEqual(findNewer(Array.from({ length: 200 }, () => "f"), "log")?.startsWith("find ./f ./f "), true);
  });
});
