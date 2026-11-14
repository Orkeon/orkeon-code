# Configuration

Orkeon Code n'a pas de format de configuration qui lui soit propre : le fichier de settings est un fichier de settings
du runtime Orkeon, que le REPL lit par `--settings`. Partez de
[`config/appsettings.example.json`](../../config/appsettings.example.json).

## D'où viennent les settings

1. `--settings FILE` sur le lanceur ;
2. `ORKEON_CODE_SETTINGS` ;
3. `config/appsettings.local.json` dans le checkout (ignoré par git), dans un clone seulement : une installation ne le
   lit jamais ;
4. `~/.orkeon-code/appsettings.json` (`%USERPROFILE%\.orkeon-code\appsettings.json` sous Windows ; `ORKEON_CODE_HOME`
   déplace le dossier) ;
5. `~/.config/orkeon-code/appsettings.json` (`%APPDATA%\orkeon-code\appsettings.json` sous Windows), l'ancien
   emplacement : encore lu, avec un avertissement qui nomme le nouveau ;
6. le fichier d'Orkeon, `~/.config/Orkeon/appsettings.json` (`%APPDATA%\Orkeon\appsettings.json` sous Windows), celui
   qu'écrit `orkeon init`. Le lanceur ne passe alors aucun `--settings` : le REPL le lit lui-même (le mode docker le
   monte, le conteneur n'ayant pas votre dossier personnel). Un `XDG_CONFIG_HOME` absolu remplace `~/.config` en 5 et 6.

Sans aucun d'eux et avec un terminal, `orkeon-code setup` se lance : il demande le fournisseur (l'exemple DeepSeek ou
celui d'Ollama), le modèle et le **nom** de la variable d'environnement qui tient la clé, jamais la clé ; il écrit
`~/.orkeon-code/appsettings.json`, lisible par vous seul, et dit quelle variable exporter. `orkeon-code setup` le
relance à tout moment, et demande avant de remplacer un fichier existant. Sans terminal, le lanceur s'arrête et nomme
ces choix.

