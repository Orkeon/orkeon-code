// The registry files, refusals and the harness the /agents tests run over (FakeFiles, FakeCrewHost).
import { AGENTS_FILE_PATH, AGENTS_USAGE, SAVED_AGENTS_NOTE, runAgents } from "../src/commands/_lib/agents.ts";
import type { CommandView } from "../src/commands/_lib/view.ts";
import { describeAgentRows } from "../src/shared/domain/agent-registry.ts";
import { builtInCharterRows } from "../src/shared/domain/agents/built-in-charters.ts";
import { FakeCrewHost } from "./support/doubles/fake-crew-host.ts";
import { FakeFiles } from "./support/doubles/fake-files.ts";

export const MALFORMED_REFUSAL =
  `refusing to write: ${AGENTS_FILE_PATH} exists but could not be parsed, and overwriting ` +
  "it would discard whatever it holds. Fix or delete it, then retry.";

export const UNPARSED_REFUSAL = `refusing to write: ${AGENTS_FILE_PATH} could not be parsed.`;

export const UNPARSED_WARNING = `⚠ ${AGENTS_FILE_PATH} could not be parsed; it is left untouched.`;

export const NO_SAVED_BOB = "no saved agent 'bob'. /agents list shows what there is.";

/** Not JSON at all. */
export const NOT_JSON = "{ not json";

/** Valid JSON, but a field no String() can convert: the registry could not be parsed, exactly as with invalid JSON. */
export const UNREADABLE = '{"bob":{"role":{"toString":1,"valueOf":1},"goal":"g"}}';

/** The whole view `/agents` and `/agents list` answer over the two crews and the saved agent `tester` (QA, find bugs). */
export function testerListView(): CommandView {
  return {
    table: [
      ...describeAgentRows(["main-loop", "code-review"], [{ name: "tester", role: "QA", goal: "find bugs", tools: [] }]),
      ...builtInCharterRows(),
    ],
    text: `file: ${AGENTS_FILE_PATH} (survives /clear)\n${SAVED_AGENTS_NOTE}`,
  };
}

export interface AgentsHarness {
  files: FakeFiles;
  crews: FakeCrewHost;
  /** Runs `/agents <tokens…>`. */
  run(...tokens: string[]): Promise<CommandView>;
  /** The registry file as it is stored, `{}` when absent. */
  stored(): unknown;
}

/** /agents over two discovered crews (main-loop, code-review) and the registry given: an object stored as JSON, or a raw text. */
export function agentsHarness(registry?: object | string): AgentsHarness {
  const files = new FakeFiles();
  const crews = new FakeCrewHost();
  crews.crews = ["main-loop", "code-review"];
  if (registry !== undefined) {
    files.files.set(AGENTS_FILE_PATH, typeof registry === "string" ? registry : JSON.stringify(registry));
  }
  return {
    files,
    crews,
    run: (...tokens) => runAgents(tokens, { files, crews }),
    stored: () => JSON.parse(files.files.get(AGENTS_FILE_PATH) ?? "{}"),
  };
}

export interface RefusalCase {
  name: string;
  tokens: string[];
  text: string;
}

/** An unreadable registry: what each sub-command answers, none of them writing. */
export const UNREADABLE_REGISTRY_CASES: readonly RefusalCase[] = [
  { name: "shows nothing for a name it may hold", tokens: ["show", "bob"], text: NO_SAVED_BOB },
  { name: "refuses to add over it", tokens: ["add", "tester", "QA", "|", "find bugs"], text: MALFORMED_REFUSAL },
  { name: "refuses to remove from it", tokens: ["remove", "bob"], text: UNPARSED_REFUSAL },
];

export const INVALID_DEFINITION_CASES: readonly RefusalCase[] = [
  { name: "refuses a definition without a goal with the usage line", tokens: ["add", "tester", "QA"], text: `agent 'tester' needs a goal\n${AGENTS_USAGE}` },
  {
    name: "refuses a definition without a name with the usage line",
    tokens: ["add"],
    text: `'' is not a valid agent name (lowercase letters, digits and '-', starting with a letter)\n${AGENTS_USAGE}`,
  },
];

export const REMOVE_REFUSAL_CASES: readonly RefusalCase[] = [
  { name: "asks for a name", tokens: ["remove"], text: AGENTS_USAGE },
  {
    name: "refuses a built-in crew",
    tokens: ["remove", "Code-Review"],
    text: "'Code-Review' is a built-in crew — it is not stored here and cannot be removed with /agents.",
  },
  { name: "refuses an unknown name", tokens: ["remove", "ghost"], text: "no saved agent 'ghost'." },
];
