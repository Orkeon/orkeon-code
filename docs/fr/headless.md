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

Choisissez-le par requête (`bypassPermissions: migre les tests vers node:test`), pour la session
(`/mode bypassPermissions`), ou pour le projet (`/config permissions.fallback bypassPermissions`, conservé dans le
`.orkeon/config.json` du projet, de sorte que chaque session sur ce projet démarre ainsi). Dans le REPL, `default` et
`acceptEdits` vous demandent avant un appel que le mode n'autorise pas d'emblée ; dans une exécution sans opérateur,
personne ne répond, et la garde refuse ce qu'elle aurait demandé (le modèle lit `DENIED: …`). Donnez à une exécution
sans opérateur un mode qui ne demande jamais : `bypassPermissions`, ou `plan` et `dontAsk` pour un travail en lecture
seule ([Permissions](permissions.md)).

Sous `orkeon run` (`scripts/run-crew.sh`), la garde n'a personne à qui demander, et décide chaque appel par le seul
mode :

| Mode | Sous `orkeon run` |
|---|---|
| `default` | Lectures seulement : tout autre appel est refusé (les modifications, `github`, `rag_eval`, `spawn_agent`, le shell, `http_api`) |
| `acceptEdits` | Lectures et modifications (`file_write`, `edit_file`, `node_*`, `edit_batch`, `structural_rewrite`, `spawn_agent`) ; `github`, `rag_eval`, le shell et `http_api` sont refusés |
| `plan`, `dontAsk` | Lectures seulement |
| `bypassPermissions` | Tout |

Un act sans `permissionMode` tourne en `default`. Un hook `onToolCall` ne voit que les appels que la garde a
autorisés, et un `"ask"` qu'il renvoie est vérifié à nouveau comme une modification en `default`, donc refusé ici.

Ce qui borne un tour, quel que soit le mode :

- le budget du crew `main-loop` : 200 appels d'outils, 30 minutes, 400k tokens, 40 itérations de la boucle ;
- le délai d'exécution des scripts dans les settings : `Orkeon:Cli:ScriptCommands:Limits` pour le REPL,
  `Orkeon:Scripting:Limits` pour l'outil `orkeon` d'une exécution indépendante (30 minutes chacun dans l'exemple) ;
- la garde de l'hôte (`Orkeon:Security:PermissionGate:Enabled`), qui confronte chaque appel au mode derrière le
  catalogue ;
- les montages : le projet sur `/workspace`, les montages de travail `/output` et `/tmp`, rien d'autre ;
- la liste blanche du shell dans les settings.

Préférez le mode docker pour un tour `bypassPermissions` sans opérateur : le shell tourne alors dans le conteneur, et
le projet est le seul dossier de votre machine qu'il peut écrire ([SECURITY.md](../../SECURITY.md)).

## En un coup depuis un shell

`scripts/run-crew.sh` lance un crew hors du REPL : avec l'outil `orkeon` (`Orkeon.Scripting.Cli` de nuget.org, épinglé
dans `.config/dotnet-tools.json`, qui demande le SDK .NET 10) ou, sans SDK, avec l'image `orkeon-runners`. Tant
qu'Orkeon `1.0.0-rc.6` n'est pas publié, ni l'un ni l'autre n'existe à la version épinglée et le script ne peut pas
tourner ([Développement](development.md)). Le crew lit son entrée dans le JSON de `--inputs`. Pour `main-loop`, c'est
ce que `/assistant` lui passe : la requête et le mode. `permissionRules` (les règles de la session, telles que
`/permissions` les liste : `deny http_api`, `allow shell_command command=npm test*`) et `extraTools` (les outils des
serveurs MCP et des plugins, tels que `tools.extra` les nomme) sont ce que la commande de lancement résout dans le
REPL ; une exécution indépendante n'a pas de session où les prendre : ne les passez que si vous savez ce que le
catalogue doit contenir. Aucune règle de session n'existe hors du REPL : `permissionRules` ne fait que façonner le
catalogue (une règle deny sur un outil entier le retire), et une règle allow n'épargne aucune question. Aucune option
d'`orkeon run` ne fixe le mode ; il appartient aux entrées du crew
(`--inputs '{"prompt":"…","permissionMode":"acceptEdits"}'`), et la garde demande
`Orkeon:Security:PermissionGate:Enabled: true` dans le fichier de settings. `orkeon run` n'enregistre les outils
d'analyse (`node_*`, `edit_batch`, `structural_rewrite`, `batch_anchors`, `structural_search`…) que tant que
`RaggableTree:Enabled` n'est pas `false` ; s'il vaut `false`, un act qui reçoit le catalogue de `main-loop` échoue avec
`UnknownToolError`.

