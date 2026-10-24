// @orkeon-script 1.0
//
// Orkeon Code's session start script, as the runtime runs it: the launcher copies this file to
// /tmp/orkeon-code/session-start.ork.ts at every start and names it in
// Orkeon:Cli:Session:StartScript. The runtime runs a `.ork.ts` start script through its script
// host, once at the REPL's start, and puts what it prints before the first free-text turn
// (ScriptHostStartScriptRunner). Any other file would go through `sh` and shell_command, which
// the runtime cannot do here: the file system refuses a `.sh` file, `sh` is not in the shell
// allowlist, and in tool and source modes the shell would read the host's /tmp.
//
// The same lines as scripts/session-start.sh (the shell twin, for a terminal), read through the
// file tools only, under /workspace/.orkeon/dev/<code>/ (Code's own state, never committed):
//   - each state-F<n>.md whose header says it was written in the last 7 days, with that date and
//     its First open line (the file a compaction wrote for the batch in progress);
//   - each batches-state.md whose event log leaves batches open (last event of the batch
//     launched, relaunched or stall, with no `closed` line after it).
// Read-only, silent when there is nothing to say; a failure prints nothing.
//
// Self-contained (no import): the script host runs this one file.

declare const tools: any;

const DEV = "/workspace/.orkeon/dev";
const WEEK_MS = 7 * 86_400_000;

const shown = (path: string): string => path.replace(/^\/workspace\//, "");
const absolute = (path: string): string => (path.startsWith("/") ? path : `${DEV}/${path}`);

async function found(pattern: string): Promise<string[]> {
  try {
    const result = await tools.glob({ path: DEV, pattern });
    return [...(result?.paths ?? [])].map(String).map(absolute).sort();
  } catch {
    return []; // no .orkeon/dev/ in this project
  }
}

async function text(path: string): Promise<string> {
  try {
    const result = await tools.fileRead({ path });
    return String(result?.content ?? "");
  } catch {
    return "";
  }
}

function stateLine(path: string, content: string, now: number): string | null {
  const lines = content.split(/\r?\n/);
  const at = /^# State of batch .* written at (\S+) before /.exec(lines[0] ?? "")?.[1];
  const time = at === undefined ? NaN : Date.parse(at);
  if (!Number.isNaN(time) && now - time > WEEK_MS) return null;
  const open = lines.find((l) => l.startsWith("First open: "))?.slice("First open: ".length) || "no open step";
  return `- state of a batch: ${shown(path)} (written ${at ?? "at an unknown time"}); first open step: ${open}. ` +
    "Read it before going on with that batch.";
}

const CLOSED = /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} closed[ \t]*$/;
const EVENT = /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} (F\d+) (launched|relaunched|returned|merged|stopped|stall)(?:[ \t].*)?$/;

function openBatches(content: string): string[] {
  let closed = 0;
  const last = new Map<string, { at: number; event: string }>();
  content.split("\n").forEach((raw, index) => {
    const line = raw.replace(/\r$/, "");
    if (CLOSED.test(line)) { closed = index + 1; return; }
    const m = EVENT.exec(line);
    if (m) last.set(m[1], { at: index + 1, event: m[2] });
  });
  return [...last].filter(([, e]) => ["launched", "relaunched", "stall"].includes(e.event) && e.at > closed).map(([b]) => b);
}

async function sessionStart(now: number): Promise<string> {
  const body: string[] = [];
  for (const path of await found("*/state-F*.md")) {
    const line = stateLine(path, await text(path), now);
    if (line !== null) body.push(line);
  }
  for (const path of await found("*/batches-state.md")) {
    const open = openBatches(await text(path));
    if (open.length > 0) body.push(`- open batch(es) in ${shown(path)}: ${open.join(" ")}`);
  }
  if (body.length === 0) return "";
  return ["Dev work in progress in this project (Orkeon Code's state under .orkeon/dev/):", ...body].join("\n");
}

const printed = await sessionStart(Date.now());
if (printed !== "") console.log(printed);
