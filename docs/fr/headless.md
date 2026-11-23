# Exécutions autonomes et embarquées

Orkeon Code est un ensemble de crews TypeScript. Le REPL est une façon de les lancer, pas la seule : le crew qui répond
à `/assistant` tourne aussi sans personne au clavier, en un coup depuis un shell, de façon planifiée, dans un job de CI,
ou lancé par votre propre application. Cette page dit ce que chaque voie demande, ce qui la borne, et ce qu'elle ne
fait pas encore.

## Le laisser travailler seul

L'autonomie est un mode de permission, pas une option. Donnez au tour les droits que la tâche demande et la boucle va
jusqu'au bout sans poser de question :

| Mode | Ce que l'agent peut faire |
|---|---|
| `acceptEdits` | Lire, appeler le réseau, modifier des fichiers. Pas de shell |
| `bypassPermissions` | Tout le catalogue d'outils, shell compris |

- Choisissez-le par requête (`bypassPermissions: migre les tests vers node:test`), pour la session (`/mode
  bypassPermissions`), ou pour toutes les sessions (`"permissions.fallback": "bypassPermissions"` dans le bloc
  `orkeonCode` de vos réglages utilisateur : le `.orkeon/config.json` d'un projet ne pose que `default`, `plan` ou
  `acceptEdits`, [Permissions](permissions.md)).
- Dans le REPL, `default` et `acceptEdits` vous demandent avant un appel que le mode n'autorise pas d'emblée.
- Dans une exécution sans opérateur, personne ne répond, et la garde refuse ce qu'elle aurait demandé (le modèle lit
  `DENIED: …`), sauf si `Orkeon:Checkpointing:Enabled` est posé (éteint dans tous les exemples) : la
  question est alors gardée et l'exécution s'arrête avec la sortie `75` ([plus bas](#en-un-coup-depuis-un-shell)).
- Donnez à une exécution sans opérateur un mode qui ne demande jamais : `bypassPermissions`, ou `plan` et `dontAsk`
  pour un travail en lecture seule ([Permissions](permissions.md)).

Sous `orkeon run` (`orkeon-code run`), la garde n'a personne à qui demander, et décide chaque appel par le seul
mode :

| Mode | Sous `orkeon run` |
|---|---|
| `default` | Lectures seulement, une action de lecture de `github` et un GET simple d'`http_api` compris : tout autre appel est refusé (les modifications, `rag_eval`, `spawn_agent`, le shell, une écriture de `github` ou d'`http_api`) |
| `acceptEdits` | Lectures et modifications (`file_write`, `edit_file`, `node_*`, `edit_batch`, `structural_rewrite`, `rag_ingest`, `rag_eval`, `spawn_agent`), une action de lecture de `github` et un GET simple d'`http_api` ; le shell et les écritures de `github` et d'`http_api` sont refusés |
| `plan`, `dontAsk` | Lectures seulement |
| `bypassPermissions` | Tout |

La garde ne juge que les appels d'outils d'un act : les appels `tools.*` qu'un crew fait depuis son code ne passent pas par elle.

Un act sans `permissionMode` tourne en `default`. Un hook `onToolCall` tourne avant la garde, qui juge ensuite
l'entrée qu'il renvoie ; un `"ask"` qu'il renvoie est jugé comme une modification en `default` une fois l'appel admis par
le mode de l'act, donc refusé ici (les callbacks d'Orkeon Code ne demandent jamais).

Ce qui borne un tour, quel que soit le mode :

