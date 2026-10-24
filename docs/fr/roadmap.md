# Feuille de route

Ce qu'Orkeon Code ne fait pas encore, dans l'ordre où nous comptons nous en occuper. Les points marqués **runtime**
demandent d'abord un changement dans [Orkeon](https://github.com/Orkeon/orkeon).

## Avant la première release

- **Des commentaires dans les termes du projet.** Les sources citent encore les tickets internes et les cycles de
  conception de l'expérimentation dont elles viennent.

## Ensuite

- **Distribution.** Une image ou un outil .NET `orkeon-code` qui embarque ces sources, pour se passer du clone.
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
  VALID prend le mode et les règles lus au lancement du lot : le `completed` d'une commande est synchrone et le mode ne
  se lit que de façon asynchrone.
- **Un plan entier en un seul `/dev-batches`** (runtime). Une chaîne de crews s'arrête à la limite de profondeur du
  runtime (8), et un lot en prend quatre (`/dev-batches`, `/dev-implement`, `/dev-verify`, la clôture) : un plan de
  plus de deux lots environ demande de retaper `/dev-batches` après chaque refus. Une limite plus profonde, ou un
  lancement depuis le `completed` d'une commande qui ouvre une nouvelle chaîne, la lèverait.
- **Coût et usage.** De vrais chiffres de coût par fournisseur, le taux de cache, le comptage des tokens pour
  `/context` et `/usage`. Le runtime rapporte les tokens de cache (`session_stats`) ; les commandes ne les lisent pas
  encore.

## Plus tard

- Des sous-agents au-delà des étapes dev : la revue de `/dev-plan` et l'audit de `/dev-verify` tournent en enfants
  d'arrière-plan (`ctx.spawnBackground`) que `/tasks` suit ; un agent enregistré par `/agents` n'est encore que
  stocké, et l'assistant ne délègue pas.
- L'éditeur structurel (`node_*`, `edit_batch`, `structural_rewrite`) dans les prompts de l'assistant : les outils
  sont au catalogue, les prompts de l'assistant ne les enseignent pas encore. Les étapes dev en utilisent une partie, branchée dans
  `/dev-implement` : ses rôles lisent et modifient un fichier par nœud (`node_replace`, `node_insert`, `node_ensure`,
  `edit_batch`) et le lot lit `affected_tests` et rafraîchit l'index (`incremental_reindex`) ; les relecteurs
  cherchent avec `structural_search`. `documented_in`, `documents_of` et les opérations Markdown d'intention sont en
  attente d'un crew qui place du texte dans une section.
- Des lots exécutés en parallèle, chacun dans son worktree : `/dev-batches` les exécute l'un après l'autre.
- Une liste de plan ou de tâches que la boucle tient à jour (`/tasks` est une liste manuelle aujourd'hui).
- Plusieurs sessions à la fois.

## Problèmes connus

- Un résultat d'outil arrive au modèle coupé à 4000 caractères : 32 000 pour `file_read`, 256 000 pour `node_read`,
  10 000 pour `shell_command`. La coupe se règle par outil avec `Orkeon:Tools:ResultLimits`
  ([Configuration](configuration.md)).
- `github` et `rag_eval` ne déclarent aucun accès à Orkeon : demandés aussi en `acceptEdits`, refusés en `plan` et
  `dontAsk` ([Permissions](permissions.md)).
- `http_api` et chaque outil MCP ne déclarent aucun accès à Orkeon, dont la garde les traite donc comme des
  écritures, même quand ils ne font que lire : demandés en `default` et `acceptEdits`, refusés en `plan`, et en
  `dontAsk` sans règle d'autorisation (runtime ; [Permissions](permissions.md)). Les outils web et RAG déclarent le
  leur depuis Orkeon #126.
- La réponse peut être affichée deux fois quand le streaming console est activé.
- `/tasks` ne suit que les enfants de `/dev-plan` et `/dev-verify`, par l'état de session : un arrêt attend le
  prochain regard du crew (environ une seconde), et un envoi à une instance finie est un nouveau run qui ne connaît
  que le rapport précédent, pas son contexte.
- Certaines commandes ne font qu'en partie ce que leur nom promet : `/summary` (pas enregistré en mémoire), `/status`
  (la version du runtime est l'épinglage, non lue sur l'hôte qui tourne), `/context` et `/usage` (totaux seulement,
  pas de chiffres par catégorie).
- Le runtime enregistre son outil `github` sans jeton : `/commit --pr` reçoit le refus de GitHub (401) tant que l'hôte
  ne peut pas en recevoir un, puis affiche la commande `gh pr create`.
