// The paths workspaceRelative is tested on.

export interface RelativeCase {
  name: string;
  path: string;
  expected: string;
}

export const RELATIVE_CASES: readonly RelativeCase[] = [
  { name: "cuts the checkout off a path under it", path: "/workspace/src/a.ts", expected: "src/a.ts" },
  { name: "keeps the checkout itself as given", path: "/workspace", expected: "/workspace" },
  { name: "keeps a path of another mount", path: "/output/jobs/j1.log", expected: "/output/jobs/j1.log" },
  { name: "keeps a path whose first segment only starts like the checkout", path: "/workspaces/a.ts", expected: "/workspaces/a.ts" },
  { name: "keeps a relative path", path: "src/a.ts", expected: "src/a.ts" },
];