Le bloc `orkeonCode` de ce fichier porte vos propres réglages de session, que le `.orkeon/config.json` d'un projet ne
peut pas élargir ([ce qu'un fichier du projet peut régler](permissions.md#ce-quun-fichier-du-projet-peut-régler)). Le
lanceur copie le bloc seul, jamais la section `Llm`, dans `<state>/user-config/config.json` à chaque démarrage et le
remet à la session en lecture seule, sur `/user-config`, dans tous les modes.

Les variables d'environnement préfixées `ORKEON_` l'emportent sur le fichier (`__` sépare les sections) :
`ORKEON_Llm__Model`, `ORKEON_Llm__ApiKey`. `ORKEON_CODE_MODEL` est un raccourci du lanceur pour `ORKEON_Llm__Model`.

## Le LLM

| Clé | Signification |
|---|---|
| `Llm:Model` | Identifiant du modèle envoyé au point d'accès |
| `Llm:BaseUrl` | Point d'accès compatible OpenAI (`https://api.deepseek.com`, `https://api.openai.com/v1`, un serveur local...) |
| `Llm:ApiKeyEnvVar` | Nom de la variable d'environnement qui porte la clé. La clé elle-même ne va jamais dans le fichier |
| `Llm:AvailableModels` | Les modèles que `/model` propose, pour en changer sans relancer |
| `Llm:Temperature`, `Llm:MaxTokens`, `Llm:TimeoutSeconds` | Réglages de génération |
| `Llm:MaxRateLimitWait` | La plus longue fenêtre de limite de débit qu'un appel attend avant d'échouer, `00:05:00` par défaut |
| `Llm:Profiles:<name>:MaxRateLimitWait` | La même borne pour un profil nommé du runtime, `00:05:00` par défaut |
| `Llm:Profiles:<name>:Fallback`, `Llm:Profiles:<name>:FallbackBudgetSeconds` | Les profils vers lesquels un appel de `<name>` se déplace, dans l'ordre, quand il échoue d'une façon qu'une nouvelle tentative ne répare pas |
| `Llm:ModelCapabilities:<id du modèle>` | Ce qu'un modèle accepte : `Thinking` (`None`, `EffortOnly` pour un modèle qui raisonne toujours, `Toggle`, `Budget`), `ReasoningEfforts`, les efforts qu'il prend (un `effort` qu'un modèle listé ne prend pas est envoyé au plus haut niveau en dessous que le modèle et le champ du fournisseur prennent tous deux, ou au plus bas d'entre eux quand aucun n'est en dessous, avec un avertissement ; un modèle listé nulle part reçoit tout effort que le champ du fournisseur prend, avec un avertissement), `Vision`, `AudioInput`, `AudioOutput`. `Llm:ModelCapabilities:<fournisseur>/<id du modèle>` les fixe pour un seul fournisseur |
| `Llm:Thinking:Enabled`, `Llm:Thinking:Effort` | Mode raisonnement et intensité du raisonnement, pour les fournisseurs qui en ont un |

Ce que le tableau laisse de côté :

- **`Llm:MaxTokens` sur un modèle qui raisonne toujours** (GLM-5.3 chez Z.AI) :
  - Son raisonnement compte dans `MaxTokens`. Une étape qui répond en un long JSON, comme le plan de
    `/dev-plan`, a besoin de place : à 24576 la réponse revenait coupée ou vide, à 65536 elle tient. Quand le budget
    s'épuise, le refus le dit avec les jetons dépensés : `the output budget (MaxTokens = …) ran out, reasoning
    included` pour une réponse vide, `cut short: the output budget ran out` pour une réponse coupée en cours.
  - GLM-5.3 ne prend que les efforts `low`, `high` et `max`. Le runtime envoie un `medium` en `low`, avec un
    avertissement (Z.AI y refuse `medium`, HTTP 400 code 1210). Omettez `Llm:Thinking:Effort`, ou demandez `high` : à
    `low`, le modèle ne raisonne presque plus, et les plans qu'il écrit sont plus souvent refusés.
- **`Llm:Profiles:<name>:Fallback`, `Llm:Profiles:<name>:FallbackBudgetSeconds`** :
  - Une erreur de transport, un 5xx, un 429 une fois les tentatives épuisées, un délai dépassé.
- **`Llm:MaxRateLimitWait`** :
  - Un 429, ou un 529 avec un en-tête de réinitialisation, attend que la fenêtre annoncée par le fournisseur
    (`retry-after-ms` en millisecondes comme l'envoient OpenAI et TypeSafe, sinon `Retry-After`, comparé aux
    en-têtes de réinitialisation du fournisseur ; la plus longue l'emporte) se rouvre au lieu de faire échouer le
    tour.
  - Une fenêtre plus longue fait échouer l'appel aussitôt avec `LlmRateLimitException`, l'attente dans son message.
  - `00:00:00` n'attend rien.
- **`Llm:Profiles:<name>:Fallback`, `Llm:Profiles:<name>:FallbackBudgetSeconds`** :
  - Un 4xx ou un contenu bloqué est rendu tel quel, un flux ne se déplace qu'avant son premier token, et chaque
    déplacement est un événement `llm.fallback` dans le journal du runtime.
  - `default` nomme le profil propre du runtime.
  - Une chaîne ne revient jamais à un profil d'où elle est partie.
  - `FallbackBudgetSeconds` borne la chaîne entière, vérifié entre deux profils, sans jamais couper un appel en
    cours.
  - Omis, le `TimeoutSeconds` et les tentatives de chaque profil la bornent.
  - Les exemples Jev, Kev et Liquid font retomber `small` sur `large`.
  - Rien à voir avec le `Fallback` d'une étape de routage (`Orkeon:Decision:Profiles:<name>:Stages`), le profil
    qu'une route choisit quand aucun choix n'atteint son seuil.
- **`Llm:ModelCapabilities:<id du modèle>`** :
  - Sans la clé, la table propre du runtime s'applique.

Orkeon reconnaît les fournisseurs natifs d'après le point d'accès et le modèle (OpenAI, Anthropic, Gemini, Mistral,
DeepSeek, Z.AI, Moonshot, serveurs locaux...) : la liste et leurs options sont dans la
[documentation des fournisseurs LLM d'Orkeon](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/llm-providers.md).
Une option qu'un fournisseur ne peut pas honorer produit un avertissement, jamais un abandon silencieux.

### Cache du prompt

- Un fournisseur qui met le prompt en cache (DeepSeek et OpenAI d'eux-mêmes, Anthropic avec `cache_control`)
  rapporte les tokens lus dans son cache et écrits dedans.
- Orkeon les garde par modèle et `/usage` et `/context` en montrent la somme dans `cacheRead` et `cacheWrite` (`n/a`
  tant qu'aucun appel n'a rapporté le compte, jamais `0`, qui se lit comme mesuré : le runtime omet un compte non rapporté).
- La durée de vie du cache est une option d'appel d'Orkeon, `orkeon:cache_ttl` (`5m` ou `1h`, d'après le réglage de
  cache d'un agent) : Anthropic l'honore, les fournisseurs compatibles OpenAI et Ollama journalisent qu'ils ne le
  peuvent pas.
- Orkeon Code n'en fixe aucune, chaque fournisseur garde donc sa durée par défaut (une écriture d'une heure
  coûterait deux fois le tarif du prompt).
- Anthropic ne met en cache que ce qu'une requête marque : chaque agent d'Orkeon Code marque son prompt système et
  ses définitions d'outils (`.cache({ systemPrompt: true, tools: true })`), un préfixe que ses prompts gardent
  identique d'un tour à l'autre, donc dès le deuxième appel d'une session `cacheRead` compte ce qu'Anthropic a servi
  depuis son cache.
- La demande de l'agent l'emporte sur un réglage par défaut `Llm:Cache` du runtime.

### Ce que compte `/usage`

- `usedTokens` et `estTokens` sont la taille de la conversation dans la fenêtre de contexte, estimée par le runtime.
- Les colonnes `llm*` sont comptées par les fournisseurs sur tous les appels : `llmInTokens` envoyés, `llmOutTokens`
  reçus (`llmReasoningTokens` en fait partie), `llmTokens` leur somme.
- `cacheRead` et `cacheWrite` font partie de `llmInTokens`, et `cacheRatio` vaut `cacheRead / llmInTokens` : tous
  viennent du compte d'usage du runtime quand il en tient un, sinon de `session_stats`, jamais l'un de chaque : un
  compte du cache que le compte d'usage n'a pas mesuré s'affiche `n/a`, même quand `session_stats` en a un.
- `/context` prend ses `cacheRead` et `cacheWrite` selon la même règle.
- Un chiffre que le runtime ne rapporte pas s'affiche `n/a`, de même qu'un ratio sur une lecture du cache non rapportée
  : un `0` mesuré s'affiche `0`.

Un modèle sur cette machine : [`config/appsettings.ollama.example.json`](../../config/appsettings.ollama.example.json)
est l'exemple sur [Ollama](https://ollama.com) servant `qwen3.5:2b` (`ollama pull qwen3.5:2b` d'abord), sans clé et
sans que rien ne quitte la machine ; Orkeon reconnaît Ollama à son port, 11434. Ollama sert chaque modèle avec une
fenêtre de 4 096 tokens sauf si son environnement en décide autrement, et Orkeon ne l'élargit pas par requête : le
prompt système d'un tour fait environ 2 250 tokens avant les schémas d'outils et la conversation, donc réglez
`OLLAMA_CONTEXT_LENGTH=16384` sur le service Ollama, sinon le modèle perd en silence ses consignes et ses outils.

### Un modèle de décision devant le LLM

- Orkeon peut placer un modèle de décision, Jev (le System One de TypeSafe, `jev-latest`), devant un modèle.
- Le runtime sert un fournisseur de décision parmi trois, TypeSafe (`Orkeon:TypeSafe`,
  `TYPESAFE_API_KEY`), Liquid (`Orkeon:Liquid`, `LIQUID_API_KEY`) et Kev (`Orkeon:Kev`, un serveur local, jamais
  déduit) : `Orkeon:Decision:Provider` le nomme, sinon le runtime le déduit de la seule section présente, ou de la seule
  clé définie quand aucune section ne l'est.
- Deux sections, ou deux clés sans section, refusent le démarrage, et la section de la garde d'entrée est
  `Orkeon:Guardian:Llm`, fermée en cas d'échec par défaut (`Orkeon:Decision:Guard` et
  `Orkeon:TypeSafe:Guard` sont refusées au démarrage comme clés inconnues).
- Un profil de décision fonctionne de la même façon quel que soit le fournisseur : un *profil de décision*
  (`Orkeon:Decision:Profiles:<nom>`) enveloppe un profil LLM nommé (`Llm:Profiles:<nom>`) d'étapes qui routent la
  requête vers le profil qui lui convient, la gardent (injection de prompt, les risques que vous nommez) ou
  vérifient la réponse et remontent vers un profil plus fort quand elle ne tient pas.
- `Orkeon:Guardian:Llm:Phases` peut ajouter `Output` : elle juge la sortie d'une *tâche* de crew, en retenant ses
  deltas diffusés jusqu'au jugement, si bien que la réponse d'une tâche gardée s'affiche d'un coup à sa fin.
- `ctx.llm.act`, sur lequel tourne chaque agent d'Orkeon Code, n'est pas jugé en sortie.
  [`config/appsettings.jev.example.json`](../../config/appsettings.jev.example.json) est l'exemple : la section
  `Orkeon:TypeSafe` (la clé dans `TYPESAFE_API_KEY`, jamais dans le fichier), deux profils LLM, `small` et `large`,
  et le profil de décision `guarded` par-dessus.
- La clé de session `llm.profile` nomme le profil sur lequel tournent les agents des commandes, `/config set
  llm.profile guarded` : chaque crew qu'une commande lance y construit ses agents, agents enfants des étapes dev
  compris, et le journal du lancement et `/config list` le montrent.
- Sans la clé rien ne change : les agents tournent sur le modèle par défaut du runtime, comme avant.
- Un nom que le runtime ne déclare pas fait échouer le chargement du crew, son erreur listant les profils que le runtime
  connaît.
- Un simple profil LLM marche de la même façon, sans modèle de décision devant.
- Le modèle par appel d'`/advisor` (`advisor.model`) s'applique toujours par-dessus le profil.
- La surcharge de `/model`, elle, ne s'applique pas : sous un profil, les tours de l'assistant ne l'envoient pas
  (elle remplacerait le modèle du profil, et sur un profil de décision celui de sa cible de remontée aussi), et
  chaque tour journalise `/model override '<nom>' ignored: llm.profile <profil> is active`.
- `/model show` nomme le profil, et `/model <nom>` enregistre la surcharge avec un avertissement, pour qu'elle
  s'applique de nouveau une fois `llm.profile` retiré.
- Kev sur cette machine et Liquid, pas à pas, avec leurs exemples
  [`config/appsettings.kev.example.json`](../../config/appsettings.kev.example.json) et
  [`config/appsettings.liquid.example.json`](../../config/appsettings.liquid.example.json) : [Modèles de décision en
  local](decision-models-local.md).
- Les étapes et leurs réglages sont dans [les modèles de décision
  d'Orkeon](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/decision-models.md).

Claude par un plan Max : [`config/appsettings.anthropic.example.json`](../../config/appsettings.anthropic.example.json)
vise `https://api.anthropic.com` avec `claude-opus-5-5` et la clé dans `ANTHROPIC_API_KEY`. Depuis octobre 2026 un plan
Max inclut des crédits API mensuels (100 USD sur Max 5x, 200 USD sur Max 20x, sans report), dépensés par une clé API de
l'organisation Anthropic Console liée au plan (sur claude.ai, Settings, Billing, API credits, Link organization ; le
lien se fait une fois) ; au-delà, la clé est facturée aux tarifs à l'usage de l'API. La connexion avec le plan lui-même
est réservée aux applications d'Anthropic et n'est pas un moyen de lancer Orkeon Code. L'exemple ne fixe pas de
`Temperature` : la génération Claude actuelle en refuse une, et Orkeon n'envoie que ce que le fichier fixe.

L'agent appelle des outils à travers chaque fournisseur : la boucle d'outils du runtime (`ctx.llm.act`) lit les appels
d'outils des formats Anthropic et OpenAI, exécute les appels de lecture d'un tour du modèle jusqu'à
`MaxParallelToolCalls` à la fois et les autres l'un après l'autre, chaque appel à travers la garde de permission, et renvoie les résultats dans le protocole d'outils du
fournisseur. Un résultat d'outil parvient au modèle coupé à 4000 caractères, 32 000 pour `file_read`, 12 000 pour les outils d'analyse.

## Les settings dont Orkeon Code dépend

| Clé | Pourquoi |
|---|---|
| `Orkeon:Security:PermissionGate:Enabled` = `true` | Le runtime confronte chaque appel d'outil du modèle aux règles de `/permissions` et au mode, et vous demande quand le mode le dit ([ce que la garde ne voit pas](permissions.md)) |
| `Orkeon:Cli:ScriptCommands:Limits:ExecutionTimeout` | Limite de temps réel de chaque moteur de script d'`orkeon-repl` : celui d'une commande, et celui d'un crew, donc d'un tour d'`/assistant` |
| `Orkeon:Cli:ScriptCommands:Limits:MemoryLimitBytes` | Limite de mémoire de ces moteurs : 64 Mo par défaut, l'exemple met 2 Gio |
| `Orkeon:Scripting:Limits:ExecutionTimeout`, `Orkeon:Scripting:Limits:MemoryLimitBytes` | Les mêmes limites pour `orkeon run`, l'outil avec lequel `scripts/run-crew.sh` lance un crew (30 secondes et 100 Mo par défaut ; l'exemple met 30 minutes et 2 Gio). `orkeon-repl` ne les lit pas |
| `Orkeon:Tools:Shell:AllowInterpreters` | Laisse `shell_command` lancer des interpréteurs (`node`, `dotnet`, `npm`...), nécessaire pour construire et tester la plupart des projets |
| `Orkeon:Tools:Shell:ExtraAllowedCommands` | Commandes ajoutées à la liste blanche du shell (`make`, `cargo`...) |
| `Orkeon:Tools:Shell:WindowsPaths:<chemin virtuel>` | Sous WSL, l'écriture Windows d'un montage (`"/workspace": "C:\\proj"`) |
| `Orkeon:Tools:Shell:Confinement:Mode` | `Auto` (défaut : bubblewrap sous Linux, Seatbelt sous macOS, AppContainer sous Windows, aucun dans un conteneur), `None`, `Bubblewrap`, `Seatbelt` ou `AppContainer` |
| `Orkeon:Tools:Shell:Environment:SessionBus` | Si un shell confiné (bubblewrap, Seatbelt, AppContainer) reçoit le bus de session, `DBUS_SESSION_BUS_ADDRESS`, dont le helper d'identifiants de `gh` adossé au trousseau a besoin |
| `Orkeon:Tools:Shell:Environment:Propagate` | Noms de variables ajoutées à la liste blanche du shell |
| `Orkeon:Tools:ResultLimits:Limits:<tool>` | La coupe du résultat d'un outil, en caractères |
| `Orkeon:Tools:ResultLimits:MaxParallelToolCalls` | Les appels de lecture d'un même tour du modèle qui tournent en même temps : 4 |
| `Orkeon:Rag:Retrieval:MinScore` | Le score sous lequel un passage est écarté, pour toute recherche RAG et pas seulement la mémoire partagée |
| `Orkeon:Tools:GitHub:Token` | Le jeton de l'outil `github`, lu une fois à l'enregistrement de l'outil ; préférez la variable ci-dessous à un jeton écrit dans un fichier de settings, que les exemples laissent de côté |
| `Orkeon:Tools:GitHub:TokenVariable` | La variable d'environnement où l'outil `github` lit son jeton quand `Token` n'est pas réglé : `GITHUB_TOKEN` par défaut, puis `GH_TOKEN` |
| `Orkeon:Tools:Firefox:*` | L'outil `firefox`, qui pilote le Firefox de la machine hôte par WebDriver BiDi, sans rien télécharger |
| `Orkeon:Cli:ConsoleStreaming:Enabled` | Affiche la réponse au fil de sa génération |
| `Orkeon:Cli:Tui:Theme` | La palette sur laquelle démarre la console à panneaux : `dark`, `light` ou `none` ; sans elle `dark`, ou `none` avec `NO_COLOR`. Toute autre valeur empêche le démarrage. `/theme` la change pour la session |
| `Orkeon:Cli:ScriptCommands:MaxScripts` | Commandes que le chargeur garde : 200 par défaut, au-dessus de la surface de commandes de ce projet |
| `RateLimiting:*` | Limites de débit des requêtes vers le fournisseur |

Ce que le tableau laisse de côté :

- **`Orkeon:Tools:Shell:WindowsPaths:<chemin virtuel>`** :
  - Un programme Windows (`cmd.exe`, `code.exe`, le `git.exe` de Git for Windows) lancé par `shell_command` reçoit
    ses arguments et ses résultats dans cette écriture, là où un programme Linux reçoit `/mnt/c/proj`.
- **`Orkeon:Tools:ResultLimits:Limits:<tool>`** :
  - 4000, `file_read` 32000, `node_read` 256000, `shell_command` 10000, et 12000 pour les douze outils d'analyse
    (`dependency_graph`, `sub_graph`, `edge_list`, `codebase_search`, `symbol_detail`…), dont le JSON
    place `truncated`, les comptes et le curseur en tête, si bien qu'un résultat coupé dit encore qu'il est partiel.
- **`Orkeon:Tools:Firefox:*`** :
  - `ExecutablePath` quand il n'est pas dans le `PATH`, `Headless` pour masquer sa fenêtre, visible par défaut (sans
    affichage il démarre sans fenêtre), `Profile`, `AllowedProfiles` et `DeniedProfiles` pour un profil autre que le
    profil jetable, `Lifetime` : `run` par défaut, le navigateur se ferme avec le tour de l'agent.
