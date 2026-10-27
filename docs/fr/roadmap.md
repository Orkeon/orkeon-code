# Feuille de route

Ce qu'Orkeon Code ne fait pas encore, dans l'ordre où nous comptons nous en occuper. Les points marqués **runtime**
demandent d'abord un changement dans [Orkeon](https://github.com/Orkeon/orkeon).

## Avant la première release

- **Des commentaires dans les termes du projet.** Les sources citent encore les tickets internes et les cycles de
  conception de l'expérimentation dont elles viennent.

## Ensuite

- **Lanceur en un coup.** `orkeon-code --run "<request>"` : un tour sans opérateur avec les modes, les settings et
  les montages d'une session, depuis le lanceur lui-même plutôt que `scripts/run-crew.sh`
  ([Exécutions autonomes et embarquées](headless.md)).
- **Intégration en processus** (runtime). La couche de scripting publiée en paquet NuGet, pour qu'une application
  .NET charge les crews sans lancer un processus ; et les crews éprouvés sous le démon `orkeon-host`.
- **Les sessions depuis le REPL.** Une session est gardée par projet et revient au démarrage (`orkeon-code
  --continue`, `--resume [<numéro ou id>]`) ; `/resume` liste celles qui sont enregistrées mais ne peut pas remplacer
  la session du REPL lui-même, et changer de session sans redémarrer vient ensuite.
- **Les hooks dans l'assistant.** Les hooks `pre-tool` et `post-tool` s'exécutent autour des appels d'outils du modèle
  dans les étapes dev ([Hooks](hooks.md)) ; `/assistant` ne les exécute pas encore, et rien n'exécute un
  hook `stop`.
