# Référence des permissions

[Permissions](permissions.md) dit ce que les modes et les règles laissent l'agent toucher. Cette page en décrit le
mécanisme : l'ordre dans lequel un appel est contrôlé, ce qu'une règle peut lire d'un appel, et chaque règle des
jeux que les étapes dev mettent en vigueur. Lisez-la pour expliquer un refus, ou avant de modifier un jeu de règles.

## L'ordre des contrôles

### Un outil que l'act n'offre pas

Un appel à un outil que l'act n'offre pas n'atteint jamais la garde. Le runtime y répond aussitôt
`ERROR: tool '<name>' is not available to this agent.`, sans question, et les agents dev ont pour consigne de revenir
à leurs propres outils sur cette erreur.

### Le callback du crew, avant la garde

Dans les étapes dev, le `onToolCall` du crew contrôle un appel avant que la garde le juge
([ADR 0023](../adr/0023-orkeon-after-306.md)). Dans l'ordre :

1. les [jeux de règles](#les-jeux-de-règles-règle-par-règle) de l'étape, et les racines d'un rôle pour les rôles
   d'un lot ;
2. `glob`, `grep` et `count_pattern` sur leur entrée entière ;
3. les [hooks](hooks.md) `pre-tool`.

Après l'appel, il lance les hooks `post-tool`.

Le callback peut refuser un appel, jamais autoriser celui que la garde refuse : la garde juge l'entrée que le
callback renvoie. Un appel que la garde refuse, par une règle de session ou par le mode, ne s'exécute pas, bien que
ses hooks `pre-tool` aient tourné, et revient comme un résultat `DENIED:`.

### Sans garde

Quand le runtime n'a pas de garde, le callback applique aussi lui-même le mode de l'act :

| Mode de l'act | Ce que le callback laisse passer |
|---|---|
| `plan`, `dontAsk`, `default` | les lectures seulement |
| `acceptEdits` | les lectures et les éditeurs de fichiers |

## Ce que lit une règle

Les arguments de chaque outil intégré sont les champs de premier niveau de son entrée (`TOOL_ARGUMENTS` dans
`shared/domain/agent-policy/permission.ts`). Une règle ne lit qu'un argument de premier niveau, comme du texte. Deux
conséquences :

- elle ne peut pas atteindre un chemin à l'intérieur des opérations d'un `edit_batch` ni des chemins d'un
  `structural_rewrite` ;
- sur `glob` et `grep`, elle ne compare que `path` : un `pattern` (ou le `glob` de `grep`) donné depuis un dossier
  parent peut donc encore descendre sous un dossier qu'une règle refuse.

Le callback des crews dev comble cet écart pour les règles qu'il porte :

| Appel | Ce que compare le callback |
|---|---|
| `glob` | `<path>/<pattern>` |
| `grep` | `<path>/<glob>`, ou `<path>/**` |
| `count_pattern` | `<path>/**` |
| chaque opération d'un `edit_batch` | l'éditeur qu'elle représente (`node_replace`, `node_insert`, ou `node_ensure` pour les genres d'intention), avec son propre `path` et son propre `text` |

## Les jeux de règles, règle par règle

