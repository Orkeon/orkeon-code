# Permissions

Every `/assistant` turn runs under a **permission mode**, and the session can add **rules**. They act at two levels:

1. **The tool catalogue.** The crew offers the model the tools of the mode (table below), with the
   [extra tools](#extra-tools) of the classes it grants, less the tools a deny rule covers whole. A tool that is not
   offered cannot be called at all.
2. **The host gate.** The Orkeon runtime checks every tool call **the model makes** in a turn (the calls of the
   agent's `act` loop): the session's rules first, then the mode, using the access each tool declares (read, edit,
   execute). When the mode says to ask, it asks you. The gate is `Orkeon:Security:PermissionGate:Enabled`: the
   launcher turns it on unless your settings file turns it off, and without it neither the modes nor the rules are
   enforced. Keep it on.

**What the gate does not see.** Commands and crews also call tools from their own code, through Orkeon's `tools`
namespace, which runs the tool directly: `/commit` stages and commits with `shell_command`, `/branch` checks a branch
out, `/diff` and `/review`, `/security-review` run `git`, `/init` writes the instructions file,
`/init-verifiers` and `/export` write their files, the compaction writes the session buffer and typed memory. Those
calls are what the command you typed is for: no rule, mode or question applies to them. `/commit` checks the mode
itself and refuses in `plan` and `dontAsk`. `/transcribe` calls the speech-to-text server's tools the same way, in
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
tools. Both first put the [rule sets of the dev steps](#rule-sets-of-the-dev-steps) in the gate, and refuse to start
while the gate is off.

## Modes

| Mode | Offered to the model | Local reads | Network reads (`http_api`, web) | File edits, `rag_ingest` | Shell |
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
unknown on a runtime that does not expose it (Orkeon 1.0.0-rc.6; Orkeon #128 added the field).

## Rules

A rule names a tool, built in or [extra](#extra-tools), and optionally an argument pattern, matched whole against the
argument the model passes, `*` standing for any run of characters (case counts). A pattern may be quoted: one pair of
matching quotes around it is taken off (`command="npm test*"` is `command=npm test*`). The argument is named as
Orkeon binds it, in snake_case: for a built-in tool, `/permissions add` refuses an argument the tool does not take and
lists the ones it does (`shell_command`: `command`, `working_directory`, `timeout_seconds`; `file_write`: `path`,
`content`, `encoding`, `append`, `create_backup`; `http_api`: `url`, `method`, `headers`, `body`, `content_type`). The
arguments of an extra tool are its server's or plugin's: the rule is accepted with a warning, and matches only if the
tool takes an argument of exactly that name.

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

`/dev-verify` (unless `--gate-only`) and `/dev-plan` hand the gate rule sets of their own just before their crew
starts. A set is a list of deny rules built into Orkeon Code, the same in every repository; no setting turns one on or
off. Both steps put all five sets in force:

| Set | Rules on | Refuses |
|---|---|---|
| `git-readonly` | `shell_command`, `command` | a git command that changes the repository, its branches or its remotes, also behind a global option (`git -C <dir> push`) |
| `inline-interpreters` | `shell_command`, `command` | code handed inline to an interpreter, which could run what the other rules refuse |
| `read-noise` | `file_read`, `path` | a read under a `bin/`, `obj/`, `.git/` or `node_modules/` folder, anywhere in the project |
| `secrets` | `file_write`, `content` | content that holds a private key block or a token with a known prefix |
| `state-files` | `file_write`, `path` | a file only Orkeon Code's own code writes: the batch logs, states and verdicts, the audit captures, `.orkeon/` and `.claude/` |

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

The other four sets:

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

**When they hold.** At launch the step clears the gate, hands it the session's rules, then its own sets. A session
allow rule on the same calls as one of the step's deny rules is left out for the run, with a warning. The sets are not
stored with the session's rules: `/permissions list` does not show them, and `/permissions` shows them on its
`in the host gate` line, grouped by set, for as long as they stay there. They stay until the next `/assistant` turn
or the next `/permissions add`, `remove` or `clear`, which hand the gate the session's rules alone. Like every rule,
they are session-wide: a turn started while a step runs replaces them for the rest of the step.

**The gate must be on.** When the host says its gate is off, both steps refuse to start, because every rule above and
the `plan` mode of their auditor or reviewer would check nothing; `/dev-verify F<n> --gate-only` runs no model and
still runs. On a runtime that cannot say (Orkeon 1.0.0-rc.6), the step runs with a warning, and with a second one on a
host that keeps no session rules, where the sets are not in force.

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

## What no mode changes

- File tools reach only the mounts: the project on `/workspace`, `/output`, `/tmp`.
- The shell runs allow-listed commands only (`Orkeon:Tools:Shell` extends the list), with no shell operators. A
  command that can write (an interpreter, an added command) needs the write right on every path it names and on its
  working directory.
- In tool and source modes the shell runs on your machine as your user, or under `bwrap` when
  `Orkeon:Tools:Shell:Confinement:Mode` is `Bubblewrap` (Linux); in docker mode, in the container. See
  [SECURITY.md](../SECURITY.md).