- **La clôture qui relit le mode de la session** (runtime). La clôture que `/dev-implement` enchaîne après un audit
  VALID prend le mode et les règles lus au lancement du lot : les typings déclarent que le `completed` d'une commande
  renvoie `void`, et le mode ne se lit que de façon asynchrone. L'hôte attend bien une promesse que `completed`
  renvoie ; dès que les typings le diront, chaque saut relira le mode (Orkeon #220).
- **Un plan entier en un seul `/dev-batches`** (runtime). Une chaîne de crews s'arrête à la limite de profondeur du
  runtime (`Orkeon:Cli:ScriptCommands:MaxChainDepth`, 8), et un lot en prend quatre (`/dev-batches`, `/dev-implement`,
  `/dev-verify`, la clôture) : un plan de plus de deux lots environ demande de retaper `/dev-batches` après chaque
  refus. Un lancement qui garde la profondeur du parent quand un pilote se relance lui-même, ou un plafond par
  commande, la lèverait (Orkeon #221) ; monter le réglage la repousse pour toutes les commandes à la fois.
- **Coût et usage.** De vrais chiffres de coût par fournisseur, et des comptes de tokens par catégorie pour
  `/context` et `/usage`.

## Plus tard

- Des sous-agents au-delà des étapes dev : les revues de `/dev-spec`, `/dev-change` et `/dev-plan` et l'audit de
  `/dev-verify` tournent en enfants d'arrière-plan (`ctx.spawnBackground`) que `/tasks` suit ; un agent enregistré par `/agents` n'est encore que
  stocké, et l'assistant ne délègue pas.
- L'éditeur structurel (`node_*`, `edit_batch`, `structural_rewrite`) dans les prompts de l'assistant : les outils
  sont au catalogue, les prompts de l'assistant ne les enseignent pas encore. Les étapes dev en utilisent une partie, branchée dans
  `/dev-implement` : ses rôles lisent et modifient un fichier par nœud (`node_replace`, `node_insert`, `node_ensure`,
  `edit_batch`) et le lot lit `affected_tests` et rafraîchit l'index (`incremental_reindex`) ; les relecteurs
  cherchent avec `structural_search`. Trois parties attendent :
  - `structural_rewrite` reste refusé en entier dans les étapes dev, essai à blanc compris : il prend ses chemins en
    tableau plus un `glob`, et une réécriture de nombreux fichiers n'est pas le changement d'une étape. Il reste un
    outil d'édition de l'assistant.
  - `documented_in` et `documents_of` pour le placement que `/dev-learn` propose : l'apprenant interroge le modèle par
    une seule extraction, sans boucle d'outils, et n'aurait donc rien pour les appeler.
  - Les opérations Markdown d'intention, pour les jumeaux français et les fichiers du dossier de travail : aucun crew
    ne place encore du texte dans une section.
- Une limite des lots en parallèle (`/dev-batches --concurrency`) : l'audit d'un lot tourne en ligne dans son agent,
  si bien que `/tasks` ne le liste pas.
- Une liste de plan ou de tâches que la boucle tient à jour (`/tasks` est une liste manuelle aujourd'hui).
- Plusieurs sessions à la fois.
- Gardé tel quel : la question de pull request de `/commit` reste une invite de la commande (`ctx.prompt`), posée
  avant qu'aucun crew ne tourne ; `human_input` sert les questions qu'un modèle pose pendant un act.

## Problèmes connus

- Un résultat d'outil arrive au modèle coupé à 4000 caractères : 32 000 pour `file_read`, 256 000 pour `node_read`,
  10 000 pour `shell_command`. La coupe se règle par outil avec `Orkeon:Tools:ResultLimits`
  ([Configuration](configuration.md)).
- `github` et `rag_eval` ne déclarent aucun accès à Orkeon : demandés aussi en `acceptEdits`, refusés en `plan` et
  `dontAsk` (runtime ; [Permissions](permissions.md), Orkeon #219).
- `http_api` déclare une exécution et chaque outil MCP ne déclare aucun accès à Orkeon, dont la garde les traite donc
  tous deux comme des écritures, même quand ils ne font que lire : demandés en `default` et `acceptEdits`, refusés en `plan`, et en
  `dontAsk` sans règle d'autorisation (runtime ; [Permissions](permissions.md)). `web_scrape`, `scrape_element` et
  `rag_search` déclarent le leur depuis Orkeon #126 ; un accès par action pour `github` et par méthode pour `http_api`,
  et la lecture des annotations MCP, sont demandés à Orkeon (Orkeon #219).
- Le budget de tokens d'un tour somme le prompt et la complétion de chaque appel, donc un tour repaie tout son
  contexte à chaque appel et le coût croît avec le carré de ses appels ; quand la somme dépasse la limite, le tour
  finit en erreur et sa réponse est perdue. La boucle principale tourne avec 1,5M et lit par plage en attendant
  (runtime ; un budget qui compte le contexte une fois et un dernier appel pour répondre sont demandés à Orkeon,
  Orkeon #218 ; [Configuration](configuration.md)).
- La réponse peut être affichée deux fois quand le streaming console est activé : le désactiver pour un run sans
  surveillance.
- Les scripts shell d'un projet (`.sh`, `.bash`) et ses fichiers `.ps1`, `.bat` et `.cmd` ne peuvent pas être lus par
  l'agent : `file_read` et les lecteurs de nœuds répondent `File extension '.sh' is not allowed`, le validateur de
  chemins du runtime bloquant ces extensions en lecture comme en écriture, et la découverte d'`index_codebase` échoue
  sur le premier. L'index est donc demandé pour toutes les grammaires sauf bash : les scripts n'entrent dans aucun
  index, et `/analyze` fonctionne sur un projet qui en contient (runtime ; une lecture laissée passer et un fichier
  refusé ignoré sont demandés à Orkeon, Orkeon #215).
- Depuis le shell, l'assistant n'atteint aucun remote privé : le runtime passe à un `shell_command` une liste
  blanche de variables d'environnement qui laisse tomber `DBUS_SESSION_BUS_ADDRESS` et `SSH_AUTH_SOCK`, donc un helper
  d'identifiants adossé au trousseau (`gh auth git-credential`, le défaut de `gh`) et l'agent ssh ne donnent rien à
  git, et un dépôt privé répond `Repository not found` quand un public fonctionne. Fetch, pull et push d'un tel remote
  se font depuis votre terminal (runtime ; le passage des sockets de la session au shell est demandé à Orkeon, Orkeon #216).
- `/help` liste les 58 commandes en un seul bloc, `[(no group)]` : le runtime groupe les commandes d'un runner par le
  premier mot de leur nom, et le nom d'une commande scriptée n'a qu'un mot. Les dossiers de `src/commands/` donnent
  l'ordre de la liste, pas ses titres (runtime ; un groupe par commande scriptée, dérivé de son dossier, est demandé à
  Orkeon, Orkeon #214).
- `/tasks` ne suit que les enfants de `/dev-spec`, `/dev-change`, `/dev-plan` et `/dev-verify`, par l'état de session : un arrêt attend le
  prochain regard du crew (environ une seconde), et un envoi à une instance finie est un nouveau run qui ne connaît
  que le rapport précédent, pas son contexte.
- Certaines commandes ne font qu'en partie ce que leur nom promet : `/summary` (pas enregistré en mémoire), `/status`
  (la version du runtime est l'épinglage, non lue sur l'hôte qui tourne), `/context` et `/usage` (totaux seulement,
  pas de chiffres par catégorie).
- Le runtime enregistre son outil `github` sans jeton : `/commit --pr` reçoit le refus de GitHub (401) tant que l'hôte
  ne peut pas en recevoir un, puis affiche la commande `gh pr create` (runtime ; une clé de settings et `GITHUB_TOKEN`
  lus à l'enregistrement sont demandés à Orkeon, Orkeon #222).
