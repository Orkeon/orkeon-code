# Permissions reference

[Permissions](permissions.md) says what the modes and the rules let the agent touch. This page is the mechanism
behind it: the order in which a call is checked, what a rule can read of a call, and every rule of the sets the dev
steps put in force. Read it to explain a refusal, or before changing a rule set.

## The order of the checks

### A tool the act does not offer

A call to a tool the act does not offer never reaches the gate. The runtime answers it
`ERROR: tool '<name>' is not available to this agent.` at once, with no question, and the dev agents are told to go
back to their own tools on that error.

### The crew's callback, before the gate

In the dev steps, the crew's `onToolCall` checks a call before the gate judges it
([ADR 0023](adr/0023-orkeon-after-306.md)). In order:

1. the step's [rule sets](#the-rule-sets-rule-by-rule), and a role's roots for the roles of a batch;
2. `glob`, `grep` and `count_pattern` by their whole input;
3. the `pre-tool` [hooks](hooks.md).

After the call, it runs the `post-tool` hooks.

The callback can refuse a call, never allow one the gate refuses: the gate judges the input the callback returns. A
call the gate refuses, by a session rule or by the mode, does not run, though its `pre-tool` hooks ran, and comes back
as a `DENIED:` result.

### Without a gate

When the host has no gate, the callback also applies the act's mode by itself:

| Mode of the act | What the callback lets through |
|---|---|
| `plan`, `dontAsk`, `default` | reads only |
| `acceptEdits` | reads and the file editors |

## What a rule reads

The arguments of every built-in tool are its input's top-level fields (`TOOL_ARGUMENTS` in
`shared/domain/agent-policy/permission.ts`). A rule reads a top-level argument only, as text. Two consequences:

