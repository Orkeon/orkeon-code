// A batch of a parallel /dev-batches runs under its worktree, `/workspace/.orkeon/worktrees/<name>` (its working
// root), while the dev crews' code names the checkout `/workspace` everywhere: `/workspace` stays the logical
// checkout, and these functions map it at each boundary of the batch - onto the root on the way to the runtime
// and the model, back to `/workspace` on the way in. A path already under the root, a relative path and another
// mount (`/output`, `/tmp`) are kept; without a root every function is the identity. Pure.

export const WORKSPACE = "/workspace";

type Root = string | null | undefined;

/** A character that continues a path segment: `/workspace` followed by one is another name (`/workspaces`). */
const SEGMENT = /[\w.-]/;

/** True when the path ends at `at`: nothing that continues its name, or a dot that ends a sentence. */
const ends = (text: string, at: number): boolean =>
  at >= text.length || !SEGMENT.test(text[at]) || (text[at] === "." && (at + 1 >= text.length || /[\s"'`)\]]/.test(text[at + 1])));

/** `path` with its leading `/workspace` on the root; anything else as it is. */
export function toRoot(path: string, root?: Root): string {
  if (!root || isUnder(path, root) || !isUnder(path, WORKSPACE)) return path;
  return root + path.slice(WORKSPACE.length);
}

/** `path` with its leading root back on `/workspace`; anything else as it is. */
export function fromRoot(path: string, root?: Root): string {
  if (!root || !isUnder(path, root)) return path;
  return WORKSPACE + path.slice(root.length);
}

function isUnder(path: string, folder: string): boolean {
  return path.startsWith(folder) && (path.length === folder.length || path[folder.length] === "/");
}

/** Every `/workspace` path of a text (a prompt, a command, a tool's result) on the root, but one already under it. */
export function textToRoot(text: string, root?: Root): string {
  if (!root || !text.includes(WORKSPACE)) return text;
  let out = "";
  let from = 0;
  for (let at = text.indexOf(WORKSPACE); at >= 0; at = text.indexOf(WORKSPACE, at + 1)) {
    const starts = at === 0 || !/[\w./-]/.test(text[at - 1]);
    if (!starts || !ends(text, at + WORKSPACE.length)) continue;
    if (text.startsWith(root, at) && ends(text, at + root.length)) continue;
    out += text.slice(from, at) + root;
    from = at + WORKSPACE.length;
  }
  return out + text.slice(from);
}

/** Every path under the root of a text (a command's output, a call the model made) back on `/workspace`. */
export function textFromRoot(text: string, root?: Root): string {
  if (!root || !text.includes(root)) return text;
  let out = "";
  let from = 0;
  for (let at = text.indexOf(root); at >= 0; at = text.indexOf(root, at + 1)) {
    if (!ends(text, at + root.length) || (at > 0 && /[\w./-]/.test(text[at - 1]))) continue;
    out += text.slice(from, at) + WORKSPACE;
    from = at + root.length;
  }
  return out + text.slice(from);
}

/** `value` with `map` applied to each string it holds, at any depth; keys and other values kept. */
export function mapStrings<T>(value: T, map: (text: string) => string): T {
  if (typeof value === "string") return map(value) as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, map)) as T;
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = mapStrings(v, map);
  return out as T;
}
