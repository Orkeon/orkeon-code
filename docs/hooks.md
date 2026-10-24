# Hooks

A hook is a command of yours that runs around the tool calls the model makes. `/hooks` keeps them in the session:

```text
/hooks add pre-tool node .orkeon/hooks/pre.mjs {tool} {path}
/hooks add post-tool node .orkeon/hooks/post.mjs {tool} {path}
/hooks list
/hooks remove 2
```

They last until `/clear` or the end of the REPL, like the [permission rules](permissions.md#rules).

## Where they run

The dev steps `/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement`, `/dev-verify` and `/dev-batches` hand the
registry to their crew, and so does `/tasks repair` to the agent it starts again. For each tool call the model makes in that crew, once the [host gate](permissions.md) has allowed it:

1. the crew's callback checks the call again against the step's rule sets (and, for a role of a batch, against its
   roots); a call they refuse runs no hook;
2. every `pre-tool` hook runs, in the order of `/hooks list`; the first that exits with a code other than 0, runs
   longer than 60 seconds or cannot run refuses the call: the model reads the hook's number, its command, its exit
   code and the first line it printed (its error output first), and the call does not run;
3. the call runs;
4. every `post-tool` hook runs, in order. One that fails adds a line to the result the model reads
   (`[post-tool hook #2 (node .orkeon/hooks/post.mjs file_write src/x.ts) exited 1: …]`); when they all exit 0, the
   result is left as it is. A result that is not text reaches the model then as compact JSON, on one line.

The time a hook runs counts in the step's time budget, at each call: keep hooks short.

A call the gate refuses, a session deny rule among them, never reaches the hooks. The assistant (`/assistant`) does
not run them yet, and nothing runs a `stop` hook: `/hooks` stores them for later. Under `orkeon run`, a crew gets
the same hooks from its `hooks` input (`--inputs '{"hooks":[{"event":"pre-tool","command":"…"}]}'`).

## What a hook command is

Orkeon Code runs a hook with the shell tool, from its own code, in `/workspace`: the gate does not check it, and the
command is one program and its arguments, as the tool reads it. `;`, `&&`, `||`, `|`, `&`, `<`, `>`, `>>`, `$(` and
backticks are refused, by the tool and by `/hooks add`, and no variable is expanded. Put the steps in a script and
name the script:

```js
// .orkeon/hooks/pre.mjs <tool> <path>: log every call, refuse writes under generated/ (relative or absolute).
import { appendFileSync } from "node:fs";
const [tool, path] = process.argv.slice(2);
appendFileSync(".orkeon/hooks/calls.log", `${new Date().toISOString()} ${tool} ${path}\n`);
if (path.startsWith("generated/") || path.startsWith("/workspace/generated/")) {
  console.error("generated/ is rebuilt, not edited");
  process.exit(2);
}
```

Three words are replaced in the command before it runs:

| Word | Replaced by |
|---|---|
| `{tool}` | the name of the tool the model called, `file_write` |
| `{event}` | `pre-tool` or `post-tool` |
| `{path}` | the call's `path` argument, as the model wrote it, when it holds only letters, digits and `._/@+=,:-` and does not start with `-`; `-` otherwise or without one |

The program must be one the shell tool runs: `node`, `npm`, `dotnet` and `find` under `Orkeon:Tools:Shell:AllowInterpreters`,
which the example settings turn on, and any other under `Orkeon:Tools:Shell:ExtraAllowedCommands` (`"bash"` for a
shell script; [Configuration](configuration.md)). A hook that cannot run refuses every call of the step: run it once
by hand first (`node .orkeon/hooks/pre.mjs file_read README.md`).

## What a hook does not do

It cannot allow a call the gate or the rule sets refuse, nor change the call's input. It cannot ask you: an approval
asked in the middle of a crew's turn may not be answered, so a hook decides on its own. It does not see the calls a
command or a crew makes from its own code (the git commands of `/dev-verify`, its build and tests), nor the inner
calls of a tool Orkeon Code defines, which check their own paths.