Chaque étape dev place les mêmes jeux dans la garde ([Permissions](permissions.md#jeux-de-règles-des-étapes-dev)).
La garde les détient comme des règles deny ; le callback du crew les contrôle à nouveau, et va plus loin.

### `git-readonly`

La plupart des verbes reçoivent trois règles, ici pour `push` :

```text
deny shell_command command=*git push*
deny shell_command command=*git * push
deny shell_command command=*git * push *
```

Juste après `git`, le verbe est un préfixe : `git push;` et un `git commit` suivi d'un saut de ligne sont donc
refusés aussi. Derrière une option, le verbe doit être un mot à lui seul, si bien que `git diff -- src/address.ts`
s'exécute toujours.

| Verbes | Règles |
|---|---|
| `add`, `am`, `apply`, `checkout`, `cherry-pick`, `clean`, `commit`, `fetch`, `filter-branch`, `gc`, `merge`, `mv`, `pull`, `push`, `rebase`, `reset`, `restore`, `revert`, `rm`, `switch`, `update-ref`, `worktree` | les trois formes |
| `branch`, `notes`, `reflog`, `submodule`, `tag` | les deux formes sans argument sont omises : tapés seuls, ils listent, et s'exécutent |
| `remote`, `stash` | leurs seules sous-commandes qui modifient |
| `init`, `clone`, `config`, `update-index`, `symbolic-ref`, `prune`, `repack`, `read-tree`, `checkout-index`, `commit-tree`, `write-tree`, `mktag`, `mktree`, `fast-import`, `maintenance`, `update-server-info`, `replace` | les verbes qui écrivent sous les verbes courants |

Ce que cela donne, cas par cas :

| Commande | Résultat |
|---|---|
| `git branch` | s'exécute |
| `git branch -a` | refusé, puisqu'aucune règle ne peut faire exception à un deny |
| `git remote -v`, `git stash list` | s'exécutent |
| `git remote add`, `git stash pop`, `git stash` seul ou avec des options | refusés |
| `git replace` seul | liste, et s'exécute |
| `git status`, `git log`, `git diff`, `git show` | s'exécutent : la lecture de l'historique reste ouverte |

Les règles reconnaissent le mot `git` n'importe où sur la ligne. Un chemin (`/usr/bin/git push`), un `env`, une
variable (`GIT_DIR=.git git push`) ou un enchaînement (`cd x && git push`) placé devant n'y change rien.

### `git config`

`git config` est refusé quand il écrit :

- une clé puis une valeur : `git config user.name x`, `git config --global a.b x`, `git config --file a.cfg a.b x` ;
- les options `--add`, `--unset`, `--replace-all`, `--rename-section`, `--remove-section`, `--edit` ou `-e` ;
- les sous-commandes `set`, `unset`, `rename-section`, `remove-section` et `edit` ;
- l'option globale `git -c key=value`, qui fixe une configuration pour une commande et peut lancer un programme par
  `core.pager`.

Ses lectures s'exécutent : `git config user.name`, `git config --get user.name`, `git config --get-regexp`,
`git config --list` ou `-l`, sur n'importe quel fichier (`git config --file a.cfg --list`,
`git config -f .gitmodules --get submodule.x.path`).

Un glob ne sait pas distinguer une clé suivie d'une valeur d'une lecture dont le nom de fichier contient un point :
c'est donc le code des crews qui lit ce cas. Les mots qui suivent `git config` et ses options forment une écriture
quand ils sont deux ou plus sans action de lecture devant eux, ou quand une option qui modifie en suit une autre
(`git config --global --unset a.b`). Cela vaut aussi dans un sous-shell, un groupe, une substitution ou un `eval`.
Le callback le refuse comme `deny shell_command command=*git config <key> <value>*` de `git-readonly`, et les outils
de l'étape qui lancent une commande font de même.

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

Les règles refusent :

- `-c` passé à tout shell dont le nom finit par `sh` (`bash`, `sh`, `zsh`, `dash`, `ksh`, `fish`), y compris dans un
  groupe d'options (`bash -xc`) ou après une autre option (`bash -e -c`) ;
- les formes en ligne de `node`, `python`, `python3` et d'un `python3.12` versionné, `perl`, `ruby`, `php`, `tsx`,
  `ts-node`, `deno` et `bun`, derrière un chemin, un `env` ou `npx` ;
- les mêmes formes après une autre option : `python3 -I -c`, `perl -w -e`, `ruby -w -e`.

| Commande | Résultat |
|---|---|
| `python3 x.py -c` | s'exécute : le `-c` vient après un script |
| `python3 -m pytest -c pytest.ini` | refusé : le `-c` vient après une autre option |
| un `python3.12 x.py -c` versionné | refusé |
| `ssh -c <cipher>` | refusé : une règle lit `sh -c` à la fin de n'importe quel mot |

### `read-noise`

Les motifs, ici sur `file_read` ; le jeu les répète sur le `path` de chaque outil de sa ligne dans le
[tableau des jeux](permissions.md#jeux-de-règles-des-étapes-dev) :

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

Les motifs, ici sur le `content` de `file_write` ; le jeu les répète sur chaque argument écrit de sa ligne :

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

Les motifs, ici sur le `path` de `file_write` ; le jeu les répète sur le `path` de chaque outil de sa ligne, puis
ajoute `deny structural_rewrite` :

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

`.orkeon/` est couvert entrée par entrée, tout sauf `worktrees/`, où un `/dev-batches` parallèle fait tourner ses
lots.

### `edit_batch` et `structural_rewrite`

La garde ne peut lire ni les chemins ni le texte à l'intérieur d'un `edit_batch` ou d'un `structural_rewrite`.

- `structural_rewrite` est refusé en entier.
- `edit_batch` est laissé au callback des crews, qui tourne sur chaque act d'une étape. Il lit chaque opération
  comme l'éditeur qu'elle représente et lui applique les jeux et les règles du rôle.

Le callback refuse aussi un lot d'opérations vide, une opération sans `path` ou d'un genre inconnu, et tout
`validate` autre que `"parse"` : `"build"` lance `dotnet build`, et le build de l'étape est `run_build`.

## Ce que le callback lit au-delà de la garde

Une règle de la garde compare des mots séparés par une seule espace. Une tabulation entre deux mots, ou un ordre
d'options que la règle ne liste pas, y passe. Le callback des crews dev et les protections des étapes en rattrapent
une partie : ils comparent aussi la commande telle que le runtime la lit.

| Ce que fait le callback | Exemple refusé comme sa forme simple |
|---|---|
| retire les guillemets | `git "push"` |
| réunit les suites de blancs et de tabulations | `bash  -c` |
| résout les échappements par barre oblique inverse | `git pu\sh` |
| sépare les groupes d'options | `python3 -Ic"print(1)"`, lu comme `python3 -I -c print(1)` |
| lit comme le chemin du projet un chemin relatif qui sort et revient | `../workspace/tests/x` |

Ce qui reste hors de portée de toute règle est listé sous
[Ce qu'une règle ne peut pas voir](permissions.md#ce-quune-règle-ne-peut-pas-voir).

## Voir aussi

- [Permissions](permissions.md) : les modes, les règles, les protections.
- [Hooks](hooks.md) : les commandes `pre-tool` et `post-tool` que lance le callback.
- [Architecture](architecture.md#ports-et-adaptateurs) : où vivent le callback et les jeux de règles dans le code.
