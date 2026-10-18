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
  règles de permission d'une session à l'autre.
- **Des hooks qui se déclenchent.** `/hooks` enregistre des déclarations ; le moteur qui les exécute manque.
- **Coût et usage.** De vrais chiffres de coût par fournisseur, le taux de cache, le comptage des tokens pour
  `/context` et `/usage`.

## Plus tard

- Les appels d'outils en parallèle (le runtime exécute les appels d'un tour du modèle l'un après l'autre) et les
  sous-agents (`/agents` enregistre des configurations ; la délégation n'est pas câblée).
- Une liste de plan ou de tâches que la boucle tient à jour (`/tasks` est une liste manuelle aujourd'hui).
- Plusieurs sessions à la fois.

## Problèmes connus

- Un résultat d'outil arrive au modèle coupé à 4000 caractères, 32 000 pour `file_read` (runtime).
- `http_api` et chaque outil MCP ne déclarent aucun accès à Orkeon, dont la garde les traite donc comme des
  écritures, même quand ils ne font que lire : demandés en `default` et `acceptEdits`, refusés en `plan`, et en
  `dontAsk` sans règle d'autorisation (runtime ; [Permissions](permissions.md)). Les outils web et RAG déclarent le
  leur depuis Orkeon #126.
- La réponse peut être affichée deux fois quand le streaming console est activé.
- `/tasks` est une liste de choses à faire tenue à la main, pas un moniteur du travail en arrière-plan.
- Certaines commandes ne font qu'en partie ce que leur nom promet : `/summary` (pas enregistré en mémoire),
  `/status` (ni version du runtime ni fournisseur), `/resume` (une session en mémoire), `/context` et `/usage`
  (totaux seulement, pas de chiffres par catégorie ; les hits de cache seulement quand l'hôte les rapporte).
