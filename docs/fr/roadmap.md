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
- **Sessions persistantes.** Reprendre une conversation après la sortie du REPL ; garder le mode de session et les
  règles de permission d'une session à l'autre. Le runtime sait déjà persister une session (`Persist`) ; Orkeon Code
  ne le câble pas encore.
- **Les hooks dans l'assistant.** Les hooks `pre-tool` et `post-tool` s'exécutent autour des appels d'outils du modèle
  dans `/dev-plan` et `/dev-verify` ([Hooks](hooks.md)) ; `/assistant` ne les exécute pas encore, et rien n'exécute un
  hook `stop`.
- **Coût et usage.** De vrais chiffres de coût par fournisseur, le taux de cache, le comptage des tokens pour
  `/context` et `/usage`. Le runtime rapporte les tokens de cache (`session_stats`) ; les commandes ne les lisent pas
  encore.

## Plus tard

- Les sous-agents par `spawn_agent` et `ctx.spawnBackground` : le runtime offre les deux, Orkeon Code n'en utilise
  encore aucun (`/agents` enregistre des configurations ; la délégation n'est pas câblée).
- L'éditeur structurel (`node_*`, `edit_batch`, `structural_rewrite`) dans les prompts de l'assistant : les outils
  sont au catalogue, les prompts ne les enseignent pas encore.
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
- `/tasks` est une liste de choses à faire tenue à la main, pas un moniteur du travail en arrière-plan.
- Certaines commandes ne font qu'en partie ce que leur nom promet : `/summary` (pas enregistré en mémoire), `/status`
  (la version du runtime est l'épinglage, non lue sur l'hôte qui tourne), `/resume` (une session en mémoire),
  `/context` et `/usage` (totaux seulement, pas de chiffres par catégorie).
- Le runtime enregistre son outil `github` sans jeton : `/commit --pr` reçoit le refus de GitHub (401) tant que l'hôte
  ne peut pas en recevoir un, puis affiche la commande `gh pr create`.
