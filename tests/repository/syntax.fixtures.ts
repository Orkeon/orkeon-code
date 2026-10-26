// The sources the syntax readers of syntax.ts are run on, and the hits each one holds.
import type { SyntaxHit } from "./syntax.ts";

/** Hits as `<line>:<what>`, the file left out. */
export const linesOf = (hits: readonly SyntaxHit[]) => hits.map((h) => `${h.line}:${h.what}`);

/** A clock read on each of the first four lines, then reads of no clock, then three timers and a member named like one. */
export const CLOCK_SOURCE = [
  `const a = new Date();`,
  `const b = Date.now();`,
  `const c = Date();`,
  `const d = new globalThis.Date();`,
  `const e = new Date(0);`,
  `const f = Date.parse("2026-10-24");`,
  `const g = Date.UTC(2026, 9, 24);`,
  `setTimeout(() => {}, 5);`,
  `const h = setInterval(tick, 10);`,
  `setImmediate(done);`,
  `const i = obj.setTimeout(1);`,
  `// new Date() in a comment, and "Date.now()" in a string`,
].join("\n");

export const CLOCK_READS = ["1:new Date()", "2:Date.now()", "3:Date()", "4:new Date()"];
export const CLOCK_AND_TIMER_READS = [...CLOCK_READS, "8:setTimeout()", "9:setInterval()", "10:setImmediate()"];

/** Two ports among types of data, a function type and an interface the module keeps to itself. */
export const PORTS_SOURCE = [
  `export interface Shell { run(command: string): Promise<string> }`,
  `export interface ShellResult { stdout: string; exitCode: number }`,
  `export type Clock = () => Date;`,
  `export type Logger = { info: (line: string) => void };`,
  `interface Hidden { run(): void }`,
  `export interface Mount { path: string; readOnly?: boolean }`,
].join("\n");

/** A double with two fields a test sets and two methods, and a double that adds a method to it. */
export const DOUBLE_SOURCE = `
export class FakeFiles {
  files = new Map<string, string>();
  onWrite: ((path: string) => void) | null = null;
  async read(path: string) { return this.files.get(path) ?? ""; }
  async write(path: string, content: string) { this.files.set(path, content); }
}
export class FakeMountedFiles extends FakeFiles {
  async mounts() { return []; }
}
`;

export const DOUBLE_METHODS = [["FakeFiles", ["read", "write"]], ["FakeMountedFiles", ["read", "write", "mounts"]]];

export const PORTS: ReadonlySet<string> = new Set(["Shell", "HumanInput"]);
export const METHODS: ReadonlyMap<string, ReadonlySet<string>> = new Map([["FakeFiles", new Set(["read", "write"])]]);

/** A double derived on each line but the second: by class, by replacing a method, by an object literal typed as a port. */
export const DERIVED_SOURCE = [
  `class SpyFiles extends FakeFiles {}`,
  `const files = new FakeFiles();`,
  `files.write = async () => { throw new Error("full"); };`,
  `const human: HumanInput = { choice: async () => ({ answered: false }) };`,
  `export function person(): HumanInput { return { choice: async () => ({ answered: false }) }; }`,
  `const shell = { run: async () => RESULT } satisfies Shell;`,
  `class LocalShell implements Shell { async run() { return RESULT; } }`,
  `const llm = new (class extends StubLlm {})();`,
  `const echo = (): Promise<Shell> => Promise.resolve({ run: async () => RESULT } as Shell);`,
].join("\n");

export const DERIVED_DOUBLES = [
  "1:class SpyFiles extends FakeFiles",
  "3:FakeFiles.write replaced on an instance",
  "4:an object literal implements HumanInput",
  "5:an object literal implements HumanInput",
  "6:an object literal implements Shell",
  "7:class LocalShell implements Shell",
  "8:class (anonymous) extends StubLlm",
  "9:an object literal implements Shell",
];

/** An object literal typed as a part of a port on each line: Pick, Partial, Omit, Readonly, Required, nested. */
export const PICKED_SOURCE = [
  `const shell: Pick<Shell, "run"> = { run: async () => RESULT };`,
  `const human: Partial<HumanInput> = { choice: async () => ({ answered: false }) };`,
  `const other: Omit<Shell, "kill"> = { run: async () => RESULT };`,
  `export function person(): Readonly<Pick<HumanInput, "choice">> { return { choice: async () => ({ answered: false }) }; }`,
  `const echo = { run: async () => RESULT } as Required<Shell>;`,
].join("\n");

export const PICKED_DOUBLES = [
  "1:an object literal implements Shell",
  "2:an object literal implements HumanInput",
  "3:an object literal implements Shell",
  "4:an object literal implements HumanInput",
  "5:an object literal implements Shell",
];

/** What no double is: a field of a fake set, a fake built and used, a type of data, an error, a fake of no port. */
export const NOT_DERIVED_SOURCE = [
  `const files = new FakeFiles();`,
  `files.onWrite = (path) => seen.push(path);`,
  `await files.write("a", "b");`,
  `const result: ShellResult = { stdout: "", exitCode: 0 };`,
  `class Failure extends Error {}`,
  `const other = { write: async () => {} };`,
  `other.write = async () => {};`,
  `class Faker extends Base {}`,
].join("\n");
