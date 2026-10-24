# Permissions

Every `/assistant` turn runs under a **permission mode**, and the session can add **rules**. They act at two levels,
and a dev step adds a third:

1. **The tool catalogue.** The crew offers the model the tools of the mode (table below), with the
   [extra tools](#extra-tools) of the classes it grants, less the tools a deny rule covers whole. A tool that is not
   offered cannot be called at all.
2. **The host gate.** The Orkeon runtime checks every tool call **the model makes** in a turn (the calls of the
   agent's `act` loop): the session's rules first, then the mode, using the access each tool declares (read, edit,
   execute). When the mode says to ask, it asks you. The gate is `Orkeon:Security:PermissionGate:Enabled`: the
   launcher turns it on unless your settings file turns it off, and without it neither the modes nor the rules are
   enforced. Keep it on.
3. **The crew's callback**, in the dev steps only (`/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement` and `/dev-verify`). Once the gate has allowed a call, the crew's
   `onToolCall` checks it again: the step's [rule sets](#rule-sets-of-the-dev-steps) (and a role's roots, for the roles
   of a batch), `glob`, `grep` and `count_pattern` by their whole input, then the `pre-tool` [hooks](hooks.md); after
   the call, the `post-tool` hooks. It can refuse a call, never allow one the gate refused. A call the gate refuses,
   by a session rule or by the mode, never reaches it. When the host has no gate, the callback also applies the
   act's mode by itself: reads only in `plan`, `dontAsk` and `default`, the file editors too in `acceptEdits`.

**What the gate does not see.** Commands and crews also call tools from their own code, through Orkeon's `tools`
namespace, which runs the tool directly: `/commit` stages the files it commits by name (`git add -- <files>`, then `git commit -F <message> -- <files>`, never
`-A`) and, with `--push`, pushes, all with `shell_command`; with `--pr` it reads origin (`git remote get-url origin`)
and calls `github` `create_pr` itself, which the gate does not see either: `/commit` decides as the gate would,
refusing in `plan`, in `dontAsk` without an allow rule, and whenever a deny rule covers the call, and opening it with
an allow rule (`allow github action=create_pr`), in `bypassPermissions`, or after you answered yes to its plan that
named the pull request (`--yes` asks nothing, so it needs the rule); `/branch` checks a branch
out, `/diff` and `/review`, `/security-review` run `git`, `/init` writes the instructions file,
`/init-verifiers` and `/export` write their files, the compaction writes the session buffer and typed memory. Those
calls are what the command you typed is for: no rule, mode or question applies to them. `/commit` checks the mode
itself and refuses in `plan` and `dontAsk`. Its git commands (`git -c core.quotePath=false status`, `git --literal-pathspecs add`
and `commit`, `git var`, `git rev-parse`, `git symbolic-ref`, `git push -u origin <branch>`, and for the close of a dev
step `git merge --ff-only` and `git -C <worktree> rebase`) run only under `Orkeon:Tools:Shell:AllowInterpreters`:
without it the shell tool lets git run `status`, `log`, `diff` and `show` alone, with no option before them. `/transcribe` calls the speech-to-text server's tools the same way, in
every mode and with no `tools.extra` entry; with `--then`, the main loop makes that call before the turn, as the
command's, and the model then works on the transcription under the turn's mode. `/voice` records the same way, and
`/voice send` hands the dictated text to a turn as typed text would (a leading `plan:`, in lower case, picks the
mode), and `--go` to a turn under the session's mode, chosen before the recording: no dictated prefix is read.
`/say` reads aloud the same way, and so does the reading of each answer under `voice.reply on`, made by the
main loop after the turn as the launching command's call. `/dev-verify` runs `git`, the pack's build and the test
commands it accepts from its own code, in every mode; its auditor only reads, in `plan`, with four read tools.
`/dev-learn` reads the verdict files and both learning states. It writes only `<work>/learn-<date>/`,
`.orkeon/dev-learn-state.json` and `.orkeon/memory/refused.md`, never a file under `.claude/` nor the file a proposal
names.
`/dev-plan` reads the spec or change brief, the pack and the code index. It writes only `<work>/<code>/<CODE>-PLAN.md`,
the batch sheets and `plan.json`, never a file under `.claude/`; its reviewer only reads, in `plan`, with six read
tools. `/dev-spec` and `/dev-change` read the request (an issue through `gh issue view`), the pack and the code index,
and write only `<work>/<code>/SPEC-<code>.md`, or `CHANGE-<code>.md` and `repro-<code>.txt`; `/dev-change` runs the
reproduction or measure command, a narrow test command of the pack, from its own code, once the step's rule sets
allow it. `/dev-implement` runs the pack's restore, build and suite from its own code; its two roles write in
`acceptEdits`, each inside its roots, and after a VALID verdict its close commits the files the roles changed, by
name, and pushes the branch, unless a session rule denies the push. It refuses to start in `plan` or `dontAsk`, and
puts the gate check and its rules back before each launch of its chain (the audit, then the close). All five first
put the [rule sets of the dev steps](#rule-sets-of-the-dev-steps) in the gate, and refuse to start while the gate is
off; their crew's callback checks the same sets again, the only check of them under `orkeon run`.

## Modes

| Mode | Offered to the model | Local reads | Network reads (`http_api`, web) | File edits (`file_write`, `edit_file`, `node_*`, `edit_batch`, `structural_rewrite`), `rag_ingest` | Shell |
|---|---|---|---|---|---|
| `plan` | local reads, `read` [extra tools](#extra-tools) | ✅ | ❌ | ❌ | ❌ |
| `dontAsk` | local reads, `read` [extra tools](#extra-tools) | ✅ | ❌ | ❌ | ❌ |
| `default` | every tool | ✅ | `http_api` asks you, web ✅ | asks you | asks you |
| `acceptEdits` | every tool | ✅ | `http_api` asks you, web ✅ | ✅ | asks you |
| `bypassPermissions` | every tool | ✅ | ✅ | ✅ | ✅ |

`plan` and `dontAsk` promise that the turn changes nothing observable: no write, and no outbound request, since a
request can carry the repository's content elsewhere. Their catalogue holds the local read tools only, and the gate
refuses anything else without asking.

**Questions.** In `default` and `acceptEdits`, a call the mode asks about waits for you in the REPL:
`approve <tool>? [y] once / [s] session / [n] no`. `y` runs the call, `s` also runs every later call of that tool
without asking until the REPL exits, `n` refuses it, and the model reads the refusal and adapts. A `/` line still
runs its command while a question waits.

Orkeon classifies a tool that declares no access as a write: `http_api` and every MCP tool are asked about in
`default` and `acceptEdits`, and refused in `plan` and `dontAsk`. `web_scrape`, `scrape_element` and `rag_search`
declare a read (Orkeon #126): they run without a question wherever the catalogue offers them. `rag_ingest` declares an
edit — it writes the knowledge index, not the workspace — so the catalogue offers it with the file edits: never in
`plan` or `dontAsk`, asked in `default`, accepted in `acceptEdits`.

`github` and `rag_eval` are offered with the file edits, but declare no access: the host asks about them in
`acceptEdits` too, and refuses them in `plan` and `dontAsk`. The host offers `spawn_agent` to every act, whatever the
catalogue: it is an edit, asked about in `default` and refused in `plan` and `dontAsk`. A rule may name it, and an
allow rule on it holds in `dontAsk` too (`/permissions` warns when you add one).

The [shared memory](shared-memory.md)'s two tools are Orkeon Code's own, offered to the REPL's turns by mode:
`memory_recall` declares a read and runs in every mode, `plan` and `dontAsk` included; `memory_push` declares an edit
— it writes a candidate file under `memory.dir`, never an admitted entry — so it is offered where the mode edits:
never in `plan` or `dontAsk` (the tool also refuses by itself there), asked in `default`, accepted in `acceptEdits`. A
rule may name them, whole or on an argument of their schema: `/permissions add deny memory_push`, `deny memory_push
topic=auth*`, `deny memory_recall query=*secret*`. A deny rule on the whole tool also takes it out of the catalogue.

## Choosing the mode

- **Per request**: prefix the text, `plan: explain the cache layer`, `acceptEdits: fix the failing test`.
- **For the session**: `/mode acceptEdits`; bare `/mode` cycles through `default`, `acceptEdits`, `plan` and
  `bypassPermissions` (never `dontAsk`: reach it with `/mode dontAsk`); `/plan` toggles plan mode.
- **Fallback**: with neither, the mode is `default`, or the one set by `/config set permissions.fallback <mode>` (`--session` keeps it
  for the session only). Every
  turn that uses the fallback says which mode applied and where it came from.

The command that starts the turn (`/assistant`, free text) resolves the mode before the crew loads, so the
catalogue, the permission note of the prompt and the gate apply the same mode: after `/mode plan`, a request without
a prefix is offered the `plan` catalogue. `/summary` does not resolve the session mode: it always runs the main crew
in `plan`.

`/permissions` shows the effective surface: the mode, the catalogue, the session's rules and the rules the gate holds.
The rules are enforced only while `Orkeon:Security:PermissionGate:Enabled` is on (the launcher sets it):
`/permissions` reads the host and says whether the gate is on, off (nothing above is enforced and nothing asks), or
unknown on a host that keeps no session rules.

## Rules

A rule names a tool, built in or [extra](#extra-tools), and optionally an argument pattern, matched whole against the
argument the model passes, `*` standing for any run of characters (case counts). A pattern may be quoted: one pair of
matching quotes around it is taken off (`command="npm test*"` is `command=npm test*`). The argument is named as
Orkeon binds it, in snake_case: for a built-in tool, `/permissions add` refuses an argument the tool does not take and
lists the ones it does (`shell_command`: `command`, `working_directory`, `timeout_seconds`; `file_write`: `path`,
`content`, `encoding`, `append`, `create_backup`; `http_api`: `url`, `method`, `headers`, `body`, `content_type`). The
arguments of an extra tool are its server's or plugin's: the rule is accepted with a warning, and matches only if the
tool takes an argument of exactly that name.

The arguments of every built-in tool are its input's top-level fields (`TOOL_ARGUMENTS` in
`shared/domain/agent-policy/permission.ts`). A rule reads a top-level argument only, as text: it cannot reach a path
inside the `edit_batch` operations or the `structural_rewrite` paths, and on `glob` and `grep` it matches `path`
alone, so a `pattern` (or `grep`'s `glob`) given from a parent folder can still reach below a folder a rule denies.
The dev crews' callback closes that gap for the rules it holds: it also matches `glob` with `<path>/<pattern>`,
`grep` with `<path>/<glob>` (or `<path>/**`) and `count_pattern` with `<path>/**`.

```text
/permissions add deny shell_command command=git push*
/permissions add allow shell_command command=npm test*
/permissions add deny http_api
/permissions remove allow shell_command command=npm test*
/permissions list
/permissions clear
```

The gate reads them before the mode, at every call:

- a **deny** rule refuses a matching call in every mode, `bypassPermissions` included;
- an **allow** rule runs a matching call without asking, in every mode but `plan`, whose gate reads none;
- a call no rule matches is decided by the mode.

Adding a rule replaces the rule of the opposite effect on the same calls; rules on other calls of the same tool stay.

What the catalogue still does with them: a deny rule that covers **every** call of a tool removes the tool from the
catalogue, so the model is not offered a tool whose every call would be refused. A deny rule with a pattern leaves
the tool offered, as its other calls run. An allow rule never adds a tool to the catalogue: it spares a question, it
does not hand over a tool the mode withholds, so `plan` and `dontAsk` stay read-only whatever the rules say.
`/permissions` reports an allow rule that has no effect in the session's mode (every allow rule in `plan`, an allow rule
on a tool the mode does not offer), a turn one that has none in the mode its request names, and every turn logs the
tools a rule removed.

Rules live in the session state until `/clear` or the end of the REPL; persisting them across sessions is on
the [Roadmap](roadmap.md). The gate keeps its own copy, which `/permissions` replaces after every change and every
`/assistant` replaces before the turn starts, so the gate always holds the session's rules. A `[s]` answer is not a
rule: `/permissions` neither lists nor clears it.

## Rule sets of the dev steps

`/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement` and `/dev-verify` (unless `--gate-only`) hand the gate
rule sets of their own just before their crew
starts, and the crew's callback checks them again at each call the gate allows. A call the gate refuses reads the
gate's own refusal; one only the callback refuses (a `glob` or `grep` reaching a refused path, a path written with
`./` or `..`, every call under `orkeon run`) names the rule, its set and what to do instead. A set is a list of deny rules built into Orkeon Code, the same in every repository; no setting turns one on or
off. Every step puts all five sets in force:

| Set | Rules on | Refuses |
|---|---|---|
| `git-readonly` | `shell_command`, `command` | a git command that changes the repository, its branches or its remotes, also behind a global option (`git -C <dir> push`) |
| `inline-interpreters` | `shell_command`, `command` | code handed inline to an interpreter, which could run what the other rules refuse |
| `read-noise` | `path` of `file_read`, `glob`, `grep`, `node_outline`, `node_read`, `count_pattern`, `documents_of` | a read under a `bin/`, `obj/`, `.git/` or `node_modules/` folder, anywhere in the project |
| `secrets` | the written text: `file_write` `content`, `edit_file` `new_string`, `text` of `node_replace`, `node_insert` and `node_ensure`, `structural_rewrite` `fix`; `edit_batch` whole | content that holds a private key block or a token with a known prefix |
| `state-files` | `path` of `file_write`, `edit_file`, `node_replace`, `node_insert`, `node_ensure`; `edit_batch` and `structural_rewrite` whole | a file only Orkeon Code's own code writes: the batch logs, states and verdicts, the audit captures, `.orkeon/` and `.claude/` |

`git-readonly` holds 190 rules, three for most of the verbs `add`, `am`, `apply`, `branch`, `checkout`, `cherry-pick`,
`clean`, `commit`, `fetch`, `filter-branch`, `gc`, `merge`, `mv`, `notes`, `pull`, `push`, `rebase`, `reflog`,
`remote`, `reset`, `restore`, `revert`, `rm`, `stash`, `submodule`, `switch`, `tag`, `update-ref` and `worktree`,
here for `push`:

```text
deny shell_command command=*git push*
deny shell_command command=*git * push
deny shell_command command=*git * push *
```

Directly after `git`, the verb is a prefix, so `git push;` and a `git commit` followed by a line break are refused too; behind an option the verb must be a word of its own, so `git diff -- src/address.ts` still runs. For `branch`, `notes`, `reflog`,
`remote`, `submodule` and `tag`, which only list when typed alone, the two forms without arguments are left out:
`git branch` runs, `git branch -a` is refused, since no rule can make an exception to a deny. `remote` and `stash`
are refused by their changing subcommands only (`git remote add`, `git stash pop`, and `git stash` alone or with
options), so `git remote -v` and `git stash list` run. Reading the history stays open: `git status`, `git log`,
`git diff`, `git show`.

The rules match the word `git` anywhere on the line, so a path (`/usr/bin/git push`), an `env`, a variable
(`GIT_DIR=.git git push`) or a chain (`cd x && git push`) before it does not help. The same rules refuse the verbs
that write below the everyday ones: `init`, `clone`, `config`, `update-index`, `symbolic-ref`, `prune`, `repack`, `read-tree`, `checkout-index`, `commit-tree`, `write-tree`, `mktag`, `mktree`, `fast-import`, `maintenance`, `update-server-info` and `replace` (`git replace` alone
lists, and runs). `git config` with two arguments or more (`git config key value`, `git config --global key`,
`git config --unset key`) or with `--edit` is refused, and so is the global option `git -c key=value`, which sets a
config for one command and can run a program through `core.pager`; read a key with one argument instead:
`git config user.name`, `git config --list`.

The other four sets, each pattern on the first tool of its set:

```text
deny shell_command command=*sh -c*
deny shell_command command=*sh -*c *
deny shell_command command=*sh -* -c*
deny shell_command command=*node -e*
deny shell_command command=*node --eval*
deny shell_command command=*node -p*
deny shell_command command=*node --print*
deny shell_command command=*node -* -e*
deny shell_command command=*node -* -p*
deny shell_command command=*node --input-type*
deny shell_command command=*python -c*
deny shell_command command=*python3 -c*
deny shell_command command=*python -* -c*
deny shell_command command=*python3 -* -c*
deny shell_command command=*perl -e*
deny shell_command command=*perl -E*
deny shell_command command=*ruby -e*
deny shell_command command=*php -r*
deny shell_command command=*tsx -e*
deny shell_command command=*tsx --eval*
deny shell_command command=*ts-node -e*
deny shell_command command=*deno eval*
deny shell_command command=*bun -e*
deny file_read path=*/bin/*
deny file_read path=bin/*
deny file_read path=*/obj/*
deny file_read path=obj/*
deny file_read path=*/.git/*
deny file_read path=.git/*
deny file_read path=*/node_modules/*
deny file_read path=node_modules/*
deny file_write content=*-----BEGIN *PRIVATE KEY-----*
deny file_write content=*ghp_*
deny file_write content=*gho_*
deny file_write content=*ghu_*
deny file_write content=*ghs_*
deny file_write content=*ghr_*
deny file_write content=*github_pat_*
deny file_write content=*xoxa-*
deny file_write content=*xoxb-*
deny file_write content=*xoxp-*
deny file_write content=*xoxo-*
deny file_write content=*xoxs-*
deny file_write content=*xoxr-*
deny file_write content=*AKIA*
deny file_write content=*AIza*
deny file_write content=*sk-ant-*
deny file_write path=*-BATCHES-STATE.md
deny file_write path=*-STATE-F*.md
deny file_write path=*-VERIFY-F*.md
deny file_write path=*/capture-F*/*
deny file_write path=*/.orkeon/*
deny file_write path=.orkeon/*
deny file_write path=*/.claude/*
deny file_write path=.claude/*
```

`inline-interpreters` holds 23 rules. They refuse `-c` handed to any shell whose name ends with `sh` (`bash`,
`sh`, `zsh`, `dash`, `ksh`, `fish`), also in a flag cluster (`bash -xc`) or after another flag (`bash -e -c`), and
the inline forms of `node`, `python`, `python3`, `perl`, `ruby`, `php`, `tsx`, `ts-node`, `deno` and `bun`, behind a
path, an `env` or `npx`. Since a rule reads `sh -c` at the end of any word, `ssh -c <cipher>` is refused too.

The three file sets repeat their patterns on every tool of their row, tool by tool: `read-noise` holds 56 rules (8
patterns on 7 tools, on `path`), `secrets` 97 (16 patterns on 6 tools, on the written text, then `deny edit_batch`),
`state-files` 42 (8 patterns on 5 tools, on `path`, then `deny edit_batch` and `deny structural_rewrite`). The gate
cannot read the paths or the text inside `edit_batch` and `structural_rewrite`, so these two are refused whole. A step
holds 407 rules: the `deny edit_batch` of `secrets` and of `state-files` is kept once.

**When they hold.** At launch the step clears the gate, hands it the session's rules, then its own sets. A session
allow rule on the same calls as one of the step's deny rules is left out for the run, with a warning. The sets are not
stored with the session's rules: `/permissions list` does not show them, and `/permissions` shows them on its
`in the host gate` line, grouped by set, for as long as they stay there. They stay until the next `/assistant` turn
or the next `/permissions add`, `remove` or `clear`, which hand the gate the session's rules alone. Like every rule,
they are session-wide: a turn started while a step runs replaces them for the rest of the step.

`/dev-implement` puts the same five sets in the gate, and two allow rules of its own: `run_tests` and `run_build`
(each checks its command against the pack and the deny rules itself), so the roles, which act in `acceptEdits`, are
not asked at each test run. The allow rules leave the gate with the step's sets.

**The gate must be on.** When the host says its gate is off, the steps refuse to start, because every rule above and
the `plan` mode of their auditor or reviewer would check nothing; `/dev-verify F<n> --gate-only` runs no model and
still runs. On a host that keeps no session rules, the step runs with a warning: the sets are not in force.

**What a rule cannot see.** A rule reads one argument as text. A script file run by an interpreter
(`bash scripts/build.sh`) is not inline code, and runs. A rule matches words separated by one space, so a tab between two words,
or an option order it does not list, passes. `secrets` knows fixed prefixes only: a JSON web token, a
password in a URL or an `api_key = …` line needs a check of the whole content, which waits for a file tool of Orkeon
Code's own. Content that mentions a prefix, such as a page or a test about tokens, is refused as well. `read-noise`
also refuses a source folder that happens to be named `bin/`.

## Extra tools

The tools an MCP server or a plugin brings to the REPL (Orkeon's `MCP:Servers` and `Plugins` settings, see
[Configuration](configuration.md#extra-tools-mcp-servers-and-plugins)) are offered to the model once the `tools.extra`
setting names them, each with an access class:

| Class | Written | Offered in |
|---|---|---|
| `read` | `transcribe_audio:read` | every mode, with the local reads |
| `write` | `search_issues`, `create_issue:write` | `default`, `acceptEdits`, `bypassPermissions` |

A name without a class is a write. Mark `read` only a tool that changes nothing and sends nothing off the machine:
that is what `plan` and `dontAsk` promise. A built-in tool keeps its own class and cannot be listed.

Before each turn, `/assistant` and `/summary` check the names against the names the host registers, as Orkeon
compares them (case aside, exactly: `get_file_contents` is not the `get-file-contents` an MCP server registers), and
hand the turn the registered spelling. A name the host does not register (a server that did not connect, a plugin
that did not load, a typo) is left out with a warning, since Orkeon refuses a turn whose agent names a tool it does
not know.

The class shapes the catalogue; the gate still decides each call from the access the tool declares to Orkeon. An MCP
tool declares none, so the gate treats it as a write whatever its class: it asks you in `default` and `acceptEdits`
and refuses it in `plan` and `dontAsk`. In `dontAsk`, an allow rule lets it run
(`/permissions add allow transcribe_audio`); `plan` ignores allow rules. A plugin tool that declares read access runs
in every mode. To transcribe without these questions, use `/transcribe`, whose call is the command's
([Configuration](configuration.md#speech-to-text)).

Rules name extra tools as they name built-in ones (`/permissions add deny create_issue`), whether the host registers
the tool or not. A stored rule on a tool `tools.extra` no longer lists is **dormant**: it stays stored as written
whatever other rule is added or removed, the gate does not get it, `/permissions` lists it as dormant and warns, and
it applies again once `tools.extra` lists the tool. `/permissions remove` deletes it, as `/permissions clear` deletes
every rule. A settings file that cannot be read is reported as such: the extra tools are then unknown and their rules
dormant, never erased.

Orkeon Code adds three tools of its own to the dev steps, never offered to the REPL's turns: `run_validation`
(`read`: one narrow test command of the repository pack, the auditor's, three per audit at most), `run_tests` and
`run_build` (`execute`: the pack's narrow test command or its build, for a writing role). The gate asks once per call
from the access each declares; the shell command the tool then runs is not asked again, so the tool checks it itself:
the pack's own command only, a placeholder filled with one plain relative value, never the integration tests without
a filter, never a restore (except one, when a build fails on a tree that was never restored), never a command the
step's rule sets deny to `shell_command`. A rule may also name them (`/permissions add deny run_build`); their
arguments are `command` (`run_validation`, `run_tests`) and `project` (`run_build`).

The command a tool runs obeys the step's rule sets, not the deny rules of your session: the crew's code cannot read
the session's rules, so `/permissions add deny shell_command ...` does not reach a validation, as it never reached the
validations `/dev-verify` runs from its own code. To stop one, deny the tool itself (`/permissions add deny
run_validation`), which the gate sees.

The agents of the dev steps but `/dev-learn` (whose agent has no tool), and the children of `/dev-plan` and `/dev-verify`, are also given
[`memory_recall`](shared-memory.md) (`read`), to look for precedents in the shared memory; none is given `memory_push`.

## What a project file may set

The project's `.orkeon/config.json` (what `/config set` writes) cannot widen what the user allows. The user's own
settings are the `orkeonCode` block of the user settings file (the one the launcher reads), which the launcher hands
to the session read-only, on `/user-config`:

```json
{
  "orkeonCode": { "permissions.fallback": "acceptEdits", "tools.extra": "search_issues:read, *" }
}
```

- `permissions.fallback` from the project applies only as `default`, `plan` or `acceptEdits`, and never wider than
  the mode the user settings set; `bypassPermissions` and `dontAsk` come from the user settings or `/mode`.
- `tools.extra` from the project offers only the tools the user settings list too (`*` lists them all); a tool
  stays read-only (`:read`) only when both lists say so.
- What the project file set and could not apply, `/permissions` names: `↳ ignored` under the mode, and a note for
  the tools not offered. `/config set` of such a value still writes it, then says it is ignored. `/config set
  --session` is the user's own, and is not narrowed.

## Trusted folders

The launcher asks before it starts in a folder for the first time, because the agent reads that folder's
`AGENTS.md`, `.orkeon/config.json` and `.orkeon/repo.yaml`, may run the commands `.orkeon/repo.yaml` names, and git
runs the folder's hooks through the shell. Nothing of the folder is read or mounted before the answer.

- `y` stores the folder in `~/.orkeon-code/trusted-folders.json` (`ORKEON_CODE_HOME` moves it); every folder below
  it then starts without asking. Trusting your home folder, or `/`, trusts everything below it: the question says so.
- `n`, or no answer, exits with code 0: nothing started.
- The folder is checked by its real path: a symbolic link leads to the folder it names, which is the one asked about,
  stored and mounted.
- Without a terminal (a pipe, a CI job, `scripts/run-crew.sh` in a script) an untrusted folder is refused with exit
  code 3. `--trust` starts it for that run only, and `ORKEON_CODE_TRUST=1` does the same when `CI=true`; neither
  stores anything. `--demo` trusts the fixture the launcher seeds.
- `orkeon-code trust list` shows the store, `orkeon-code trust add <folder>` and `orkeon-code trust remove <folder>`
  change it, `orkeon-code trust check <folder> [--trust]` answers 0 (it may start), 3 (refused, no terminal) or 4
  (declined).
- The launcher writes the store one folder per line and reads it back in that layout only: a file it cannot read is
  refused with its path, trusts nothing and is never rewritten. Move it away and trust your folders again.
- The check is the launcher's: `orkeon-repl` started by hand skips it.

## What no mode changes

- File tools reach only the mounts: the project on `/workspace`, `/output`, `/tmp`, and `/user-config` (read-only).
- The shell runs allow-listed commands only (`Orkeon:Tools:Shell` extends the list), with no shell operators. A
  command that can write (an interpreter, an added command) needs the write right on every path it names and on its
  working directory.
- In tool and source modes the shell runs on your machine as your user, or under `bwrap` when
  `Orkeon:Tools:Shell:Confinement:Mode` is `Bubblewrap` (Linux); in docker mode, in the container. See
  [SECURITY.md](../SECURITY.md).