- le budget du crew `main-loop` : 200 appels d'outils, 30 minutes, 700k tokens de contexte (le contexte compté une
  fois), 8 explorateurs lancés ([L'explorateur](turn.md#lexplorateur)), 40 itérations de la boucle à l'effort par
  défaut (10 à 160 avec `/effort`) ;
- le délai d'exécution des scripts dans les settings : `Orkeon:Cli:ScriptCommands:Limits` pour le REPL,
  `Orkeon:Scripting:Limits` pour l'`orkeon run` d'une exécution indépendante (30 minutes chacun dans l'exemple) ;
- la garde du runtime (`Orkeon:Security:PermissionGate:Enabled`), qui confronte chaque appel au mode derrière le
  catalogue ;
- les montages : le projet sur `/workspace`, les montages de travail `/output` et `/tmp`, votre bloc `orkeonCode`
  sur `/user-config` (en lecture seule) ; dans le REPL aussi les dossiers de la session (`/sessions`,
  `/session-history` en lecture seule, `/memory`) et, avec la parole activée, `/audio` et `/transcripts` (en lecture
  seule) ; rien d'autre ;
- la liste blanche du shell dans les settings.

Préférez le mode docker pour un tour `bypassPermissions` sans opérateur : le shell tourne alors dans le conteneur, et
le projet est le seul dossier de votre machine qu'il peut écrire ([SECURITY.md](../../SECURITY.md)).

## En un coup depuis un shell

- `orkeon-code run <crew>` lance un crew hors du REPL, depuis un clone ou une installation : `<crew>` est un nom de
  `src/crews` (`main-loop`, `git-commit`, `code-review`…) ou le chemin d'un `crew.ork.ts`.
- Le projet, la question de confiance, le fichier de settings et les montages sont ceux du REPL : `--workspace`
  (sinon le dossier courant) ou `--demo`, `--trust` pour une exécution, `--settings` ou le fichier de settings que le
  REPL lirait, le projet sur `/workspace`, les `/output` et `/tmp` de l'état, et le bloc `orkeonCode` de vos réglages
  sur `/user-config`.
- Le runner est `orkeon run` (`Orkeon.Scripting.Cli`), cherché dans cet ordre : la ligne de commande que nomme
  `ORKEON_CLI`, `orkeon` sur le PATH, le `bin/orkeon` du runtime que le lanceur a téléchargé, l'outil `orkeon` du
  `.config/dotnet-tools.json` d'un clone (le SDK .NET 10 et nuget.org), puis l'image `orkeon`
  (`ghcr.io/orkeon/orkeon`), puis le mode source (`ORKEON_SOURCE`, [Développement](development.md)), puis le runtime
  que nomme le paquet, téléchargé comme pour le REPL ([Premiers pas](getting-started.md) ; aucun paquet publié à ce
  jour n'en nomme). `--mode docker|tool|source` en choisit un.
- En mode docker, le checkout est le `/work/agent` du conteneur, en lecture seule, et le projet son
  `/work/project` : un chemin sous l'un d'eux donné à une option de chemin d'`orkeon run` (un fichier `--llm-mock`,
  précédé de `--` ou non) y est nommé. Un tel fichier hors des deux arrête l'exécution, puisque le conteneur ne le voit pas : mettez-le sous le projet.
  Un crew hors du checkout est refusé.
- Ce qui suit `--` va tel quel à `orkeon run` (`-- --validate`, `-- --llm-mock answers.jsonl`, `-- -v 2`), sauf la
  valeur d'une option d'`orkeon run` qui prend un chemin (`--llm-mock`, `--llm-record`, `--llm-replay`,
  `--llm-log-path`, `--inputs-file`, écrite `--llm-mock FICHIER` ou `--llm-mock=FICHIER`) quand elle est relative et
  nomme un fichier ou un dossier de votre dossier courant : le runner démarre ailleurs (dans le projet, le clone ou
  le conteneur), alors le lanceur transmet ce chemin en absolu, résolu depuis le dossier d'où vous avez lancé
  `orkeon-code`. Une option que le lanceur ne connaît pas va de même à `orkeon run` quand aucun `--` ne la précède.
- `orkeon-code run --help` imprime l'usage de `run` sur stdout et sort avec `0`.
- `orkeon-code.ps1` n'a pas encore de `run` : prenez le lanceur bash (Git Bash ou WSL sous Windows).
- Le crew lit son entrée dans le JSON de `--inputs`.
- Pour `main-loop`, c'est ce que `/assistant` lui passe : la requête et le mode.
- `permissionRules` (les règles de la session, telles que `/permissions` les liste : `deny http_api`, `allow
  shell_command command=npm test*`) et `extraTools` (les outils des serveurs MCP et des plugins, tels que
  `tools.extra` les nomme) sont ce que la commande de lancement résout dans le REPL.
- Une exécution indépendante n'a pas de session où les prendre : ne les passez que si vous savez ce que le catalogue
  doit contenir.
- Aucune règle de session n'existe hors du REPL : `permissionRules` ne fait que façonner le catalogue (une règle
  deny sur un outil entier le retire), et une règle allow n'épargne aucune question.
- Aucune option d'`orkeon run` ne fixe le mode.
- Il appartient aux entrées du crew (`--inputs '{"prompt":"…","permissionMode":"acceptEdits"}'`) ; le lanceur
  allume la garde, comme pour le REPL (`Orkeon__Security__PermissionGate__Enabled`, sauf si votre environnement la
  fixe).
- `orkeon run` n'enregistre les outils d'analyse (`node_*`, `edit_batch`, `structural_rewrite`, `batch_anchors`,
  `structural_search`…) que tant que `RaggableTree:Enabled` n'est pas `false`.
- S'il vaut `false`, un act qui reçoit le catalogue de `main-loop` échoue avec `UnknownToolError`.

```bash
export DEEPSEEK_API_KEY=...                       # the variable named by Llm:ApiKeyEnvVar
orkeon-code run main-loop --workspace ~/src/app \
  --inputs '{"prompt": "add a --json flag to the report command, with a test",
             "permissionMode": "bypassPermissions"}' > result.json
```

- Le runner imprime le résultat du crew en JSON sur stdout, seul : le lanceur envoie ses lignes de journal sur
  stderr (`Logging__Console__LogToStandardErrorThreshold=Trace` ; un `orkeon run` nu les écrit sur stdout, avant le
  JSON).
- Avant que le runner ne démarre, le lanceur s'arrête seul :
  - `3` pour un projet non fiable sans terminal où demander ni `--trust`, ou quand le runtime que nomme le paquet doit
    être téléchargé sans terminal où demander d'abord (sauf avec `ORKEON_CODE_RUNTIME_DOWNLOAD=1`) ;
  - `0` sans rien lancer quand la question de confiance, ou celle d'avant ce téléchargement, reçoit un non ;
  - `1` sur toute erreur qui lui est propre : une erreur d'usage, un crew inconnu, pas de fichier de réglages, aucun
    runner trouvé, pas d'esbuild, un moteur Docker qui ne répond pas, un build des sources ou un `dotnet tool
    restore` qui échoue. Ce `1` ressemble à l'erreur de script du runner ci-dessous : son message sur stderr, qui
    commence par `orkeon-code:`, les distingue.
- Ensuite il sort avec le code du runner : `0` quand le script s'est terminé, `1` sur
  une erreur de script, `2` sur une erreur du runtime, `130` quand il est annulé, `75` quand
  `Orkeon:Checkpointing:Enabled` est posé et que l'exécution s'est arrêtée sur une question (`run.finished` dit
  `waiting_for_input` avec un `requestId` ; `orkeon run --resume <id d'exécution> --input '<réponse>'` la poursuit,
  et `/state` et `/runs` sont les montages propres du runtime, jamais les vôtres).
- Sans points de reprise, un `human_input` sans opérateur reçoit la valeur par défaut qu'aucune option ne porte, que
  les crews lisent comme personne n'a répondu.
- Un appel que la garde refuse n'est pas une erreur : le modèle lit le refus comme résultat de l'outil et
  l'exécution sort quand même avec `0`.
- Lisez le JSON pour savoir ce qui a été fait.
- Un chemin du projet qui sort de `/workspace` par un lien (un cache de dépendances lié à un autre checkout) est
  refusé par les outils de fichiers : montez ce dossier pour lui-même.
- Les primitives de session existent aussi dans une exécution indépendante, mais le tampon de conversation, le sac
  d'état et la mémoire typée démarrent vides et finissent avec le processus : une exécution est un tour.

Chaque crew se lance ainsi ; son `crew.ork.ts` dit dans son en-tête quels `inputs` il lit (`code-review` :
`{ files?, commit?, lenses?, passes? }` ; `advisor` : aucun). Le smoke du runtime
(`.github/workflows/runtime-smoke.yml`, sur une pull request qui touche l'épingle, le lanceur, un smoke ou les
sources, chaque semaine et à la demande) vérifie que chaque commande slash se charge (`scripts/smoke-runtime.sh`),
lance un tour de `git-commit` face à un modèle simulé (`scripts/smoke-crew.sh`) et passe chaque crew par
`orkeon run --validate` (`scripts/smoke-validate.sh`) ; un tour sans opérateur de `main-loop` face à un modèle
s'éprouve à la main, pas en CI.

## Un crew de dev, étape après étape

- `scripts/dev-run.sh` enchaîne les étapes d'un crew de dev sans personne au clavier : un `orkeon run` neuf par
  étape, via `orkeon-code run`, qui passe les réglages, le modèle et les montages (`ORKEON_CODE_SETTINGS`,
  `ORKEON_CODE_MODEL` ; avec `ORKEON_CODE_MODE=source` et `ORKEON_SOURCE`, l'outil construit depuis ce checkout
  d'Orkeon).
- Les paquets le livrent : depuis une installation, lancez le `scripts/dev-run.sh` voisin de son `orkeon-code`.
- La variable `DEV_RUN_RUNNER` nomme une autre commande, qui ne reçoit que le crew et `--inputs` : elle passe ses
  propres `-s` et `-m`, sinon le crew tourne sans réglages ni montage.
- La sortie de chaque étape va dans `.orkeon/dev/<code>/runs/<crew>-<n>.log` dans le projet, jamais en entier au
  terminal, qui en montre la dernière ligne.
- Après chaque étape, le script lit la dernière ligne du journal d'événements du code de travail :
  `.orkeon/dev/<code>/batches-state.md`, ou le fichier du projet que nomme `--log`.
- `/dev-batches` écrit le journal propre à Code, dans le REPL, où son `completed` lance chaque lot.
- Les crews que ce script lance un à un ne l'écrivent pas : nommez donc un journal qu'ils font bouger (le
  `<CODE>-BATCHES-STATE.md` du code de travail), sans quoi chaque chaîne s'arrête après sa première étape (rien n'a
  bougé).
- Le crew dev-batches ne ferait que nommer le lot suivant et le noter lancé, donc le script le refuse (sortie `64`)
  : un plan entier sans personne au clavier reste l'affaire du `/dev-batches` du REPL.
- Sans `DEV_RUN_RUNNER`, la confiance du projet est vérifiée une fois, avant la première étape, là où le terminal
  peut répondre.
- Chaque étape s'exécute ensuite avec son entrée standard sur `/dev/null`, donc rien de ce qu'elle demande ne peut
  bloquer la chaîne.

```bash
ORKEON_CODE_WORKSPACE=~/src/app bash scripts/dev-run.sh dev-verify demo \
  --inputs '{"batch":"F2","plan":"demo"}' --log workbench/demo/DEMO-BATCHES-STATE.md --max-steps 10 --wait 60 --retries 2
```

- le projet décliné à la question de confiance : rien ne s'exécute, sortie `0` ; refusé sans terminal : sortie `2` ;
- `closed` (la ligne `- <date> <time> closed`, un blanc final ou un CR à part) : les lots sont clos, sortie `0` ;
- un événement dont le détail commence par `BLOCKED` ou `GAPS` : un humain décide, sortie `3` (un GAPS que
  `/dev-batches` relance de lui-même est suivi de sa ligne `relaunched` ; seul le troisième tour d'audit encore GAPS reste le dernier) ;
- la même ligne qu'avant l'étape : rien n'a bougé, sortie `4`, jamais de boucle ;
- `--max-steps` (10 par défaut) atteint : sortie `5` ;
- une étape qui sort avec `1` ou `130` arrête la chaîne avec ce code ; une qui sort avec `75` (une question gardée par
  les points de reprise) l'arrête avec `3`, comme BLOCKED : un humain y répond ; une qui sort avec `2` et une limite de
  débit dans son journal (`429`, `rate limit`) est relancée après `--wait` secondes, `--retries` fois, puis l'arrête
  avec `2`.

`--inputs` est obligatoire : les entrées propres au crew, que son `crew.ork.ts` nomme dans son en-tête. Chaque étape est
un nouveau processus à la session vide : ce dont une étape a besoin (le lot, le plan) voyage dans ses entrées ou vit
dans les fichiers du code de travail. Un crew lancé ainsi ne reçoit rien de ce que sa commande fait d'abord : la
vérification par les étapes dev (`/dev-batches`, `/dev-plan`, `/dev-spec`) que la
garde est active et leurs jeux de règles ne s'appliquent pas ; donnez donc à
l'exécution un fichier de settings dont vous avez choisi la garde et les règles.

## Planifié, dans un job de CI

La commande ci-dessus est une ligne d'une table cron, d'un timer systemd ou d'une tâche planifiée Windows. Dans un job
de CI, la voie par l'image d'`orkeon-code run` demande Docker et la clé d'API dans l'environnement du job, tirée
d'un secret du job ; le fichier de settings est lu depuis `ORKEON_CODE_SETTINGS` (ou `--settings`), le projet à
traiter est `--workspace`, et `--trust` lui fait confiance pour cette exécution, faute de terminal où demander. Relisez le diff que l'exécution laisse avant que quoi que ce soit ne le fusionne : l'agent est
un opérateur avec les droits de son mode, pas le relecteur de son propre travail.

## Depuis votre application

Trois voies, de la plus simple :

1. **Comme un processus, depuis n'importe quel langage.** Lancez `orkeon run <crew.ork.ts> --inputs <json>` avec
   l'outil `orkeon` ou l'image `orkeon`, avec les montages et les settings que passe `orkeon-code run`, et
   lisez le JSON sur stdout, ou lancez `orkeon-code run` lui-même. Son `run_crew` est la référence pour la ligne de
   commande ; le code de sortie dit si le résultat en est un. Avec `Orkeon:RunHistory:Enabled` (éteint pour `orkeon run` par défaut), les
   événements de chaque exécution sont gardés sous `/runs` (`Store` jsonl ou sqlite, `RetentionDays` 30), que
   `orkeon runs list`, `show` et `tail` lisent.
2. **Comme un service.** Le démon `orkeon-host` de l'archive de release d'Orkeon (une unité systemd, un service Windows
   ou un conteneur) héberge des dossiers de crews et expose chacun derrière un canal de chat et, sur option, comme
   une skill A2A : un `POST /a2a/tasks/send` dont le `skillId` est le nom du crew le lance sur l'entrée de la tâche. Un
   crew `.ork.ts` hébergé demande esbuild sur la machine, que l'archive de release complète embarque et que l'image de
   conteneur n'a pas. Les crews d'Orkeon Code n'ont pas encore été éprouvés sous le démon : l'entrée qu'un crew
   procédural hébergé reçoit est le contrat du démon
   ([hôte de service Orkeon](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/service-host.md)).
3. **En processus, en .NET.** Orkeon publie sa couche de scripting sur nuget.org, le paquet `Orkeon.Scripting`
   (`1.4.0`, la dernière release) : une application l'enregistre avec `services.AddOrkeonScripting()` et exécute un
   `crew.ork.ts` par `ICrewScriptRunner.RunAsync(path)`, la forme en processus d'`orkeon run`, sans lancer de
   processus ([Running a crew in-process](https://github.com/Orkeon/orkeon/blob/main/docs/reference/hosting.md#running-a-crew-in-process)).
   esbuild n'est pas dans le paquet, comme pour l'outil. Les crews d'Orkeon Code n'ont pas encore été lancés ainsi :
   un exemple d'hôte est dans la [Feuille de route](roadmap.md).

Quelle que soit la voie, la portée de l'agent est la même : les montages que vous lui donnez, la liste blanche du shell
dans les settings, le mode de permission de l'entrée, et la garde du runtime derrière eux.

## Voir aussi

- [Permissions](permissions.md) : ce que chaque mode laisse un tour toucher, et ce qu'aucun mode ne change.
- [Configuration](configuration.md#les-settings-dont-orkeon-code-dépend) : les budgets et les limites d'un tour.
- [SECURITY.md](../../SECURITY.md) (en anglais) : ce qui confine le shell dans chaque mode de lancement.