- **`Orkeon:Security:PermissionGate:Enabled` = `true`** :
  - Le lanceur l'active sauf si le fichier de settings dit le contraire.
  - Sans elle, aucun appel n'est contrôlé et les modes ne font que façonner le catalogue.
- **`Orkeon:Cli:ScriptCommands:Limits:ExecutionTimeout`** :
  - Elle s'arrête pendant qu'un appel d'outil attend votre réponse. 5 minutes par défaut.
  - Un tour qui indexe un grand dépôt en demande plus : l'exemple met 30 minutes.
  - Un `/dev-batches <code> F<n> --audit full` peut prendre environ une heure (build 900 s, suite entière 900 s,
    trois validations de 300 s chacune, plus le temps du modèle) : mettez-y 60 minutes ou plus.
- **`Orkeon:Tools:Shell:WindowsPaths:<chemin virtuel>`** :
  - Sans la clé, tout programme reçoit l'écriture Linux.
- **`Orkeon:Tools:Shell:Confinement:Mode`** :
  - Confinée, chaque commande shell s'exécute sous `bwrap` (Linux, modes tool et source), réseau coupé sauf
    `Confinement:AllowNetwork`, les programmes hors des répertoires système à lister dans
    `Confinement:ReadOnlyPaths`.
  - Une commande échoue quand elle ne peut pas être confinée.
  - Les exemples mettent `None`.
  - Un fichier de settings sans la clé confine, hors d'un conteneur.
  - `/dev-batches --concurrency` au-delà de 1 fonctionne sous Bubblewrap avec un runtime qui monte le répertoire git
    d'un worktree lié.
  - Avec un plus ancien, git échoue dans le worktree d'un lot, et l'exécution se refuse en une ligne.
  - Confiné, le push de clôture n'atteint aucun remote (pas de réseau, `HOME=/tmp`, donc aucun identifiant) :
    l'exécution reste ouverte avec la commande `git push`.
  - Poussez-la depuis un terminal, puis le `/dev-batches` suivant clôt l'exécution sans pousser de nouveau.
  - Voir [SECURITY.md](../../SECURITY.md).
