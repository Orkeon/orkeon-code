# Permissions

Chaque tour de `/assistant` s'exécute sous un **mode de permission**, et la session peut y ajouter des **règles**. Ils
agissent à deux niveaux :

1. **Le catalogue d'outils.** Le crew offre au modèle les outils du mode (tableau ci-dessous), plus les
   [outils supplémentaires](#outils-supplémentaires) des classes qu'il accorde, moins les outils qu'une règle deny
   couvre en entier. Un outil qui n'est pas offert ne peut pas être appelé du tout.
2. **La garde de l'hôte.** Le runtime Orkeon contrôle chaque appel d'outil **que le modèle fait** dans un tour (les
   appels de la boucle `act` de l'agent) : les règles de la session d'abord, puis le mode, d'après l'accès que chaque
   outil déclare (lecture, modification, exécution). Quand le mode dit de demander, il vous demande. La garde est
   `Orkeon:Security:PermissionGate:Enabled` : le lanceur l'active sauf si votre fichier de settings la désactive, et
   sans elle ni les modes ni les règles ne sont appliqués. Laissez-la active.

**Ce que la garde ne voit pas.** Les commandes et les crews appellent aussi des outils depuis leur propre code, par
l'espace de noms `tools` d'Orkeon, qui exécute l'outil directement : `/commit` indexe et commite avec `shell_command`,
`/branch` bascule de branche, `/diff` et `/review`, `/security-review` lancent `git`, `/init` écrit le fichier
d'instructions, `/init-verifiers` et `/export` écrivent leurs fichiers, la compaction écrit le tampon de session et la
mémoire typée. Ces appels sont ce pour quoi la commande que vous avez tapée existe : aucune règle, aucun mode, aucune
question ne s'y applique. `/commit` vérifie lui-même le mode et refuse en `plan` et en `dontAsk`. `/transcribe`
appelle de la même façon les outils du serveur de transcription de la parole, dans tous les modes et sans entrée
`tools.extra` ; avec `--then`, la boucle principale fait cet appel avant le tour, comme celui de la commande, et le
modèle travaille ensuite sur la transcription sous le mode du tour. `/voice` enregistre de la même façon, et
`/voice send` remet le texte dicté à un tour comme le ferait un texte tapé (un `plan:` en tête, en minuscules, choisit
le mode), et `--go` à un tour sous le mode de la session, choisi avant l'enregistrement : aucun préfixe dicté n'est lu.
`/say` lit à voix haute de la même façon, et de même la lecture de chaque réponse sous `voice.reply on`, faite par la
boucle principale après le tour comme appel de la commande qui l'a lancée.

## Modes

| Mode | Offert au modèle | Lectures locales | Lectures réseau (`http_api`, web) | Modifications de fichiers, `rag_ingest` | Shell |
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
appliqué et rien ne demande), ou inconnue sur un runtime qui ne l'expose pas (Orkeon 1.0.0-rc.6 ; Orkeon #128 a
ajouté le champ).

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

## Ce qu'aucun mode ne change

- Les outils de fichiers n'atteignent que les montages : le projet sur `/workspace`, `/output`, `/tmp`.
- Le shell n'exécute que les commandes sous liste blanche (`Orkeon:Tools:Shell` étend la liste), sans opérateur de
  shell. Une commande qui peut écrire (un interpréteur, une commande ajoutée) a besoin du droit d'écriture sur chaque
  chemin qu'elle nomme et sur son répertoire de travail.
- En modes tool et source, le shell tourne sur votre machine sous votre utilisateur, ou sous `bwrap` quand
  `Orkeon:Tools:Shell:Confinement:Mode` vaut `Bubblewrap` (Linux) ; en mode docker, dans le conteneur. Voir
  [SECURITY.md](../../SECURITY.md).
