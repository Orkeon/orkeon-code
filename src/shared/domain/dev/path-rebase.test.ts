// The logical /workspace of a batch, rebased on its working root and back. Run:
//   node --test src/shared/domain/dev/path-rebase.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { fromRoot, mapStrings, textFromRoot, textToRoot, toRoot } from "./path-rebase.ts";

const ROOT = "/workspace/.orkeon/worktrees/prune-F2";

describe("toRoot", () => {
  it("maps /workspace and a path under it onto the root", () => {
    strictEqual(toRoot("/workspace", ROOT), ROOT);
    strictEqual(toRoot("/workspace/", ROOT), `${ROOT}/`);
    strictEqual(toRoot("/workspace/src/a.ts", ROOT), `${ROOT}/src/a.ts`);
  });

  it("keeps a path already under the root, a relative path, another mount and a look-alike", () => {
    for (const p of [`${ROOT}/src/a.ts`, ROOT, "src/a.ts", "/output/jobs/1.log", "/tmp/x", "/workspaces/a", "/workspace-old/a"]) {
      strictEqual(toRoot(p, ROOT), p);
    }
  });

  it("is the identity without a root", () => {
    for (const p of ["/workspace/src/a.ts", "/workspace", "src/a.ts"]) strictEqual(toRoot(p), p);
    strictEqual(toRoot("/workspace/a", null), "/workspace/a");
  });
});

describe("fromRoot", () => {
  it("maps the root and a path under it back to /workspace", () => {
    strictEqual(fromRoot(ROOT, ROOT), "/workspace");
    strictEqual(fromRoot(`${ROOT}/src/a.ts`, ROOT), "/workspace/src/a.ts");
  });

  it("keeps anything else, and is the identity without a root", () => {
    for (const p of ["/workspace/src/a.ts", `${ROOT}-x/a`, "src/a.ts", "/output/a"]) strictEqual(fromRoot(p, ROOT), p);
    strictEqual(fromRoot(`${ROOT}/a`), `${ROOT}/a`);
  });
});

describe("textToRoot", () => {
  it("maps every /workspace path of a text, and leaves one already under the root", () => {
    const text = `Read /workspace/workbench/prune/PRUNE-PLAN-F2.md, then ${ROOT}/src/a.ts and "/workspace". Not /workspaces/x.`;
    strictEqual(
      textToRoot(text, ROOT),
      `Read ${ROOT}/workbench/prune/PRUNE-PLAN-F2.md, then ${ROOT}/src/a.ts and "${ROOT}". Not /workspaces/x.`,
    );
  });

  it("maps a path inside a command and after a separator", () => {
    strictEqual(textToRoot("cd /workspace && cat '/workspace/a b'", ROOT), `cd ${ROOT} && cat '${ROOT}/a b'`);
    strictEqual(textToRoot("x=/workspace/a:/workspace/b", ROOT), `x=${ROOT}/a:${ROOT}/b`);
  });

  it("maps a path that ends a sentence, and keeps a name that goes on after a dot", () => {
    strictEqual(textToRoot("Work in /workspace. Then /workspace/a.ts.", ROOT), `Work in ${ROOT}. Then ${ROOT}/a.ts.`);
    strictEqual(textToRoot("not /workspace.old/a", ROOT), "not /workspace.old/a");
    strictEqual(textFromRoot(`in ${ROOT}.`, ROOT), "in /workspace.");
  });

  it("leaves a text without a root as it is", () => {
    strictEqual(textToRoot("/workspace/a", undefined), "/workspace/a");
  });
});

describe("textFromRoot", () => {
  it("maps every path under the root of a text back to /workspace", () => {
    strictEqual(textFromRoot(`${ROOT}\n${ROOT}/src/a.ts:3: error`, ROOT), "/workspace\n/workspace/src/a.ts:3: error");
    strictEqual(textFromRoot(`${ROOT}-F3/a`, ROOT), `${ROOT}-F3/a`);
  });
});

describe("mapStrings", () => {
  it("maps every string of a value, keys and other values kept", () => {
    deepStrictEqual(
      mapStrings({ path: "/workspace/a", n: 2, ops: [{ path: "/workspace/b" }, null], ok: true }, (s) => textToRoot(s, ROOT)),
      { path: `${ROOT}/a`, n: 2, ops: [{ path: `${ROOT}/b` }, null], ok: true },
    );
    strictEqual(mapStrings("/workspace", (s) => textToRoot(s, ROOT)), ROOT);
  });
});