- **`Orkeon:Tools:Shell:Environment:SessionBus`** :
  - `false` par défaut, puisque par le bus une commande peut lancer un processus hors du bac à sable.
  - Un shell non confiné (`Confinement:Mode` `None`, les exemples de settings) et le bac à sable de code le
    reçoivent.
  - `SSH_AUTH_SOCK` et `XDG_RUNTIME_DIR` atteignent tout shell, donc git atteint un remote privé par l'agent ssh
   .
- **`Orkeon:Tools:Shell:Environment:Propagate`** :
  - Un nom portant un mot de secret (`KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `PASSWD`, `PASS`, `CREDENTIAL`, `AUTH`,
    `PAT` comme segment entier), commençant par `ORKEON_`, ou dont la valeur porte des identifiants d'URL est écarté
    avec un avertissement.
- **`Orkeon:Tools:ResultLimits:Limits:<tool>`** :
  - Une release antérieure les coupe à 4000, `truncated` en dernier : mettez-les à 12000 là.
  - Un résultat coupé finit par `[... truncated, N chars omitted. …]`.
  - L'audit de `/dev-batches` lit cette mention.
- **`Orkeon:Rag:Retrieval:MinScore`** :
  - Aucun par défaut, donc une question sans réponse reçoit quand même des passages.
  - Les exemples mettent 0,6, mesuré sur le jeu de référence de la mémoire partagée avec l'embedder local : 0,5
    répondait encore à la question sans réponse, 0,7 perdait du rappel.
  - Son effet sur une recherche dans des documents n'a pas été mesuré, et un autre embedder a une autre échelle.
- **`Orkeon:Tools:GitHub:TokenVariable`** :
  - Le mode Docker du lanceur passe `GITHUB_TOKEN`, `GH_TOKEN` et la variable nommée ici au conteneur, chacune quand
    elle est définie.
  - Les modes natifs héritent de l'environnement.
  - Sans jeton, la description de l'outil dit où le régler.
  - Un jeton apparaît en `***` dans les résultats et les journaux, et aucune des deux clés n'accepte une référence
    de variable.
- **`Orkeon:Tools:Firefox:*`** :
  - `host` le garde ouvert avec ses onglets d'un tour à l'autre, un navigateur par profil, jusqu'à `close`, la
    fermeture de la fenêtre à la main ou l'arrêt de la console.
  - Un navigateur que `host` garde reste ouvert quand la session passe en `plan` ou `dontAsk`, qui retirent l'outil
    : l'agent ne peut pas le piloter de là.
  - Il demande le mode source : les runtimes de release n'ont pas l'outil, et la présence d'un Firefox dans l'image
    docker n'a pas été vérifiée.
- **`Orkeon:Cli:ConsoleStreaming:Enabled`** :
  - L'exemple l'active.
  - Une commande n'imprime plus rien une fois la réponse diffusée.
  - Avec `/dev-batches --concurrency` au-dessus de 1, la réponse diffusée de chaque lot arrive ligne par ligne : sur
    la console plain préfixée de son ticket (`[t2] `), seule la réponse au premier plan au fil de l'eau (Orkeon
    #211).
  - Dans la TUI sur l'écran propre du lot, sans le préfixe.

### Combien de temps un tour peut durer

 Deux limites bornent un tour d'`/assistant`, et la première atteinte y met fin :

- l'`ExecutionTimeout` du moteur de script ci-dessus, qui s'arrête pendant qu'une question vous attend ;
- Le budget propre du crew de la boucle principale, écrit dans son code (`src/crews/main-loop/crew.ork.ts`) : 200
  appels d'outils, 700k tokens de contexte et 30 minutes de temps réel, qui s'arrête pendant qu'un appel d'outil
  attend votre réponse.
  - Le contexte est compté une fois : chaque appel paie sa complétion plus ce dont son prompt a
    grandi, ou la part que le cache du fournisseur n'a pas servie, donc un tour de n appels sur un contexte de c
    tokens dépense environ c plus ses complétions, jamais tout son contexte à chaque appel.
  - Cette horloge est celle d'Orkeon et, comme celle du moteur, elle s'arrête pendant que la garde attend votre
    réponse : seul le travail du modèle compte, et une question laissée sans réponse ne met pas fin au tour.
  - Quand les tokens de contexte atteignent la limite, le tour n'exécute plus d'outil : le modèle fait un dernier
    appel sans outil, sa réponse s'affiche sous une ligne qui dit que le tour s'est arrêté sur son budget, et seul
    un dernier appel qui échoue ou ne répond rien finit le tour en erreur.
  - Une limite d'appels d'outils ou de temps réel le finit toujours en erreur.

`Orkeon:Cli:ScriptHost:RunCrewTimeout` (10 minutes par défaut) ne borne qu'un crew qu'une commande attend
(`runCrew`) ; Orkeon Code lance chaque crew avec `runCrewAsync`, qu'il ne borne pas, donc l'exemple l'omet.

## Réglages de session

Dans le REPL, `/config` liste, lit et écrit les clés de session, rangées dans le `.orkeon/config.json` du projet.
`/config keys` les liste toutes.

| Clé | Si omise | Effet |
|---|---|---|
| `permissions.fallback` | `default` | le mode utilisé quand ni un préfixe ni `/mode` n'en a choisi un |
| `tools.extra` | | les outils supplémentaires offerts au modèle ([ci-dessous](#outils-supplémentaires--serveurs-mcp-et-plugins)) |
| `voice.reply` | | lit chaque réponse à voix haute ([synthèse vocale](speech.md#synthèse-vocale)) |
| `answer.language` | | la langue dans laquelle l'assistant répond, sauf si une requête est écrite dans une autre |
| `compaction.trigger` | la fenêtre moins la place dont un tour a besoin | le nombre de tokens auquel la compaction automatique se déclenche |
| `compaction.prune` | `off` | le modèle de décision du runtime élague les résultats d'outils périmés d'un tour en cours |
| `route.agents` | `off` | à chaque lancement d'un crew, le modèle de décision du runtime choisit le profil le moins cher de `route.ladder` qui convient à la commande ; dans un crew, de même pour l'act d'un relecteur ou de l'auditeur |
| `route.ladder` | `small,large` | les profils LLM du runtime parmi lesquels le routage choisit, le moins cher d'abord |
| `skills.suggest` | `off` | le modèle de décision du runtime ajoute à un tour les skills du projet qui conviennent à sa requête |
| `dev.workDir` | le `layout.work` du pack du dépôt, sinon `workbench` | le dossier de travail que les étapes dev lisent et écrivent, relatif au checkout |
| `dev.prAuto` | `false` | `/commit` et la clôture d'une étape dev préparent la pull request comme le fait `--pr`, sans qu'on le demande |
| `memory.dir` | `.orkeon/memory` | le dossier de la [mémoire partagée](shared-memory.md), relatif au projet |
| `memory.project` | le nom du remote `origin`, sinon `local` | le projet que nomment les entrées et la collection d'index `memory-<project>`, un nom en kebab-case |
| `memory.autoAdmitAudited` | `false` | `/memory admit` admet sans demander un candidat qu'un audit appuie |
| `paths.deny`, `paths.allow` | | les chemins qu'aucun outil du modèle ne lit ni n'écrit, et les seuls chemins qu'il peut atteindre ([permissions](permissions.md#les-listes-de-chemins)) |
| `review.lenses` | les trois | les angles de `/review`, séparés par des virgules parmi `correctness`, `security` et `style` |
| `llm.profile` | le modèle par défaut du runtime | le profil du runtime sur lequel tournent les agents de chaque crew ([le LLM](#le-llm)) |
| `advisor.model` | celui de la session, ce qui en fait une auto-relecture | le modèle du second avis de `/advisor` |
| `commit.requireConfirm` | `true` | `false` laisse `/commit` s'exécuter sans sa confirmation |
| `spinnerVerbs` | | |

Comment certaines se règlent :

```text
/config set answer.language French
/config set compaction.trigger 90k
/config set compaction.prune on
/route on
/config set route.ladder small,large
/skills suggest on
/config set dev.workDir backstage/tasks
/config set memory.dir docs/memory
/config set paths.deny /workspace/secrets, tests/fixtures/real
/config set llm.profile guarded
```

Ce que le tableau laisse de côté :

- **`compaction.prune`** demande un [fournisseur de décision](decision-models-local.md) sur le runtime ; le mécanisme
  est décrit dans [Le déroulement d'un tour](turn.md#compaction-et-mémoire).
- **`route.agents`** se règle aussi par `/route on` ; voir
  [Router un crew vers un profil](turn.md#router-un-crew-vers-un-profil).
- **`skills.suggest`** se règle aussi par `/skills suggest on` ; voir
  [Suggérer des skills pour un tour](turn.md#suggérer-des-skills-pour-un-tour).
- **`dev.workDir`** sert aussi à `/dev-status` et à `/dev-learn`. `/commit` le lit également, et laisse le dossier de
  travail hors d'un commit, sauf si un chemin qui s'y trouve est nommé.
- **`dev.prAuto`** écrit le corps de la pull request sous `<work>/pr-<slug>/PR.md`. La pull request est ensuite
  ouverte avec l'outil `github` du runtime quand celui-ci l'offre, que la session l'autorise et que l'outil a un
  jeton (`GITHUB_TOKEN`, [settings](#les-settings-dont-orkeon-code-dépend)). Sinon, la commande `gh pr create` à
  taper est affichée, avec la raison.
- **`memory.dir`** n'est jamais sous `.claude/` ni `.git/`, et jamais le `.orkeon/agent-memory` de la mémoire d'agent.
- **`paths.deny` et `paths.allow`** sont séparés par des virgules, dans n'importe quelle écriture de la machine
  hôte. Ils sont comparés sur l'écriture virtuelle, un deny l'emportant, et appliqués au prochain démarrage.
- **`llm.profile`** nomme un profil LLM, ou un profil de décision avec Jev devant.

### Les commandes qui changent le déroulement des tours suivants

`/model`, `/effort`, `/passes` (un alias de `/review`), `/fast`, `/proactive` et `/output-style` changent la façon
dont les tours suivants s'exécutent.

`/effort` demande aussi une réflexion au fournisseur. Le niveau enregistré est envoyé comme `effort` de l'act par
`/assistant`, par chaque étape dev (`/dev-spec`, `/dev-plan`, `/dev-batches`) et par les agents qu'elles lancent ;
la session n'en envoie aucun tant qu'aucun niveau n'est enregistré, et le `Llm:Thinking:Effort` de l'hôte, quand il
en fixe un, part alors seul. Les niveaux sont `low`, `medium`, `high`, `xhigh` et `max`. Orkeon Code envoie le niveau
tel qu'il est enregistré et le runtime le juge : un niveau que le champ du fournisseur ou le modèle ne prend pas
(`Llm:ModelCapabilities`) est envoyé au plus haut en dessous que les deux prennent, ou au plus bas d'entre eux quand
aucun n'est en dessous ; aucun quand ils n'en partagent aucun. Le journal du runtime le dit.

`/effort` lit ce jugement auprès du runtime, pour le modèle sur lequel s'exécutent les tours de la session : sa
surcharge `/model`, sinon le modèle de l'hôte.

- `/effort show` liste les niveaux que le modèle prend (`glm-5.3 takes low, high, max`) et, pour un niveau enregistré
  qu'il ne prend pas, le niveau envoyé à sa place. Sans niveau enregistré, il nomme le niveau que demande le
  `Llm:Thinking:Effort` de l'hôte, et ce qu'il devient : `provider thinking: not requested by the session; the host
  asks for 'medium' — 'medium' is sent to glm-5.3 as 'low' (it takes low, high, max)`. Sur un modèle que la table
  des capacités ne connaît pas, il dit que le niveau, enregistré ou celui de l'hôte, part sans vérification ; ce cas
  ne donne pas d'avertissement.
- Régler un niveau que le modèle ne prend pas l'enregistre quand même, puisque les itérations le suivent, et avertit :
  `⚠ effort: 'medium' is sent to glm-5.3 as 'low' (it takes low, high, max).` Un niveau que le runtime n'envoie pas
  du tout donne `⚠ effort: 'high' is not sent to <model>.`, avec les niveaux que le modèle prend quand la table le
  connaît et que le niveau n'en fait pas partie.
- Sous une surcharge `/model`, les étapes dev et les sous-agents s'exécutent toujours sur le modèle de l'hôte : quand
  le niveau n'y part pas tel quel, et pas de la façon que dit la première ligne, une deuxième ligne le dit, `⚠ effort, dev steps and sub-agents (the
  host's model): …`.
- Le panneau d'un `/effort` sans argument marque chaque niveau qui partirait sous un autre, ou pas du tout.
- `/model` donne les mêmes avertissements après un changement ou une remise à zéro, et `/config unset llm.profile`
  quand les tours reviennent à ce modèle. Quand le panneau de `/model` change le modèle et l'effort ensemble, seul le
  nouveau niveau est jugé, sur le nouveau modèle.

Sous un `llm.profile`, le modèle jugé est celui du profil : `/effort`, `/model` et `/config set llm.profile <name>`
parlent de lui. Un `/route` sans argument, sous un profil ou non, ajoute une ligne par échelon du ladder avec ce que
prend son modèle (`small: glm-5.3-flashx takes low, high, max`), ou ce que le niveau enregistré y devient. Un profil que l'hôte ne
déclare pas n'a ni ligne ni avertissement : les commandes comparent d'abord le nom à la liste du runtime
(`llm.profiles`, Orkeon #364), sans la casse. La ligne de journal d'un tour nomme le niveau envoyé, sous un profil
aussi, puisqu'elle est jugée sur l'agent qui s'exécute : `act — effort: medium (sent as 'low' to glm-5.3),
maxIterations: 40`, ou sans niveau enregistré, `act — effort: none stored, the host asks for medium (sent as 'low'
to glm-5.3), maxIterations: 40`.

Un rôle ou un crew routé peut encore s'exécuter sur un autre modèle : les avertissements ne parlent que des cibles de
la session. Sur un runtime antérieur à Orkeon #361 (les modes tool et docker en 1.0.0), rien n'est dit des niveaux du
modèle ; avant #365, rien de ceux d'un profil.

### Ce que les réglages de l'utilisateur restreignent

- `permissions.fallback`, `tools.extra`, `memory.autoAdmitAudited`, `dev.prAuto` et `paths.allow` réglés dans le
  fichier du projet sont restreints par le bloc `orkeonCode` des réglages de l'utilisateur (un `true` du projet sur
  un `false` ou une absence chez l'utilisateur est écarté, comme une entrée allow hors de la liste de l'utilisateur,
  avec un avertissement) : `/config set` écrit une telle valeur, puis dit, sous "persisted", qu'elle est ignorée et
  où va votre propre réglage, et la ligne `settings: project file` de `/doctor` la nomme.
- `/config set --session` n'est pas restreint.
- `paths.deny` réglé dans le fichier du projet s'ajoute au contraire à la liste de l'utilisateur.
- Les deux listes, avec l'hôte que le lanceur a écrit dans `/user-config/launch.json`, sont lues une fois au
  démarrage : la ligne `host: paths` de `/doctor` montre l'hôte, la base de chaque mount, les listes telles qu'elles
  s'appliquent et chaque entrée ou fichier qu'elle n'a pu utiliser, et un changement de `paths.*` s'applique au
  démarrage suivant.

### Le script de démarrage

- Au démarrage du REPL, le runtime exécute une fois le fichier que nomme sa clé `Orkeon:Cli:Session:StartScript`, et
  place ce qu'il imprime avant la première requête que vous tapez.
- Le lanceur la règle sur `/tmp/orkeon-code/session-start.ork.ts`, une copie de `scripts/session-start.ork.ts` faite
  à chaque démarrage : il nomme les fichiers d'état des lots de dev qu'une compaction a écrits ces 7 derniers jours
  (`.orkeon/dev/<code>/state-F<n>.md`, avec la première étape ouverte) et les lots que le journal d'événements de
  Code laisse ouverts.
- Il n'imprime rien quand il n'y en a pas.
- Réglez `Orkeon__Cli__Session__StartScript` sur un autre chemin virtuel pour exécuter le vôtre ou, sous Linux et
  macOS, sur une valeur vide pour n'en exécuter aucun.
- Faites-en un `.ork.ts`, que le runtime exécute par son hôte de scripts : tout autre fichier passe à `sh` par
  `shell_command`, ce qui échoue ici (les fichiers `.sh` sont refusés, `sh` n'est pas parmi les commandes du shell,
  et en modes tool et source le shell lit le `/tmp` de la machine hôte).
- `sh scripts/session-start.sh <projet>` imprime les mêmes lignes dans un terminal.

### Les clés du pack du dépôt

Le pack du dépôt (`.orkeon/repo.yaml`, sinon celui du harness) peut aussi donner `tests.trait_pattern`, une clé
d'Orkeon Code que le harness ignore : la façon dont un test nomme l'id de fiche qu'il couvre, que la porte de
l'audit d'un lot (`/dev-batches <code> F<n> --audit`) cherche sous les racines de test. C'est une ligne qui contient `<id>` exactement une fois et `<name>` une
fois au plus ; `<name>` tient la place de `tests.rule_trait`, qu'il exige alors. 80 caractères au plus, ni tabulation
ni apostrophe droite ; une suite d'espaces correspond à un nombre quelconque d'espaces. Sans elle, `tests.rule_trait`
seul donne le motif par défaut `[Trait("<name>", "<id>")]`. Un dépôt Node, dont les tests portent alors
`// rule: BR-01` :

```yaml
tests:
  rule_trait: rule
  trait_pattern: "// <name>: <id>"
```

Il peut aussi donner `layout.test_files`, une autre clé que le harness ignore : les fichiers de test posés à côté du
code, en motifs de la porte (`*` correspond à toute suite de caractères, `/` compris). `/dev-batches` tient un chemin
pour un fichier de test quand il est sous `layout.tests` ou correspond à un motif : l'implémenteur ne peut pas
l'écrire, l'auteur des tests le peut, et une exécution exige l'une des deux clés. Un dépôt Node dont les tests sont à
côté du code :

```yaml
layout:
  domain: src
  test_files: ["src/*.test.ts"]
```

`layout.tests` ne nomme jamais une racine de sources (`tests: src` à côté de `domain: src`) : les deux rôles seraient
refusés dans ce dossier, et la lecture du pack le signale comme un problème (⚠ au début de
`/dev-batches`).

## Outils supplémentaires : serveurs MCP et plugins

Le REPL connecte les serveurs MCP des settings `MCP:Servers` d'Orkeon et charge les plugins de sa section `Plugins`
([documentation MCP d'Orkeon](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/mcp.md)) ; leurs outils
rejoignent ceux du runtime. L'assistant en utilise un dès que la clé de session `tools.extra` le nomme :

| Clé | Valeur |
|---|---|
| `tools.extra` | Entrées séparées par des virgules ou des espaces, chacune `<name>` ou `<name>:<read\|write>`. Sans classe, un outil est une écriture. Omise : aucun outil supplémentaire |

La classe décide quels modes proposent l'outil : `read` dans tous les modes, `write` dans `default`, `acceptEdits` et
`bypassPermissions` seulement. Ne marquez `read` qu'un outil qui ne change rien et n'envoie rien hors de la machine.
La [garde de permission](permissions.md#outils-supplémentaires) décide toujours de chaque appel. `/config set` refuse
une entrée qui n'est pas dans la notation, qui nomme un outil intégré, ou qui nomme un outil deux fois.

- La déclaration d'un serveur (`MCP:Servers:<id>`) prend aussi `CallTimeout` (`00:01:00` par défaut :
  un appel qui le dépasse finit en erreur d'outil ; le [serveur vocal](speech.md#transcription-de-la-parole) reçoit
  15 minutes) et `ConnectTimeout` (30 s).
- `Tools:Allow` et `Tools:Deny`, qui filtrent les outils du serveur avant leur enregistrement, si bien qu'un outil
  refusé est absent aussi pour `tools.extra`, qui le signale (ne refusez jamais `record_and_transcribe`, `speak` ni
  `stop_speaking` : `/voice` et `/say` les appellent).
- `Headers` (une valeur `env:VAR` lit la variable ; un en-tête de transport est refusé) et `Auth` (`Bearer`, `Basic`,
  ou OAuth 2 client credentials et device code, le secret lu dans une variable d'environnement, le code d'appareil
  affiché sur stderr).
- Une `Url` qui porte des identifiants doit être https ou loopback.
- `Transport: Sse` est le transport Streamable HTTP : un serveur qui ne parle que le transport HTTP+SSE du
  2024-11-05 ne se connecte plus.
- Un plugin est un dossier `<nom>/` sous le répertoire `Plugins`, qui tient `plugin.json` (`name`, `version`,
  `orkeonVersion`, `entryAssembly`, `tools`) à côté de son assembly.
- Une `.dll` à plat est refusée, et `dotnet new orkeon-plugin` crée le dossier.

Par exemple, le serveur de parole que ce dépôt livre ([ci-dessous](speech.md#transcription-de-la-parole)) enregistre six
outils, dont trois ont leur place dans la liste : `transcribe_audio`, `list_audio` et `whisper_info`. Les trois
autres, `record_and_transcribe`, `speak` et `stop_speaking`, servent `/voice` et `/say` et en restent à l'écart. Une
fois le serveur connecté :

```text
/config set tools.extra transcribe_audio:read,list_audio:read,whisper_info:read
```

Un nom est comparé aux noms que le runtime enregistre, sans distinction de casse comme Orkeon les compare, et le tour
utilise la graphie enregistrée : le `get-file-contents` d'un serveur MCP se liste `get-file-contents` (en n'importe
quelle casse), pas `get_file_contents` ; `/debug-tool-call list` montre les noms enregistrés. `/permissions` montre
les outils supplémentaires, ceux que le runtime n'enregistre pas, et les entrées qu'il ignore ; chaque tour avertit d'un
outil listé que le runtime n'enregistre pas, et le laisse de côté. En mode docker, la commande d'un serveur `Stdio`
s'exécute dans le conteneur.

## Sessions

Le REPL enregistre la conversation après chaque tour et quand il finit (`Orkeon:Cli:Session:Persist`, `true` dans les
settings d'exemple), et le lanceur la garde hors du projet : dans `~/.orkeon-code/projects/<projet>/` une fois installé,
`.crew-output/projects/<projet>/` dans un clone, `<ORKEON_CODE_STATE>/projects/<projet>/` quand cette variable est
définie. `<projet>` est le nom du dossier et un court hash de son chemin, si bien que deux projets du même nom ne le
partagent jamais ; `project.json` y nomme le chemin. Rien n'est écrit sous `.orkeon/sessions` du projet
(`/doctor` avertit quand un démarrage plus ancien y a laissé des sessions).

| Démarrage | Ce qu'il ramène |
|---|---|
| `orkeon-code` | Une session neuve : la dernière passe d'abord dans `history/` du projet |
| `orkeon-code --continue` (`-c`) | La session que vous avez quittée |
| `orkeon-code --resume` | Les sessions gardées, la plus récente d'abord (date, titre, messages, id), puis demande laquelle |
| `orkeon-code --resume <numéro ou id>` | Celle-là, sans demander (un début d'id qui désigne une seule session suffit) |

Sans terminal, `--resume` seul affiche la liste et sort avec le code 2. Les 50 sessions gardées les plus récentes
restent (`ORKEON_CODE_SESSIONS_KEEP`, de 1 à 9999) ; une session sans message n'est pas gardée. Un second démarrage
pendant qu'une session est ouverte sur le même projet avertit, laisse l'ouverte en paix et garde la sienne à côté,
dans l'historique dès le démarrage suivant. Dans le REPL, `/resume` liste les sessions gardées (le lanceur monte
`history/` en lecture seule sur `/session-history`) et `/resume <numéro ou id>` en ramène une sur place : la session en cours est enregistrée dans une archive à côté de son propre fichier, que le démarrage suivant
passe dans l'historique, puis celle choisie remplace la conversation, son état et son titre, et le tour suivant la
continue. L'historique de l'éditeur de ligne (la flèche du haut) n'est pas gardé.

- La mémoire typée (`/memory`, et les faits qu'une compaction sauve) est gardée par projet elle aussi, dans
  `<Orkeon:Cli:Memory:RootDirectory>/<projet>/memory.json` : `Orkeon:Cli:Memory:Persist` vaut `true`
  dans les settings d'exemple, et le REPL l'active quand la clé est absente.
- `orkeon run` ne la garde que si les settings le disent, et sans cela la mémoire finit avec le processus.
- Le lanceur fixe `RootDirectory` à `/memory`, le dossier `memory/` à côté des sessions, hors du projet, que ni git
  ni les outils de fichiers ne voient donc.
- `/clear` et une nouvelle session laissent la mémoire en place, et `/memory delete` retire une entrée.
- Sans le lanceur (`orkeon run`, `scripts/run-crew.sh`), les settings d'exemple nomment
  `/workspace/.orkeon/typed-memory` : le défaut du runtime, `/workspace/.orkeon/memory`, est le dossier de la
  [mémoire partagée](shared-memory.md), où la mémoire typée ne doit pas entrer.

`--llm-log` parmi les arguments du REPL écrit le journal LLM dans `<état du projet>/llm-logs`, jamais dans le
projet ; `--llm-log-path <dossier>` est passé tel quel et l'emporte sur un `--llm-log` seul.

## L'environnement du lanceur

| Variable | Effet |
|---|---|
| `ORKEON_CODE_MODE` | `docker`, `tool` ou `source` |
| `ORKEON_CODE_SETTINGS` | Fichier de settings |
| `ORKEON_CODE_MODEL` | Modèle pour cette exécution |
| `ORKEON_CODE_AUDIO_DIR` | Dossier des fichiers audio et vidéo : active la [transcription de la parole](speech.md#transcription-de-la-parole) (modes tool et source) |
| `ORKEON_CODE_VOICE` | `1` : ouvre le microphone à [`/voice`](speech.md#dictée) et le haut-parleur à [`/say`](speech.md#synthèse-vocale) (avec `ORKEON_CODE_AUDIO_DIR`) |
| `ORKEON_CODE_STATE` | Où vivent `/output`, `/tmp`, `/user-config` et les transcriptions (défaut `.crew-output/` dans un clone, `<home>/projects/<projet>` dans une installation) ; les [sessions](#sessions) et la mémoire typée vont sous son `projects/<projet>/` |
| `ORKEON_CODE_SESSIONS_KEEP` | Combien de [sessions](#sessions) gardées un projet conserve (défaut 50) |
| `ORKEON_CODE_HOME` | Le dossier propre d'une installation : son `appsettings.json`, son `trusted-folders.json`, son état et son dépôt de démo (défaut `~/.orkeon-code`). Un clone y lit aussi son `appsettings.json` et son `trusted-folders.json` |
| `ORKEON_CODE_IMAGE` | Une autre image du runtime (mode docker) |
| `ORKEON_REPL` | La ligne de commande qui démarre le REPL (mode tool) |
| `ORKEON_SOURCE` | Checkout d'Orkeon (mode source) |
| `ORKEON_ESBUILD_PATH` | Binaire esbuild (modes tool et source) |
| `ORKEON_CODE_TRUST` | `1` : démarre un dossier sans confiance sans terminal, seulement quand `CI=true`, sans rien enregistrer ([Dossiers de confiance](permissions.md#dossiers-de-confiance)) |

Le lanceur exporte aussi `Orkeon__Security__PermissionGate__Enabled=true` et `Orkeon__Cli__Session__Persist=true` sauf
s'ils sont déjà définis (le fichier de settings l'emporte encore sur eux), `ORKEON_Orkeon__Cli__Session__SessionsDirectory=/sessions`
et `ORKEON_Orkeon__Cli__Memory__RootDirectory=/memory` (qui l'emportent sur lui), et, en modes tool et source,
`ORKEON_ALLOW_EXTERNAL_MOUNTS=1`, pour que le REPL, démarré depuis le projet, accepte les montages `/output`, `/tmp`,
`/user-config`, `/sessions`, `/session-history` et `/memory` du répertoire d'état. `/permissions` dit si la
garde est active.
