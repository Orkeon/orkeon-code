# Permissions

Chaque tour de `/assistant` s'exécute sous un **mode de permission**, et la session peut y ajouter des **règles**. Ils
agissent à deux niveaux, et une étape dev en ajoute un troisième :

1. **Le catalogue d'outils.** Le crew offre au modèle les outils du mode (tableau ci-dessous), plus les
   [outils supplémentaires](#outils-supplémentaires) des classes qu'il accorde, moins les outils qu'une règle deny
   couvre en entier. Un outil qui n'est pas offert ne peut pas être appelé du tout.
2. **La garde de l'hôte.** Le runtime Orkeon contrôle chaque appel d'outil **que le modèle fait** dans un tour (les
   appels de la boucle `act` de l'agent) : les règles de la session d'abord, puis le mode, d'après l'accès que chaque
   outil déclare (lecture, modification, exécution). Quand le mode dit de demander, il vous demande. La garde est
   `Orkeon:Security:PermissionGate:Enabled` : le lanceur l'active sauf si votre fichier de settings la désactive, et
   sans elle ni les modes ni les règles ne sont appliqués. Laissez-la active.
3. **Le callback du crew**, dans `/dev-plan` et `/dev-verify` seulement. Une fois l'appel permis par la garde, le
   `onToolCall` du crew le contrôle à nouveau : les [jeux de règles](#jeux-de-règles-des-étapes-dev) de l'étape (et les
   racines d'un rôle, pour les rôles d'un lot), `glob`, `grep` et `count_pattern` sur toute leur entrée, puis les
   [hooks](hooks.md) `pre-tool` ; après l'appel, les hooks `post-tool`. Il peut refuser un appel, jamais permettre un
   appel que la garde a refusé. Un appel que la garde refuse, par une règle de la session ou par le mode, ne
   l'atteint jamais. Quand l'hôte n'a pas de garde, le callback applique aussi lui-même le mode de l'act : lectures
   seules en `plan`, `dontAsk` et `default`, les éditeurs de fichiers en plus en `acceptEdits`.

**Ce que la garde ne voit pas.** Les commandes et les crews appellent aussi des outils depuis leur propre code, par
l'espace de noms `tools` d'Orkeon, qui exécute l'outil directement : `/commit` indexe par leur nom les fichiers qu'il commite (`git add -- <fichiers>`, puis
`git commit -F <message> -- <fichiers>`, jamais `-A`) et, avec `--push`, pousse, le tout avec `shell_command` ;
avec `--pr`, elle lit origin (`git remote get-url origin`) et appelle elle-même `github` `create_pr`, que la garde ne
voit pas non plus : `/commit` décide comme la garde le ferait, refuse en `plan`, en `dontAsk` sans règle allow, et dès
qu'une règle deny couvre l'appel, et l'ouvre avec une règle allow (`allow github action=create_pr`), en
`bypassPermissions`, ou après que vous avez répondu oui à son plan qui nommait la pull request (`--yes` ne demande
rien, il lui faut donc la règle) ;
`/branch` bascule de branche, `/diff` et `/review`, `/security-review` lancent `git`, `/init` écrit le fichier
d'instructions, `/init-verifiers` et `/export` écrivent leurs fichiers, la compaction écrit le tampon de session et la
mémoire typée. Ces appels sont ce pour quoi la commande que vous avez tapée existe : aucune règle, aucun mode, aucune
question ne s'y applique. `/commit` vérifie lui-même le mode et refuse en `plan` et en `dontAsk`. Ses commandes git
(`git -c core.quotePath=false status`, `git --literal-pathspecs add` et `commit`, `git var`, `git rev-parse`,
`git symbolic-ref`, `git push -u origin <branch>`, et pour la clôture d'une étape dev `git merge --ff-only` et
`git -C <worktree> rebase`) ne s'exécutent que sous `Orkeon:Tools:Shell:AllowInterpreters` : sans lui, l'outil shell ne
laisse git lancer que `status`, `log`, `diff` et `show`, sans option avant eux. `/transcribe`
appelle de la même façon les outils du serveur de transcription de la parole, dans tous les modes et sans entrée
`tools.extra` ; avec `--then`, la boucle principale fait cet appel avant le tour, comme celui de la commande, et le
modèle travaille ensuite sur la transcription sous le mode du tour. `/voice` enregistre de la même façon, et
`/voice send` remet le texte dicté à un tour comme le ferait un texte tapé (un `plan:` en tête, en minuscules, choisit
le mode), et `--go` à un tour sous le mode de la session, choisi avant l'enregistrement : aucun préfixe dicté n'est lu.
`/say` lit à voix haute de la même façon, et de même la lecture de chaque réponse sous `voice.reply on`, faite par la
boucle principale après le tour comme appel de la commande qui l'a lancée. `/dev-verify` lance `git`, le build du
pack et les commandes de test qu'il accepte depuis son propre code, dans tous les modes ; son auditeur ne fait que
lire, en `plan`, avec quatre outils de lecture.
`/dev-learn` lit les fichiers de verdict et les deux états d'apprentissage. Il n'écrit que `<work>/learn-<date>/`,
`.orkeon/dev-learn-state.json` et `.orkeon/memory/refused.md`, jamais un fichier sous `.claude/` ni le fichier qu'une
proposition nomme.
`/dev-plan` lit la spec ou la fiche de changement, le pack et l'index du code. Il n'écrit que
`<work>/<code>/<CODE>-PLAN.md`, les fiches de lot et `plan.json`, jamais un fichier sous `.claude/` ; son relecteur ne
fait que lire, en `plan`, avec six outils de lecture. Les deux placent d'abord dans la garde les
[jeux de règles des étapes dev](#jeux-de-règles-des-étapes-dev), et refusent de démarrer tant que la garde est inactive ;
le callback de leur crew contrôle à nouveau les mêmes jeux, seul contrôle de ceux-ci sous `orkeon run`.

## Modes

| Mode | Offert au modèle | Lectures locales | Lectures réseau (`http_api`, web) | Modifications de fichiers (`file_write`, `edit_file`, `node_*`, `edit_batch`, `structural_rewrite`), `rag_ingest` | Shell |
|---|---|---|---|---|---|
| `plan` | lectures locales, [outils supplémentaires](#outils-supplémentaires) `read` | ✅ | ❌ | ❌ | ❌ |
| `dontAsk` | lectures locales, [outils supplémentaires](#outils-supplémentaires) `read` | ✅ | ❌ | ❌ | ❌ |
| `default` | tous les outils | ✅ | `http_api` vous demande, web ✅ | vous demande | vous demande |
| `acceptEdits` | tous les outils | ✅ | `http_api` vous demande, web ✅ | ✅ | vous demande |
| `bypassPermissions` | tous les outils | ✅ | ✅ | ✅ | ✅ |

`plan` et `dontAsk` promettent que le tour ne change rien d'observable : aucune écriture, et aucune requête sortante,
puisqu'une requête peut emporter le contenu du dépôt ailleurs. Leur catalogue ne contient que les outils de lecture
locale, et la garde refuse tout le reste sans demander.

**Les questions.** En `default` et en `acceptEdits`, un appel sur lequel le mode pose la question vous attend dans le
REPL : `approve <tool>? [y] once / [s] session / [n] no`. `y` exécute l'appel, `s` exécute aussi tous les appels
suivants de cet outil sans demander jusqu'à la sortie du REPL, `n` le refuse, et le modèle lit le refus et s'adapte.
Une ligne `/` exécute toujours sa commande pendant qu'une question attend.

Orkeon classe comme écriture un outil qui ne déclare aucun accès : `http_api` et tous les outils MCP font l'objet d'une
question en `default` et en `acceptEdits`, et sont refusés en `plan` et en `dontAsk`. `web_scrape`, `scrape_element` et
`rag_search` déclarent une lecture (Orkeon #126) : ils s'exécutent sans question partout où le catalogue les offre.
`rag_ingest` déclare une modification — il écrit l'index de connaissances, pas le projet monté — si bien que le
catalogue l'offre avec les modifications de fichiers : jamais en `plan` ni en `dontAsk`, demandé en `default`, accepté
en `acceptEdits`.

`github` et `rag_eval` sont offerts avec les modifications de fichiers, mais ne déclarent aucun accès : l'hôte pose la
question aussi en `acceptEdits`, et les refuse en `plan` et en `dontAsk`. L'hôte offre `spawn_agent` à chaque act, quel
que soit le catalogue : c'est une modification, demandée en `default` et refusée en `plan` et en `dontAsk`. Une règle
peut le nommer, et une règle allow sur lui vaut aussi en `dontAsk` (`/permissions` avertit quand vous en ajoutez une).

## Choisir le mode

- **Par requête** : préfixez le texte, `plan: explique la couche de cache`, `acceptEdits: corrige le test qui échoue`.
- **Pour la session** : `/mode acceptEdits` ; `/mode` seul fait défiler `default`, `acceptEdits`, `plan` et
  `bypassPermissions` (jamais `dontAsk` : on l'atteint par `/mode dontAsk`) ; `/plan` bascule le mode plan.
- **À défaut** : sans l'un ni l'autre, le mode est `default`, ou celui fixé par
  `/config set permissions.fallback <mode>` (`--session` ne le garde que pour la session). Chaque tour qui utilise ce
  mode de repli dit quel mode s'est appliqué et d'où il venait.

La commande qui lance le tour (`/assistant`, texte libre) résout le mode avant le chargement du crew, si bien que le
catalogue, la note de permission du prompt et la garde appliquent le même mode : après `/mode plan`, une requête sans
préfixe se voit offrir le catalogue `plan`. `/summary` ne résout pas le mode de la session : il lance toujours le crew
principal en `plan`.

`/permissions` montre la surface effective : le mode, le catalogue, les règles de la session et les règles que la garde
détient. Les règles ne sont appliquées que tant que `Orkeon:Security:PermissionGate:Enabled` est actif (le lanceur
l'active) : `/permissions` interroge l'hôte et dit si la garde est active, inactive (rien de ce qui précède n'est
appliqué et rien ne demande), ou inconnue sur un hôte qui ne garde aucune règle de session.

## Règles

Une règle nomme un outil, intégré ou [supplémentaire](#outils-supplémentaires), et éventuellement un motif d'argument,
comparé en entier à l'argument que le modèle passe, `*` tenant lieu de toute suite de caractères (la casse compte). Un
motif peut être entre guillemets : une paire de guillemets assortis autour de lui est retirée (`command="npm test*"`
vaut `command=npm test*`). L'argument est nommé comme Orkeon le lie, en snake_case : pour un outil intégré,
`/permissions add` refuse un argument que l'outil ne prend pas et liste ceux qu'il prend (`shell_command` : `command`,
`working_directory`, `timeout_seconds` ; `file_write` : `path`, `content`, `encoding`, `append`, `create_backup` ;
`http_api` : `url`, `method`, `headers`, `body`, `content_type`). Les arguments d'un outil supplémentaire sont ceux de
son serveur ou de son plugin : la règle est acceptée avec un avertissement, et ne correspond que si l'outil prend un
argument de ce nom exact.

Les arguments de chaque outil intégré sont les champs de premier niveau de son entrée (`TOOL_ARGUMENTS` dans
`shared/domain/agent-policy/permission.ts`). Une règle ne lit qu'un argument de premier niveau, comme du texte : elle
n'atteint pas un chemin à l'intérieur des opérations d'`edit_batch` ni des chemins de `structural_rewrite`, et sur
`glob` et `grep` elle ne compare que `path`, si bien qu'un `pattern` (ou le `glob` de `grep`) donné depuis un dossier
parent peut encore atteindre le dessous d'un dossier qu'une règle refuse.
Le callback des crews dev comble cet écart pour les règles qu'il porte : il compare aussi `glob` avec
`<path>/<pattern>`, `grep` avec `<path>/<glob>` (ou `<path>/**`) et `count_pattern` avec `<path>/**`.

```text
/permissions add deny shell_command command=git push*
/permissions add allow shell_command command=npm test*
/permissions add deny http_api
/permissions remove allow shell_command command=npm test*
/permissions list
/permissions clear
```

La garde les lit avant le mode, à chaque appel :

- une règle **deny** refuse un appel qui correspond dans tous les modes, `bypassPermissions` compris ;
- une règle **allow** exécute un appel qui correspond sans demander, dans tous les modes sauf `plan`, dont la garde n'en
  lit aucune ;
- un appel qu'aucune règle ne couvre est décidé par le mode.

Ajouter une règle remplace la règle d'effet opposé sur les mêmes appels ; les règles sur d'autres appels du même outil
restent.

Ce que le catalogue en fait encore : une règle deny qui couvre **tous** les appels d'un outil retire l'outil du
catalogue, si bien que le modèle ne se voit pas offrir un outil dont chaque appel serait refusé. Une règle deny avec un
motif laisse l'outil offert, puisque ses autres appels s'exécutent. Une règle allow n'ajoute jamais un outil au
catalogue : elle épargne une question, elle ne donne pas un outil que le mode retient, si bien que `plan` et `dontAsk`
restent en lecture seule quoi que disent les règles. `/permissions` signale une règle allow sans effet dans le mode de
la session (toute règle allow en `plan`, une règle allow sur un outil que le mode n'offre pas), un tour celle qui n'en
a aucun dans le mode que sa requête nomme, et chaque tour journalise les outils qu'une règle a retirés.

Les règles vivent dans l'état de la session jusqu'à `/clear` ou la fin du REPL ; les conserver d'une session à l'autre
est sur la [feuille de route](roadmap.md). La garde en conserve sa propre copie, que `/permissions` remplace après
chaque changement et que chaque `/assistant` remplace avant le début du tour, si bien que la garde détient toujours les
règles de la session. Une réponse `[s]` n'est pas une règle : `/permissions` ne la liste ni ne l'efface.

## Jeux de règles des étapes dev

`/dev-verify` (sauf avec `--gate-only`) et `/dev-plan` remettent à la garde des jeux de règles qui leur sont propres
juste avant le démarrage de leur crew, et le callback du crew les contrôle à nouveau à chaque appel que la garde
permet. Un appel que la garde refuse lit le refus de la garde ; celui que seul le callback refuse (un `glob` ou un
`grep` qui atteint un chemin refusé, un chemin écrit avec `./` ou `..`, chaque appel sous `orkeon run`) nomme la
règle, son jeu et ce qu'il faut faire à la place. Un jeu est une liste de règles deny intégrée à Orkeon Code, la même dans tous
les dépôts ; aucun réglage ne l'active ni ne le désactive. Les deux étapes mettent en vigueur les cinq jeux :

| Jeu | Règles sur | Refuse |
|---|---|---|
| `git-readonly` | `shell_command`, `command` | une commande git qui modifie le dépôt, ses branches ou ses remotes, y compris derrière une option globale (`git -C <dir> push`) |
| `inline-interpreters` | `shell_command`, `command` | du code passé en ligne à un interpréteur, qui pourrait exécuter ce que les autres règles refusent |
| `read-noise` | `path` de `file_read`, `glob`, `grep`, `node_outline`, `node_read`, `count_pattern`, `documents_of` | une lecture sous un dossier `bin/`, `obj/`, `.git/` ou `node_modules/`, n'importe où dans le projet |
| `secrets` | le texte écrit : `content` de `file_write`, `new_string` d'`edit_file`, `text` de `node_replace`, `node_insert` et `node_ensure`, `fix` de `structural_rewrite` ; `edit_batch` en entier | un contenu qui porte un bloc de clé privée ou un jeton à préfixe connu |
| `state-files` | `path` de `file_write`, `edit_file`, `node_replace`, `node_insert`, `node_ensure` ; `edit_batch` et `structural_rewrite` en entier | un fichier que seul le code d'Orkeon Code écrit : journaux, états et verdicts des lots, captures d'audit, `.orkeon/` et `.claude/` |

`git-readonly` contient 190 règles, trois pour la plupart des verbes `add`, `am`, `apply`, `branch`, `checkout`, `cherry-pick`,
`clean`, `commit`, `fetch`, `filter-branch`, `gc`, `merge`, `mv`, `notes`, `pull`, `push`, `rebase`, `reflog`,
`remote`, `reset`, `restore`, `revert`, `rm`, `stash`, `submodule`, `switch`, `tag`, `update-ref` et `worktree`,
ici pour `push` :

```text
deny shell_command command=*git push*
deny shell_command command=*git * push
deny shell_command command=*git * push *
```

Juste après `git`, le verbe est un préfixe, si bien que `git push;` et un `git commit` suivi d'un saut de ligne sont refusés aussi ; derrière une option, le verbe doit être un mot à part entière, si bien que `git diff -- src/address.ts` s'exécute toujours. Pour `branch`,
`notes`, `reflog`, `remote`, `submodule` et `tag`, qui ne font que lister quand on les tape seuls, les deux formes sans
argument sont omises : `git branch` s'exécute, `git branch -a` est refusé, puisqu'aucune règle ne peut faire d'exception
à un deny. `remote` et `stash` ne sont refusés que par leurs sous-commandes qui modifient (`git remote add`,
`git stash pop`, et `git stash` seul ou avec des options), si bien que `git remote -v` et `git stash list` s'exécutent.
La lecture de l'historique reste ouverte : `git status`, `git log`, `git diff`, `git show`.

Les règles reconnaissent le mot `git` n'importe où sur la ligne : un chemin (`/usr/bin/git push`), un `env`, une
variable (`GIT_DIR=.git git push`) ou un enchaînement (`cd x && git push`) placé devant n'y change rien. Les mêmes
règles refusent les verbes qui écrivent sous les verbes courants : `init`, `clone`, `config`, `update-index`, `symbolic-ref`, `prune`, `repack`, `read-tree`, `checkout-index`, `commit-tree`, `write-tree`, `mktag`, `mktree`, `fast-import`, `maintenance`, `update-server-info` et `replace`
(`git replace` seul liste, et s'exécute). `git config` avec deux arguments ou plus (`git config key value`,
`git config --global key`, `git config --unset key`) ou avec `--edit` est refusé, tout comme l'option globale
`git -c key=value`, qui fixe une configuration pour une seule commande et peut lancer un programme par `core.pager` ;
pour lire une clé, donnez un seul argument : `git config user.name`, `git config --list`.

Les quatre autres jeux, chaque motif sur le premier outil de son jeu :

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

`inline-interpreters` contient 23 règles. Elles refusent `-c` passé à tout shell dont le nom finit par `sh`
(`bash`, `sh`, `zsh`, `dash`, `ksh`, `fish`), y compris dans un groupe d'options (`bash -xc`) ou après une autre option
(`bash -e -c`), et les formes en ligne de `node`, `python`, `python3`, `perl`, `ruby`, `php`, `tsx`, `ts-node`, `deno`
et `bun`, derrière un chemin, un `env` ou `npx`. Comme une règle lit `sh -c` à la fin de n'importe quel mot,
`ssh -c <cipher>` est refusé lui aussi.

Les trois jeux de fichiers répètent leurs motifs sur chaque outil de leur ligne, outil par outil : `read-noise`
contient 56 règles (8 motifs sur 7 outils, sur `path`), `secrets` 97 (16 motifs sur 6 outils, sur le texte écrit, puis
`deny edit_batch`), `state-files` 42 (8 motifs sur 5 outils, sur `path`, puis `deny edit_batch` et
`deny structural_rewrite`). La garde ne peut pas lire les chemins ni le texte à l'intérieur d'`edit_batch` et de
`structural_rewrite`, si bien que ces deux-là sont refusés en entier. Une étape détient 407 règles : le
`deny edit_batch` de `secrets` et de `state-files` n'est gardé qu'une fois.

**Quand ils s'appliquent.** Au lancement, l'étape vide la garde, lui remet les règles de la session, puis ses propres
jeux. Une règle allow de la session sur les mêmes appels qu'une règle deny de l'étape est écartée pour l'exécution,
avec un avertissement. Les jeux ne sont pas rangés avec les règles de la session : `/permissions list` ne les montre
pas, et `/permissions` les montre sur sa ligne `in the host gate`, groupés par jeu, tant qu'ils y restent. Ils y restent
jusqu'au prochain tour `/assistant` ou au prochain `/permissions add`, `remove` ou `clear`, qui remettent à la garde les
seules règles de la session. Comme toute règle, ils valent pour toute la session : un tour lancé pendant qu'une étape
s'exécute les remplace pour le reste de l'étape.

**La garde doit être active.** Quand l'hôte dit que sa garde est inactive, les deux étapes refusent de démarrer, car
aucune règle ci-dessus ni le mode `plan` de leur auditeur ou de leur relecteur ne vérifierait quoi que ce soit ;
`/dev-verify F<n> --gate-only` n'appelle aucun modèle et s'exécute toujours. Sur un hôte qui ne garde aucune règle de
session, l'étape s'exécute avec un avertissement : les jeux ne sont pas en vigueur.

**Ce qu'une règle ne voit pas.** Une règle lit un argument comme du texte. Un fichier de script lancé par un
interpréteur (`bash scripts/build.sh`) n'est pas du code en ligne, et s'exécute. Une règle reconnaît des mots séparés par une espace, si
bien qu'une tabulation entre deux mots, ou un ordre d'options qu'elle ne liste pas, passe. `secrets` ne connaît que des préfixes
fixes : un jeton web JSON, un mot de passe dans une URL ou une ligne `api_key = …` demandent une vérification du
contenu entier, qui attend un outil de fichier propre à Orkeon Code. Un contenu qui mentionne un préfixe, comme une
page ou un test sur les jetons, est refusé lui aussi. `read-noise` refuse aussi un dossier source qui se trouverait
s'appeler `bin/`.

## Outils supplémentaires

Les outils qu'un serveur MCP ou un plugin apporte au REPL (les settings `MCP:Servers` et `Plugins` d'Orkeon, voir
[Configuration](configuration.md#outils-supplémentaires--serveurs-mcp-et-plugins)) sont offerts au modèle dès que le
réglage `tools.extra` les nomme, chacun avec une classe d'accès :

| Classe | Écrit | Offert en |
|---|---|---|
| `read` | `transcribe_audio:read` | tous les modes, avec les lectures locales |
| `write` | `search_issues`, `create_issue:write` | `default`, `acceptEdits`, `bypassPermissions` |

Un nom sans classe est une écriture. Ne marquez `read` qu'un outil qui ne change rien et n'envoie rien hors de la
machine : c'est ce que `plan` et `dontAsk` promettent. Un outil intégré garde sa propre classe et ne peut pas être
listé.

Avant chaque tour, `/assistant` et `/summary` confrontent les noms à ceux que l'hôte enregistre, comme Orkeon les
compare (casse mise à part, exactement : `get_file_contents` n'est pas le `get-file-contents` qu'un serveur MCP
enregistre), et remettent au tour l'orthographe enregistrée. Un nom que l'hôte n'enregistre pas (un serveur qui ne
s'est pas connecté, un plugin qui ne s'est pas chargé, une faute de frappe) est écarté avec un avertissement,
puisqu'Orkeon refuse un tour dont l'agent nomme un outil qu'il ne connaît pas.

La classe façonne le catalogue ; la garde décide toujours chaque appel d'après l'accès que l'outil déclare à Orkeon.
Un outil MCP n'en déclare aucun, si bien que la garde le traite comme une écriture quelle que soit sa classe : elle
vous demande en `default` et en `acceptEdits` et le refuse en `plan` et en `dontAsk`. En `dontAsk`, une règle allow le
laisse s'exécuter (`/permissions add allow transcribe_audio`) ; `plan` ignore les règles allow. Un outil de plugin qui
déclare un accès en lecture s'exécute dans tous les modes. Pour transcrire sans ces questions, utilisez `/transcribe`,
dont l'appel est celui de la commande ([Configuration](configuration.md#transcription-de-la-parole)).

Les règles nomment les outils supplémentaires comme les outils intégrés (`/permissions add deny create_issue`), que
l'hôte enregistre l'outil ou non. Une règle conservée sur un outil que `tools.extra` ne liste plus est **dormante** :
elle reste conservée telle qu'écrite quelles que soient les autres règles ajoutées ou retirées, la garde ne la reçoit
pas, `/permissions` la liste comme dormante et avertit, et elle s'applique de nouveau dès que `tools.extra` liste
l'outil. `/permissions remove` la supprime, comme `/permissions clear` supprime toutes les règles. Un fichier de
settings illisible est signalé comme tel : les outils supplémentaires sont alors inconnus et leurs règles dormantes,
jamais effacées.

Orkeon Code ajoute trois outils à lui aux étapes dev, jamais proposés aux tours du REPL : `run_validation`
(`read` : une commande de test étroite du pack du dépôt, celle de l'auditeur, trois par audit au plus), `run_tests` et
`run_build` (`execute` : la commande de test étroite du pack ou son build, pour un rôle qui écrit). La garde
demande une fois par appel, d'après l'accès que chacun déclare ; la commande shell que l'outil lance ensuite n'est pas
redemandée, donc l'outil la vérifie lui-même : la commande du pack seulement, chaque paramètre rempli d'une seule
valeur relative simple, jamais les tests d'intégration sans filtre, jamais de restore (sauf un, quand un build échoue
sur un arbre jamais restauré), jamais une commande que les jeux de règles de l'étape refusent à `shell_command`. Une
règle peut aussi les nommer (`/permissions add deny run_build`) ; leurs arguments sont `command` (`run_validation`,
`run_tests`) et `project` (`run_build`).

La commande qu'un outil lance obéit aux jeux de règles de l'étape, pas aux règles deny de votre session : le code du
crew ne peut pas lire les règles de la session, donc `/permissions add deny shell_command ...` n'atteint pas une
validation, pas plus qu'il n'atteignait les validations que `/dev-verify` lance depuis son propre code. Pour en
arrêter une, refusez l'outil lui-même (`/permissions add deny run_validation`), que la garde voit.

## Ce qu'un fichier du projet peut régler

Le `.orkeon/config.json` du projet (celui qu'écrit `/config set`) ne peut pas élargir ce que l'utilisateur permet.
Les réglages propres de l'utilisateur sont le bloc `orkeonCode` de son fichier de settings (celui que lit le
lanceur), que le lanceur remet à la session en lecture seule, sur `/user-config` :

```json
{
  "orkeonCode": { "permissions.fallback": "acceptEdits", "tools.extra": "search_issues:read, *" }
}
```

- `permissions.fallback` venu du projet ne s'applique que s'il vaut `default`, `plan` ou `acceptEdits`, et jamais
  plus large que le mode fixé par les réglages de l'utilisateur ; `bypassPermissions` et `dontAsk` viennent des
  réglages de l'utilisateur ou de `/mode`.
- `tools.extra` venu du projet n'offre que les outils que les réglages de l'utilisateur listent aussi (`*` les liste
  tous) ; un outil ne reste en lecture seule (`:read`) que si les deux listes le disent.
- Ce que le fichier du projet a réglé sans pouvoir l'appliquer, `/permissions` le nomme : `↳ ignored` sous le mode,
  et une note pour les outils non offerts. `/config set` d'une telle valeur l'écrit quand même, puis dit qu'elle est
  ignorée. `/config set --session` appartient à l'utilisateur et n'est pas restreint.

## Dossiers de confiance

Le lanceur demande avant de démarrer pour la première fois dans un dossier, parce que l'agent lit son `AGENTS.md`,
son `.orkeon/config.json` et son `.orkeon/repo.yaml`, peut lancer les commandes que `.orkeon/repo.yaml` nomme, et
que git exécute les hooks du dossier par le shell. Rien du dossier n'est lu ni monté avant la réponse.

- `y` enregistre le dossier dans `~/.orkeon-code/trusted-folders.json` (`ORKEON_CODE_HOME` le déplace) ; tout dossier
  en dessous démarre ensuite sans question. Faire confiance à votre dossier personnel, ou à `/`, fait confiance à tout
  ce qui est en dessous : la question le dit.
- `n`, ou pas de réponse, sort avec le code 0 : rien n'a démarré.
- Le dossier est vérifié par son chemin réel : un lien symbolique mène au dossier qu'il nomme, celui qui est
  demandé, enregistré et monté.
- Sans terminal (un tube, un job de CI, `scripts/run-crew.sh` dans un script), un dossier sans confiance est refusé
  avec le code 3. `--trust` le démarre pour cette fois seulement, et `ORKEON_CODE_TRUST=1` fait de même quand
  `CI=true` ; aucun des deux n'enregistre rien. `--demo` fait confiance à la fixture que le lanceur prépare.
- `orkeon-code trust list` montre le registre, `orkeon-code trust add <dossier>` et `orkeon-code trust remove
  <dossier>` le modifient, `orkeon-code trust check <dossier> [--trust]` répond 0 (il peut démarrer), 3 (refusé, pas
  de terminal) ou 4 (refusé à la question).
- Le lanceur écrit le registre un dossier par ligne et ne le relit que sous cette forme : un fichier qu'il ne sait pas
  lire est refusé avec son chemin, ne fait confiance à rien et n'est jamais réécrit. Déplacez-le et refaites confiance
  à vos dossiers.
- La vérification est celle du lanceur : `orkeon-repl` lancé à la main la saute.

## Ce qu'aucun mode ne change

- Les outils de fichiers n'atteignent que les montages : le projet sur `/workspace`, `/output`, `/tmp`, et
  `/user-config` (en lecture seule).
- Le shell n'exécute que les commandes sous liste blanche (`Orkeon:Tools:Shell` étend la liste), sans opérateur de
  shell. Une commande qui peut écrire (un interpréteur, une commande ajoutée) a besoin du droit d'écriture sur chaque
  chemin qu'elle nomme et sur son répertoire de travail.
- En modes tool et source, le shell tourne sur votre machine sous votre utilisateur, ou sous `bwrap` quand
  `Orkeon:Tools:Shell:Confinement:Mode` vaut `Bubblewrap` (Linux) ; en mode docker, dans le conteneur. Voir
  [SECURITY.md](../../SECURITY.md).