```bash
export DEEPSEEK_API_KEY=...                       # the variable named by Llm:ApiKeyEnvVar
ORKEON_CODE_WORKSPACE=~/src/app bash scripts/run-crew.sh src/crews/main-loop/crew.ork.ts \
  --inputs '{"prompt": "add a --json flag to the report command, with a test",
             "permissionMode": "bypassPermissions"}'
```

Le script monte le projet en lecture-écriture sur `/workspace` et un dossier de travail sur `/output`, comme le REPL.
Le runner imprime le résultat du crew en JSON sur stdout et sort avec `0` quand le script s'est terminé, `1` sur une
erreur de script, `2` sur une erreur du runtime, `130` quand il est annulé. Les primitives de session existent aussi
dans une exécution indépendante, mais le tampon de conversation, le sac d'état et la mémoire typée démarrent vides et
finissent avec le processus : une exécution est un tour.

Chaque crew se lance ainsi ; son `crew.ork.ts` dit dans son en-tête quels `inputs` il lit (`code-review` :
`{ files?, commit? }` ; `advisor` : aucun). La CI vérifie que chaque commande et chaque crew se charge
(`scripts/smoke-runtime.sh`) ; un tour sans opérateur de `main-loop` face à un modèle s'éprouve à la main, pas en CI.

## Planifié, dans un job de CI

La commande ci-dessus est une ligne d'une table cron, d'un timer systemd ou d'une tâche planifiée Windows. Dans un job
de CI, la voie par l'image de `scripts/run-crew.sh` demande Docker et la clé d'API dans l'environnement du job, tirée
d'un secret du job ; le fichier de settings est lu depuis `ORKEON_CODE_SETTINGS`, et le projet à traiter depuis
`ORKEON_CODE_WORKSPACE`. Relisez le diff que l'exécution laisse avant que quoi que ce soit ne le fusionne : l'agent est
un opérateur avec les droits de son mode, pas le relecteur de son propre travail.

## Depuis votre application

Trois voies, de la plus simple :

1. **Comme un processus, depuis n'importe quel langage.** Lancez `orkeon run <crew.ork.ts> --inputs <json>` avec
   l'outil `orkeon` ou l'image `orkeon-runners`, avec les montages et les settings que `scripts/run-crew.sh` passe, et
   lisez le JSON sur stdout. Le script est la référence pour la ligne de commande ; le code de sortie dit si le
   résultat en est un.
2. **Comme un service.** Le démon `orkeon-host` de l'archive de release d'Orkeon (une unité systemd, un service Windows
   ou un conteneur) héberge des dossiers de crews et expose chacun derrière un canal de chat et, sur option, comme
   une skill A2A : un `POST /a2a/tasks/send` dont le `skillId` est le nom du crew le lance sur l'entrée de la tâche. Un
   crew `.ork.ts` hébergé demande esbuild sur la machine, que l'archive de release complète embarque et que l'image de
   conteneur n'a pas. Les crews d'Orkeon Code n'ont pas encore été éprouvés sous le démon : l'entrée qu'un crew
   procédural hébergé reçoit est le contrat du démon
   ([hôte de service Orkeon](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/service-host.md)).
3. **En processus, en .NET : pas encore.** La couche de scripting qui exécute les fichiers `.ork.ts`
   (`Orkeon.Scripting`) est livrée dans l'outil `orkeon` et le REPL, pas en paquet NuGet, et le paquet `Orkeon` est
   l'API C# du builder, qui ne charge pas de scripts. Suivi dans la [Feuille de route](roadmap.md) (runtime).

Quelle que soit la voie, la portée de l'agent est la même : les montages que vous lui donnez, la liste blanche du shell
dans les settings, le mode de permission de l'entrée, et la garde de l'hôte derrière eux.
