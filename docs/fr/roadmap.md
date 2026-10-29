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
- **Intégration en processus.** Orkeon livre sa couche de scripting en paquet `Orkeon.Scripting` (Orkeon #229) : une
  application .NET exécute un `crew.ork.ts` par `ICrewScriptRunner` sans lancer un processus. Ce qui reste est à nous :
  un exemple d'hôte qui exécute ainsi les crews d'Orkeon Code, et les crews éprouvés sous le démon `orkeon-host`.
- **Les hooks dans l'assistant.** Les hooks `pre-tool` et `post-tool` s'exécutent autour des appels d'outils du modèle
  dans les étapes dev ([Hooks](hooks.md)) ; `/assistant` ne les exécute pas encore, et rien n'exécute un
  hook `stop`.

## Plus tard

- Des sous-agents au-delà des étapes dev : les revues de `/dev-spec` et `/dev-plan` et l'audit de
  `/dev-batches` tournent en enfants d'arrière-plan (`ctx.spawnBackground`) que `/tasks` suit ; un agent enregistré par `/agents` n'est encore que
  stocké, et l'assistant ne délègue pas.
- L'éditeur structurel (`node_*`, `edit_batch`, `structural_rewrite`) dans les prompts de l'assistant : les outils
  sont au catalogue, les prompts de l'assistant ne les enseignent pas encore. Les étapes dev en utilisent une partie, branchée dans
  `/dev-batches` : ses rôles lisent et modifient un fichier par nœud (`node_replace`, `node_insert`, `node_ensure`,
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
- `/tasks` ne suit que les enfants de `/dev-spec`, `/dev-plan` et `/dev-batches`, par l'état de session : un arrêt attend le
  prochain regard du crew (environ une seconde), et un envoi à une instance finie est un nouveau run qui ne connaît
  que le rapport précédent, pas son contexte.
- Certaines commandes ne font qu'en partie ce que leur nom promet : `/summary` (pas enregistré en mémoire).