- it cannot reach a path inside the `edit_batch` operations or the `structural_rewrite` paths;
- on `glob` and `grep` it matches `path` alone, so a `pattern` (or `grep`'s `glob`) given from a parent folder can
  still reach below a folder a rule denies.

The dev crews' callback closes that gap for the rules it holds:

| Call | What the callback matches |
|---|---|
| `glob` | `<path>/<pattern>` |
| `grep` | `<path>/<glob>`, or `<path>/**` |
| `count_pattern` | `<path>/**` |
| each `edit_batch` operation | the editor it stands for (`node_replace`, `node_insert`, or `node_ensure` for the intent kinds), with its own `path` and `text` |

## The rule sets, rule by rule

Every dev step puts the same sets in the gate ([Permissions](permissions.md#rule-sets-of-the-dev-steps)). The gate
holds them as deny rules; the crew's callback checks them again, and more.

### `git-readonly`

Most verbs get three rules, here for `push`:

```text
deny shell_command command=*git push*
deny shell_command command=*git * push
deny shell_command command=*git * push *
```

Directly after `git`, the verb is a prefix, so `git push;` and a `git commit` followed by a line break are refused
too. Behind an option the verb must be a word of its own, so `git diff -- src/address.ts` still runs.

| Verbs | Rules |
|---|---|
| `add`, `am`, `apply`, `checkout`, `cherry-pick`, `clean`, `commit`, `fetch`, `filter-branch`, `gc`, `merge`, `mv`, `pull`, `push`, `rebase`, `reset`, `restore`, `revert`, `rm`, `switch`, `update-ref`, `worktree` | the three forms |
| `branch`, `notes`, `reflog`, `submodule`, `tag` | the two forms without arguments are left out: typed alone they list, and run |
| `remote`, `stash` | their changing subcommands only |
| `init`, `clone`, `config`, `update-index`, `symbolic-ref`, `prune`, `repack`, `read-tree`, `checkout-index`, `commit-tree`, `write-tree`, `mktag`, `mktree`, `fast-import`, `maintenance`, `update-server-info`, `replace` | the verbs that write below the everyday ones |

What that gives, case by case:

| Command | Outcome |
|---|---|
| `git branch` | runs |
| `git branch -a` | refused, since no rule can make an exception to a deny |
| `git remote -v`, `git stash list` | run |
| `git remote add`, `git stash pop`, `git stash` alone or with options | refused |
| `git replace` alone | lists, and runs |
| `git status`, `git log`, `git diff`, `git show` | run: reading the history stays open |

The rules match the word `git` anywhere on the line. A path (`/usr/bin/git push`), an `env`, a variable
(`GIT_DIR=.git git push`) or a chain (`cd x && git push`) before it does not help.

### `git config`

`git config` is refused when it writes:

- a key then a value: `git config user.name x`, `git config --global a.b x`, `git config --file a.cfg a.b x`;
- the options `--add`, `--unset`, `--replace-all`, `--rename-section`, `--remove-section`, `--edit` or `-e`;
- the subcommands `set`, `unset`, `rename-section`, `remove-section` and `edit`;
- the global option `git -c key=value`, which sets a config for one command and can run a program through
  `core.pager`.

Its reads run: `git config user.name`, `git config --get user.name`, `git config --get-regexp`, `git config --list` or
`-l`, on any file (`git config --file a.cfg --list`, `git config -f .gitmodules --get submodule.x.path`).

A glob cannot tell a key then a value from a read whose file name holds a dot, so the crews' code reads that one. The
words after `git config` and its options are a write when there are two or more with no reading action before them,
or a changing option behind another one (`git config --global --unset a.b`). That holds in a subshell, a group, a
substitution or an `eval` too. The callback refuses it as `deny shell_command command=*git config <key> <value>*` of
`git-readonly`, and so do the step's own tools that run a command.

### `inline-interpreters`

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
deny shell_command command=*python3.* -c*
deny shell_command command=*python -* -c*
deny shell_command command=*python3 -* -c*
deny shell_command command=*python3.* -* -c*
deny shell_command command=*perl -e*
deny shell_command command=*perl -E*
deny shell_command command=*perl -* -e*
deny shell_command command=*perl -* -E*
deny shell_command command=*ruby -e*
deny shell_command command=*ruby -* -e*
deny shell_command command=*php -r*
deny shell_command command=*tsx -e*
deny shell_command command=*tsx --eval*
deny shell_command command=*ts-node -e*
deny shell_command command=*deno eval*
deny shell_command command=*bun -e*
```

The rules refuse:

- `-c` handed to any shell whose name ends with `sh` (`bash`, `sh`, `zsh`, `dash`, `ksh`, `fish`), also in a flag
  cluster (`bash -xc`) or after another flag (`bash -e -c`);
- the inline forms of `node`, `python`, `python3` and a versioned `python3.12`, `perl`, `ruby`, `php`, `tsx`,
  `ts-node`, `deno` and `bun`, behind a path, an `env` or `npx`;
- the same forms after another option: `python3 -I -c`, `perl -w -e`, `ruby -w -e`.

| Command | Outcome |
|---|---|
| `python3 x.py -c` | runs: the `-c` comes after a script |
| `python3 -m pytest -c pytest.ini` | refused: the `-c` comes after another option |
| a versioned `python3.12 x.py -c` | refused |
| `ssh -c <cipher>` | refused: a rule reads `sh -c` at the end of any word |

### `read-noise`

The patterns, here on `file_read`; the set repeats them on `path` of every tool of its row in the
[table of the sets](permissions.md#rule-sets-of-the-dev-steps):

```text
deny file_read path=*/bin/*
deny file_read path=bin/*
deny file_read path=*/obj/*
deny file_read path=obj/*
deny file_read path=*/.git/*
deny file_read path=.git/*
deny file_read path=*/node_modules/*
deny file_read path=node_modules/*
```

### `secrets`

The patterns, here on `file_write` `content`; the set repeats them on every written argument of its row:

```text
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
```

### `state-files`

The patterns, here on `file_write` `path`; the set repeats them on `path` of every tool of its row, then adds
`deny structural_rewrite`:

```text
deny file_write path=*-BATCHES-STATE.md
deny file_write path=*-STATE-F*.md
deny file_write path=*-VERIFY-F*.md
deny file_write path=*/capture-F*/*
deny file_write path=*.orkeon/dev*
deny file_write path=*.orkeon/memory*
deny file_write path=*.orkeon/agent*
deny file_write path=*.orkeon/sessions*
deny file_write path=*.orkeon/hooks*
deny file_write path=*.orkeon/shared*
deny file_write path=*.orkeon/repo*
deny file_write path=*.orkeon/config*
deny file_write path=*.orkeon/state*
deny file_write path=*.orkeon/orkeon*
deny file_write path=*.orkeon/ORKEON_*
deny file_write path=*.orkeon/forge*
deny file_write path=*.orkeon/rag*
deny file_write path=*/.claude/*
deny file_write path=.claude/*
```

`.orkeon/` is covered entry by entry, all but `worktrees/`, where a parallel `/dev-batches` runs its batches.

### `edit_batch` and `structural_rewrite`

The gate cannot read the paths or the text inside `edit_batch` and `structural_rewrite`.

- `structural_rewrite` is refused whole.
- `edit_batch` is left to the crews' callback, which runs on every act of a step. It reads each operation as the
  editor it stands for and applies the sets and the role's rules to it.

The callback also refuses a batch with no operations, an operation without a `path` or of an unknown kind, and any
`validate` but `"parse"`: `"build"` runs `dotnet build`, and the step's build is `run_build`.

## What the callback reads beyond the gate

A rule of the gate matches words separated by one space. A tab between two words, or an option order the rule does
not list, passes there. The dev crews' callback and the steps' guards close part of that: they also match the
command as the host reads it.

| What the callback does | Example refused like its plain form |
|---|---|
| drops the quotes | `git "push"` |
| joins runs of blanks and tabs | `bash  -c` |
| resolves backslash escapes | `git pu\sh` |
| splits option clusters | `python3 -Ic"print(1)"`, read as `python3 -I -c print(1)` |
| reads a relative path that climbs out and back as the project path | `../workspace/tests/x` |

What stays out of reach of any rule is listed under
[What a rule cannot see](permissions.md#what-a-rule-cannot-see).

## See also

- [Permissions](permissions.md): the modes, the rules, the guards.
- [Hooks](hooks.md): the `pre-tool` and `post-tool` commands the callback runs.
- [Architecture](architecture.md#ports-and-adapters): where the callback and the rule sets live in the code.
