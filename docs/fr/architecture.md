# Architecture

Orkeon Code est la moitié TypeScript d'un agent de code ; le runtime [Orkeon](https://github.com/Orkeon/orkeon) en est
l'autre moitié. Cette page décrit comment les deux se rejoignent, les contraintes que pose le runtime, les couches
des sources et la règle qui les lie, et le chemin d'une requête jusqu'à un crew. Les raisons du découpage en couches
sont consignées dans l'[ADR 0001](../adr/0001-clean-architecture.md) (en anglais).

Trois pages prolongent celle-ci : [Le déroulement d'un tour](turn.md) suit une requête dans la boucle principale,
[Les prompts des crews](crew-prompts.md) spécifie ce que le prompt de chaque crew doit produire, et
[Recettes](recipes.md) donne les étapes des changements courants.

## Deux moitiés

| Ce dépôt (TypeScript) | Le runtime Orkeon (.NET, épinglé à un commit de son `main` dans `.orkeon-version`) |
|---|---|
| Les commandes (`src/commands/<group>/*.cmd.ts`) | Le REPL de commandes scriptées qui les charge (`orkeon-repl --runner=scripted-commands`) |
| Les crews (`src/crews/<name>/crew.ork.ts`) | Le moteur de script (Jint) et le bundler (esbuild) qui les exécutent |
| Les prompts, l'analyse syntaxique, les décisions (`domain/`, `application/`) | Les outils (fichiers, shell, git, intelligence de code, web, session, mémoire) |
| Le catalogue de permissions par mode, les règles de la session | La garde de permission qui confronte chaque appel d'outil du modèle (`act`) aux règles et au mode, et interroge l'opérateur |
|  | Le VFS : `/workspace`, `/output`, `/tmp`, `/crews` et `/cli-commands` en lecture seule |
|  | Les fournisseurs LLM, le streaming, le décompte des coûts et des tokens |

## Les contraintes du runtime

Le runtime exécute les sources sous des règles qui façonnent tout ce qui suit :

- **Un bundle par point d'entrée.** Chaque `*.cmd.ts`, `crew.ork.ts` et `probe.ork.ts` est bundlé seul par esbuild
  (`--platform=neutral`, les options du runtime, reproduites par `npm run bundle:check`) et évalué par Jint. Un module
  que plusieurs points d'entrée importent est copié dans chaque bundle.
- **Jint, pas Node.** Aucun module `node:`, pas de `process`, pas de paquet npm, pas de timer. L'API du runtime, ce
  sont ses globales (`tools`, `agentBuilder`, `crewBuilder`, `toolBuilder`, `rag`, `inputs`) et le contexte qu'il
  remet à chaque handler de commande et à chaque corps d'agent (`ctx` : `llm`, `log`, `state`, `services`...).
- **Aucune instance partagée.** Rien ne vit d'un bundle à l'autre : un objet de portée module existe une fois par
  bundle et par exécution. Un registre, un conteneur ou un cache partagé entre les commandes et les crews ne peut pas
  exister.
- **Le sac d'état de la session est le seul état partagé.** Commandes, crews et tours partagent ce que la session
  détient : le tampon de conversation et le sac d'état (`session_store`), vidés par `/clear`. Le fichier de settings
  (`/workspace/.orkeon/config.json`) est le stockage durable. La mémoire typée dure tant que le runtime la garde :
  par projet dans un fichier quand `Orkeon:Cli:Memory:Persist` est actif (le défaut du REPL, et celui des settings
  d'exemple), elle atteint donc une exécution suivante ; sinon dans le processus Orkeon, avec lequel elle meurt
 .
- **Un crew se charge de façon synchrone et ne voit que ses `inputs`.** Sa portée module ne peut pas attendre : ce qui
  décide du catalogue d'outils (le mode, les outils supplémentaires, les règles de permission) est résolu par la
  commande qui lance le crew et lui parvient en entrée.
- **Un fichier de commande n'exporte rien.** Le chargeur évalue un `*.cmd.ts` comme un script et charge tout fichier
  qui correspond à ce motif : le code partagé entre commandes vit dans `commands/_lib/`.
- **Les imports relatifs nomment leur fichier `.ts`**, car le bundler les résout tels qu'ils sont écrits ; il n'y a
  pas d'alias de chemin.
- **Du TypeScript effaçable seulement** (`erasableSyntaxOnly`) : Node exécute les tests en supprimant les types, donc
  pas d'`enum`, pas de `namespace`, pas de propriété de paramètre.
- **Un nom inconnu dans `.tools([...])` fait échouer le tour** : `act` lève `UnknownToolError` avant d'interroger le
  modèle, donc un catalogue ne nomme que des outils que le runtime enregistre (les outils supplémentaires sont vérifiés
  contre eux au lancement).
- **`onToolCall` tourne avant la garde du runtime**. La garde juge une fois l'entrée que le callback
  renvoie ; un `{ deny }` du callback ne l'atteint jamais, et un `"ask"` est jugé comme une modification en `default` une fois l'appel
  admis par le mode de l'act. Le callback voit donc des appels que la garde refuse ensuite ; ceux-là reviennent au
  modèle, et à `onToolResult`, comme un résultat `DENIED:`.
- **Les appels de lecture d'un tour tournent ensemble.** `Orkeon:Tools:ResultLimits:MaxParallelToolCalls` (4) appels
  de lecture d'un même tour du modèle tournent en même temps ; tout autre appel tourne seul, l'un après l'autre.
- **`spawn_agent` appartient au runtime.** L'hôte de scripts l'offre à chaque act ; le nommer dans `.tools([...])`, ou
  dans `act({ tools })`, lève `UnknownToolError`. Un enfant tourne sous le plus strict de son mode et de celui de son
  lanceur ; les enfants de ce projet n'en nomment aucun.
- **Les outils d'intelligence du code sont fixés par un contrat.** Chaque nom d'outil et chaque champ qu'utilisent
  les adaptateurs a été relevé sur des appels réels, et `shared/domain/code-intel-contract.ts` et son test les fixent.
- **L'index n'a pas besoin d'une liste de langages.** `index_codebase` puis `codebase_map` fonctionnent de bout en
  bout, les langages étant détectés sans être nommés.
- **Un budget arrête `act` par une erreur typée.** Un budget `toolCalls` arrête `act` par une
  `BudgetExhaustedException` typée.

Chaque point d'entrée est donc sa propre racine de composition : il construit les adaptateurs dont il a besoin et les
remet à un cas d'usage qui reçoit ses dépendances en paramètres. Les ports sont des interfaces, effacées de chaque
bundle, et un test importe un cas d'usage dans Node sans toucher à une globale du runtime.

## Le VFS et la plateforme hôte

Tout chemin que le code ou le modèle écrit est virtuel : le runtime le fait correspondre au disque, et les règles
sont celles du runtime (le `FileSystemRegistry` d'Orkeon, `ShellCommandTool` et ses sessions shell), pas celles de ce
projet. Ce qui suit est le contrat sur lequel le code et les prompts s'appuient ; `src/shared/domain/vfs.ts` nomme le
seul mount dans lequel ils travaillent.

### Le contrat du runtime

- **Les mounts viennent du lanceur.** `orkeon-code` et `orkeon-code.ps1` démarrent le REPL avec un
  `--mount <physique>:<virtuel>:<droits>` par racine : `/workspace` (le projet, en lecture-écriture), `/output`,
  `/tmp`, `/user-config` (lecture seule), `/sessions`, `/session-history` (lecture seule) et `/memory`. Le modèle ne
  voit jamais un chemin physique, sur aucune plateforme : un `C:\proj\src\a.ts` ou un `/home/u/proj/src/a.ts` donné à
  un outil fichier est refusé avec la liste des mounts, et les prompts écrivent un fichier du projet
  `/workspace/<path>`.
- **Un chemin virtuel se résout par son plus long préfixe de mount**, comparé de façon ordinale : `/Workspace/x` ne
  correspond à rien, sous Windows aussi.
  - Un chemin relatif se résout sous la racine de travail de l'agent (`/workspace`, ou le worktree d'un batch de
    `/dev-batches`).
  - Après le mount, `/` et `\` sont tous deux acceptés par les outils fichiers.
  - Le reste est ajouté à la base physique du mount et normalisé par l'hôte, donc `\` est un séparateur sous Windows
    et un simple caractère ailleurs.
  - Un segment `.` ou `..` est refusé pour une racine de travail et détecté comme une traversée ailleurs.
  - Le contrôle de confinement ignore la casse sous Windows seulement.
  - Du physique au virtuel, un chemin sous un mount revient en `/<mount>/…` avec chaque `\` changé en `/`.
- **Le shell ne lance aucun shell sous Windows.** Sous Linux et macOS, `shell_command` alimente un `sh -s` par
  exécution, chaque mot cité pour que le shell n'étende rien.
  - Sous Windows chaque commande est son propre processus dans un Job Object, lancé avec ses arguments cités un à un
    : l'exécutable est cherché sur le `PATH` seulement, jamais dans le dossier de travail, en `.exe` puis `.com`.
  - Un `.bat` ou `.cmd` (donc `npm`, `npx`) ne tourne qu'en session non confinée, via `cmd.exe`.
  - Un builtin de cmd (`echo`, `dir`, `type`, `cd`, `copy`, `del`, `mkdir`, `set`...) passe par `cmd.exe /d /v:off
    /s /c` avec chaque argument échappé, et `%` refusé.
  - PowerShell n'intervient jamais.
- **Les opérateurs sont refusés partout** : `|`, `;`, `&&`, `>`, `$(`, les backticks et les sauts de ligne font
  échouer l'appel avant toute exécution, donc aucune commande d'un crew ne pipe ni n'enchaîne. L'allowlist par défaut
  est `ls`, `cat`, `pwd`, `which`, `grep`, `wc`, `echo`, un `git` en lecture seule, et `dir`, `type`, `where` ; sous
  Windows les noms POSIX n'existent que s'ils sont installés et sur le `PATH`. `node`, `dotnet`, `npm`, `find` et le
  `git` qui écrit demandent `Orkeon:Tools:Shell:AllowInterpreters`, que les settings d'exemple activent.
- **Le shell réécrit les chemins d'une ligne de commande.** Un argument égal à un mount ou commençant par
  `<mount>/`, aussi après un `clé=`, devient son chemin physique avant le lancement du processus, et demande Read
  pour une commande en lecture seule, tous les droits pour toute autre.
  - Seul `/` est accepté ici : `/workspace\src` est passé tel quel.
  - Stdout et stderr sont réécrits du physique au virtuel, `\` changé en `/` sur le reste du chemin, par une
    comparaison ordinale : un outil qui change la casse d'un chemin (`c:\Proj\…`) échappe à la réécriture et le
    modèle lit un chemin disque.
  - Un chemin relatif qu'une commande imprime (`src\a.ts` depuis `dir`) garde ses `\`.
- **Le confinement suit la plateforme** (`Orkeon:Tools:Shell:Confinement`, `Auto`) : bubblewrap sous Linux, où le
  processus voit les mounts à leurs chemins virtuels ; Seatbelt sous macOS et un AppContainer sous Windows 10 et
  suivants, où il travaille sur des chemins physiques. Sous l'AppContainer, `TEMP`, `TMP` et `HOME` pointent dans le
  profil du conteneur, le profil de l'utilisateur et les autres disques sont hors de portée, et un programme installé
  sous le profil de l'utilisateur est atteint via `ReadOnlyPaths`. Dans un conteneur il n'y a aucun confinement. Les
  noms de variables d'environnement se comparent sans casse sous Windows.
- **Windows n'est pas le chemin que ce projet exerce.** `orkeon-code.ps1` n'a que les modes `tool` et `docker`, pas
  de mode source ni de `--demo` ; le chemin vérifié est WSL avec le lanceur bash ([tutoriel](wsl-tutorial.md)).
  Lancé en natif, `/status` affiche la plateforme comme indisponible quand `node` est absent ou non autorisé, et une
  commande qu'un crew compose avec un opérateur ou un nom POSIX non installé échoue avant de tourner.

### La couche propre à Orkeon Code

Ce qui suit est la couche propre de ce projet sur ce contrat (`src/shared/domain/host-layout.ts`, `host-paths.ts`,
`agent-policy/path-rules.ts`, `src/shared/application/host-context.ts` ; [ADR 0022](../adr/0022-host-path-spellings.md),
en anglais) : quoi que le runtime réécrive, les écritures propres du disque reviennent au code et au modèle dans ce
qu'un programme imprime, dans ce que l'utilisateur tape et dans ce que le modèle écrit.

- **Une seule écriture canonique.** Toute écriture d'un chemin physique d'un mount est ramenée au chemin virtuel
  avec des `/` et sans séparateur final, d'après les bases que l'hôte déclare : `C:\proj\src\a.ts`,
  `C:/proj/src/a.ts`, `c:\Proj\…` (la casse d'un lecteur est ignorée), `\\?\C:\…`, un partage UNC
  (`\\server\share\…`, `//server/share/…`), `/mnt/<d>/…` sous WSL, `\\wsl$\<distro>\…` et
  `\\wsl.localhost\<distro>\…` pour la distribution où tourne la session, et un `\` après le mount quand l'hôte
  n'est pas posix.
  - Une base se compare segment par segment : `/workspaces/x` ne correspond jamais à `/workspace`, `mon repertoireX`
    jamais à `mon repertoire`.
  - Laissés tels quels : un chemin relatif, un `.` ou `..`, un chemin sous aucun mount ou d'une autre distribution,
    `/mnt/c` sur un hôte posix ou Windows, `C:` sur un hôte posix, `%VAR%`, `~`.
  - Dans un texte libre, un chemin court jusqu'au guillemet fermant après un guillemet ouvrant, sinon jusqu'au
    premier délimiteur (un blanc, un guillemet, une parenthèse, `,` `:` `;` `|`, un point qui termine une phrase),
    un chemin Windows continuant par-delà un espace tant que le mot suivant porte encore un `\`.
  - Sur un hôte posix sans base Windows, chaque fonction est l'identité.
- **L'hôte vient de `/user-config/launch.json`**, que les deux lanceurs écrivent à chaque démarrage à côté de
  `config.json` : `version` (1), `flavour` (`posix`, `wsl` ou `windows`), `mode`, sous WSL `wsl.distro` et
  `wsl.automountRoot` (`WSL_DISTRO_NAME` ou le partage de `wslpath -w /` ; `wslpath -u 'C:\'` ou le `[automount]
  root=` de `/etc/wsl.conf`, sinon `/mnt`), et `mounts`, chacun avec la chaîne même donnée à `--mount` comme `posix`
  et, sous WSL, son écriture Windows par `wslpath -w` (`null` sans `wslpath`, avec un avertissement : le code dérive
  alors lui-même `D:\x` de `/mnt/d/x`).
  - Le mode docker écrit un hôte posix sans mount : l'hôte y est caché à dessein.
  - Absent, malformé ou d'une autre version, le fichier donne l'identité, et la ligne `host: paths` de `/doctor` le
    dit.
  - La disposition et les listes de chemins sont lues une fois par exécution, par un module d'infrastructure que
    chaque point d'entrée lie aux globaux du runtime.
  - Un changement s'applique au démarrage suivant, et un adaptateur chargé seul (un test) trouve l'identité.
- **Où les écritures sont ramenées.** En entrée, avant le runtime : les adaptateurs fichiers, shell et jobs shell
  canonisent le chemin ou les mots de la commande qu'on leur donne.
  - Le prompt tapé est canonisé, ses blocs de code conservés.
  - Et `hostCallbacks` (`src/shared/application/dev/tool-callbacks.ts`), la couche la plus externe des callbacks de
    chaque act (`createLlm` les enveloppe, avec ou sans callbacks propres au crew), réécrit dans un appel du modèle
    `path`, `root_path`, `working_directory`, `paths`, le `path` de chaque opération d'un `edit_batch` et les mots
    d'un `shell_command`, en un `{ input }` que la garde du runtime juge ensuite.
  - Le contenu d'un fichier, les chaînes d'une édition et un motif ne sont jamais touchés.
  - En sortie : stdout et stderr, la racine qu'imprime un `git rev-parse` (`C:/…` par git pour Windows), le message
    d'un appel fichier échoué, et le texte que le modèle lit de chaque résultat d'outil (`{ context }` le remplace
    quand une écriture a changé).
  - Les callbacks internes (ceux d'un crew de dev, la trace, les hooks post-outil) voient l'appel canonique et le
    résultat canonique.
- **Orkeon Code n'écrit jamais un chemin physique pour le runtime.** Le runtime vérifie chaque mot d'une commande
  préfixé d'un mount contre les droits du VFS avant de l'écrire pour le processus, et demande tous les droits pour
  une commande hors de son allowlist en lecture seule : un `C:\…` écrit par ce projet contournerait ce contrôle.
  - Sous Windows natif le runtime écrit `/workspace/…` pour le processus.
  - Sous WSL, un programme Windows (`cmd.exe`, un `dotnet.exe` Windows, joignable sans confinement seulement) reçoit
    `/mnt/c/…` tant que le runtime ne connaît pas l'écriture Windows d'un mount, une issue laissée à Orkeon.
  - Ce qu'il imprime revient canonique dans tous les cas.
- **Les listes de chemins** `paths.deny` et `paths.allow` ([permissions](permissions.md#règles)) se comparent sur
  l'écriture canonique, donc une écriture physique, ou une autre casse sur un disque Windows et sous un lecteur de
  WSL, atteint la même règle : la garde reçoit des règles deny sur l'écriture canonique, listées par `/permissions`,
  et les callbacks refusent chaque appel que les listes couvrent, dans n'importe quelle écriture, avant les
  callbacks propres du crew.
  - Des règles deny intégrées ferment tout le mount `/user-config` aux outils du modèle, les bases physiques de
    `launch.json` et les réglages de l'utilisateur dedans.
  - Le code le lit par le port Files, que la garde ne voit pas.
- **La garde juge l'entrée canonique.** `onToolCall` tourne avant la garde (ADR 0023) : un appel du
  modèle écrit `C:\…` sur un outil à chemin est d'abord converti, et la garde juge une fois l'entrée canonique. Une
  commande shell est jugée par la garde sur son texte et par les callbacks sur ses chemins canoniques ; chaque
  résultat est canonique. Les issues du runtime que l'ADR 0022 laissait ouvertes sont fermées à l'épingle.

## Couches et règle de dépendance

| Couche | Où | Contient | Importe |
|---|---|---|---|
| domaine | `src/shared/domain/`, `src/crews/<name>/domain/` | Types et fonctions purs : règles, texte des prompts, analyse syntaxique, rendu | le domaine seulement |
| application | `src/shared/application/`, `src/crews/<name>/application/` | Cas d'usage et services au-dessus des ports (`ports.ts`, qui réexporte `ports/<concern>.ts`) | domaine, application |
| infrastructure | `src/shared/infrastructure/` | `globals.ts`, les adaptateurs Orkeon des ports, `wiring.ts` | tout ce qui est plus intérieur |
| cas d'usage des commandes | `src/commands/_lib/` | Les cas d'usage dans un dossier par famille de commandes (`dev/`, `git/`, `settings/`...), `run<Name>(tokens, deps)` → une vue au-dessus des ports qu'on lui remet ; à la racine, les utilitaires que les familles partagent | tout sauf `shared/infrastructure/` |
| points d'entrée | `src/commands/<group>/*.cmd.ts`, `src/crews/<name>/crew.ork.ts` | Analysent l'entrée, câblent les adaptateurs, appellent un cas d'usage, rendent | tout |

### Ce que contrôle le test d'architecture

`tests/repository/architecture.test.ts` analyse chaque import de `src/` et des tests qui en sont le miroir sous `tests/`
(statique, réexport, de type seul et dynamique) et échoue sur tout import qui enfreint l'une de ces règles ; il n'y a
pas de liste d'exceptions. Un test du miroir est jugé là où se tient son module : `tests/<path>/<m>.test.ts` garde la
couche et le groupe de `commands/_lib/` de `src/<path>/<m>.ts`, si bien que le test d'un module du domaine est un
test du domaine. Les règles :

- un fichier sous `domain/` n'importe que des fichiers du domaine ;
- un fichier sous `application/` n'importe que des fichiers du domaine et de l'application (ses tests peuvent
  importer `tests/` en plus) : une liste d'autorisations, si bien qu'un fichier hors de toute couche est refusé
  comme `infrastructure/` l'est ;
- un fichier sous `domain/` ou `application/` n'importe jamais `commands/` ni un point d'entrée (`*.cmd.ts`,
  `crew.ork.ts`, `probe.ork.ts`) ;
- seuls `shared/infrastructure/` et les points d'entrée des crews (`crew.ork.ts`, `probe.ork.ts`, qui ont besoin des
  builders et d'`inputs()`) importent `globals.ts` : une commande atteint le runtime par les adaptateurs de
  `orkeon/wiring.ts` ;
- `commands/_lib/` n'importe jamais `shared/infrastructure/` : le point d'entrée construit les adaptateurs et les
  remet, de sorte qu'un test importe les cas d'usage au-dessus des fakes ;
- un `*.cmd.ts` n'importe jamais `crews/*/domain` ni `crews/*/application` : ce qu'il lance d'un crew passe par un
  cas d'usage de `commands/_lib/` ;
- un cas d'usage de `commands/_lib/<groupe>/` n'importe que son propre groupe ou la racine de `_lib/`, et un
  `*.cmd.ts` appelle le groupe de son propre dossier ;
- `ports.ts` réexporte chaque fichier de `application/ports/`, et chaque nom qu'il exporte ;
- un import relatif nomme son fichier `.ts`, et le code du runtime n'importe rien d'autre que des fichiers relatifs
  (les tests peuvent importer les modules intégrés `node:`) ;
- le code du runtime n'importe jamais `tests/` : les doublures de test ne sont jamais bundlées ;
- un contrôle partagé de `tests/support/assertions/` n'importe que des modules intégrés `node:`, de sorte qu'un test
  de n'importe quelle couche, un test du domaine compris, peut l'importer ;
- aucun cycle d'imports entre fichiers ;
- un `<module>[.<facet>].fixtures.ts` ou `.assertions.ts` n'est importé que par les fichiers de son module (même
  dossier, le nom jusqu'au premier point) : ce que plusieurs modules partagent va sous `tests/support/`.

Le même test lit les globales du runtime avec la résolution de portée de TypeScript lui-même, fichier par fichier : un
identifiant que son fichier ne déclare, n'importe ni ne lie, un `globalThis.<name>` et une redéclaration ambiante
(`declare const tools`) sont des usages d'une globale. `src/crews/.orkeon/orkeon.d.ts` déclare les globales du runtime
pour chaque fichier, si bien que le contrôle de types seul laisserait n'importe quel module appeler
`tools.shellCommand(...)` :

- pas de `require()` : les sources sont des modules ES bundlés par esbuild ;
- seuls `shared/infrastructure/` et les points d'entrée des crews lisent `tools`, `agentBuilder`, `crewBuilder`,
  `toolBuilder`, `rag` et `inputs` ;
- seul un `*.cmd.ts` appelle `defineCommand` ou `defineAsyncCommand` : une commande à bascule enregistre le
  descripteur que `_lib/settings/session-config.ts` construit (`defineCommand(toggleCommand(spec, session))`).

Il place aussi chaque fichier et chaque lecture de l'horloge : un fichier du runtime sous `src/` est dans un dossier
de couche, ou bien c'est un point d'entrée, un cas d'usage de commande de `commands/_lib/` ou une déclaration
(`.d.ts`) ; une lecture de l'horloge (`new Date()` sans argument, `Date()`, `Date.now()`) est dans
`shared/infrastructure/`, et le reste de `src/` prend le port `Clock`.

```text
src/
├── commands/          50 *.cmd.ts (parse, wire, render) in eight functional folders: session, settings, status,
│   │                  project, git, dev, memory, speech
│   ├── _lib/          the use cases, in the folder of their commands: run<Name>(tokens, deps) → CommandView,
│   │                  or dispatch<Name>(tokens, deps) → a ticket or a message when the command launches a
│   │                  crew, and their pure helpers. dev/ (dev, dev-batches, dev-implement, dev-source),
│   │                  git/ (branch, commit, diff, review), memory/ (memory, memory-admit), session/ (export,
│   │                  resume, tasks), settings/ (advisor, agents, config, hooks, mode, model, permissions,
│   │                  session-config: the toggle commands, skills), speech/ (say, transcribe, voice),
│   │                  status/ (cache, doctor, meta: version; messages: release notes, status). At the root, what
│   │                  several families share: args.ts (arguments), dispatch.ts (crew launch, completion
│   │                  line, main-loop launch), dev-step.ts, effort.ts, pr-context.ts, view.ts (CommandView,
│   │                  showView)
│   └── .orkeon/       orkeon-cli.d.ts (generated: npm run typings)
├── crews/<name>/      crew.ork.ts (wiring) + application/ (run-<crew>.ts, the use case) + domain/
│   └── .orkeon/       orkeon.d.ts (generated)
└── shared/
    ├── domain/        pure: types, agent-policy/ (permission modes and catalogue, rule sets, behaviour flags,
    │                  output styles, memory categories), dev/ (repository pack, work folder, harness
    │                  formats), agents/ (sub-agent charters), shared-memory/ (memory entries, verdict
    │                  rows, refused motifs), compaction, config schema, session keys...
    ├── application/   ports/ (one file of ports per concern: shell, files, session, llm...),
    │                  ports.ts (re-exports them), and the services over them: session-io,
    │                  config-store, session-state, json-file, attached-skills, permission-rules,
    │                  extra-tools, compaction/, dev/, agents/
    └── infrastructure/ globals.ts (the only access to the runtime globals)
        └── orkeon/    the adapters of the ports, tool-results.ts (field casing),
                       runtime-tools.ts (the tool inputs), wiring.ts
tests/
├── crews/             the tests of src/, mirroring it: src/<path>/<m>.ts is tested by tests/<path>/<m>.test.ts,
├── shared/            its <m>.fixtures.ts and <m>.assertions.ts beside it; src/ holds runtime code only
├── commands/
├── support/           what several test files share, never imported by runtime code:
│   ├── doubles/       the test doubles (Fake*), one per port
│   ├── fixtures/      the sample data shared across test files (prompt-catalogue, memory-entries)
│   └── assertions/    the checks shared across test files
├── fixtures/          the texts that are files of their own (a sheet, a plan, a YAML)
├── repository/        the rules of the repository as a whole: architecture, test-shape, command-surface,
│                      prompt-contract, version, shared-memory-fixture
├── scripts/           the scripts of scripts/ and the launchers: dev-run, session-start-script, docs-parity,
│                      install, launcher
└── config/            the example settings
mcp/whisper/           the speech MCP server, Python run by uv: whisper_mcp.py, tests/, samples/, smoke.py
```

### Où vivent les tests

Les tests de `src/` en sont le miroir sous `tests/` : `src/<path>/<m>.ts` est testé par `tests/<path>/<m>.test.ts`,
ses `.fixtures.ts` et `.assertions.ts` à côté du test ; les points d'entrée ne contiennent aucune logique qui vaille un test unitaire et sont couverts par la vérification de bundle et le smoke du
runtime. `tests/repository/test-shape.test.ts` tient chaque test à sa forme, lue dans l'arbre syntaxique :

- chaque test suit Arrange, Act, Assert, un seul acte par test ;
- le code de test ne lit pas l'horloge et ne lance pas de minuterie (`setTimeout`, `setInterval`, `setImmediate`) : il prend un
  `FakeClock`, sauf dans `tests/scripts/`, qui pilote de vrais processus ;
- une doublure vit dans `tests/support/doubles/` et nulle part ailleurs : pas de classe qui étend un `Fake…` ou
  implémente un port (les ports sont lus dans les exports de `ports/`), pas d'objet littéral typé par un port, pas
  de méthode d'un fake remplacée sur une instance ; ce qu'un fake ne sait pas encore jouer devient un nouveau champ
  de ce fake ;
- `src/` ne contient aucun fichier de test, de fixtures ni d'assertions, et chacun de ceux du miroir a son
  `<module>.ts` au même chemin dans `src/`, un second fichier de test du module étant `<module>.<facet>.test.ts`.

## Ports et adaptateurs

Un port (`src/shared/application/ports/<concern>.ts`, réexporté par `ports.ts`) est nommé d'après ce dont l'application a besoin, pas d'après l'appel du
runtime qui le fournit. Son adaptateur est le seul code qui appelle le runtime pour lui et le seul code qui lit les
résultats du runtime, dont la casse des champs varie (`messages` ou `Messages`) : un port rend des valeurs simples,
sauf les deux appels qui montrent un résultat brut à dessein (`MemoryStore.get`, `ToolCatalogue.call`). Un appelant
qui lit le texte d'un outil passe par `ToolCatalogue.callText` : l'adaptateur décode le résultat (`tool-results.ts`) et
rend le texte, ou le message d'échec propre à l'outil sans l'enrobage du runtime, et ne lève jamais.

| Port | À quoi il sert | Adaptateur (`src/shared/infrastructure/orkeon/`) | Fake (`tests/support/doubles/`) |
|---|---|---|---|
| `Shell` | Les commandes shell dans `/workspace` (`shell_command`) | `shell.ts` | `fake-shell.ts` |
| `ShellJobs` | Une commande longue lancée détachée, son état, la fin de son journal, et une attente entre deux regards (`shell_command` `start_job`, `job_status`, `job_tail`) | `shell-jobs.ts` | `fake-shell-jobs.ts` |
| `SharedMemory` | L'index RAG de la [mémoire partagée](shared-memory.md) : chercher dans une collection, indexer avec élagage (l'espace `rag`, sinon `rag_search`, `rag_ingest`) | `shared-memory.ts` | `fake-shared-memory.ts` |
| `DecisionModel` | Le modèle de décision du runtime, auquel on pose des questions typées sur un état : une option parmi des options décrites, un niveau sur une échelle, la probabilité d'un oui | `decision-model.ts` | `fake-decision-model.ts` |
| `ChildRuntime` | Les enfants d'une exécution de crew : en lancer un en arrière-plan, lister, arrêter, lire ce qu'il a laissé (`ctx.spawnBackground`, `instances()`/`stop()` du crew, sa mémoire) | `child-agents.ts` | `fake-child-runtime.ts` |
| `HumanInput` | Une question à la personne : un choix, un texte, une sélection multiple ; personne ne répondant est une réponse en soi (`human_input`) | `human-input.ts` | `fake-human-input.ts` |
| `Chooser` | Un panneau dans la console : une option parmi plusieurs, avec un réglage facultatif sur les flèches latérales ; `interactive` dit si un panneau peut s'ouvrir (`ctx.prompt`, `ctx.interactive`) | `chooser.ts` | `fake-chooser.ts` |
| `ReasoningReader` | Ce qu'un modèle de l'hôte prend pour le raisonnement et ce que devient un effort demandé, tels que le runtime les juge (l'espace `llm` : `capabilities`, `reasoning` ; un profil nommé n'est pas lu, Orkeon n'en donne aucune lecture sûre) | `reasoning.ts` | `fake-reasoning-reader.ts` |
| `ThemeConsole` | La palette de la console pour la session (`ctx.theme`, `ctx.setTheme`) | le contexte de commande lui-même | `fake-theme-console.ts` |
| `Files` | Lire, écrire et lister par chemin virtuel, les montages du VFS (`file_read`, `file_write`, `directory_read`, `list_mounts`) | `files.ts` | `fake-files.ts` |
| `Progress` | La ligne de progression du runtime, au mieux (`progress_report`) | `progress.ts` | `fake-progress.ts` |
| `SessionStore` | Le tampon de conversation, le sac d'état, le titre, la coupe, le budget de tokens par sorte (`session_store`, `session_snip`, `token_budget`) | `session-store.ts` | `fake-session-store.ts` |
| `SessionSwitch` | La session enregistrée maintenant, une session gardée chargée sur place (le service `session`) | `session-switch.ts` | `fake-session-switch.ts` |
| `RuntimeInfoReader` | Le runtime qui exécute la commande : version, commit, canal (le service `runtime`) | `runtime-info.ts` | `fake-runtime-info.ts` |
| `UsageReader` | L'usage LLM de la session, en tout, par modèle et par commande (le service `usage`) | `usage.ts` | `fake-usage-reader.ts` |
| `Telemetry` | Les métadonnées, le coût et les statistiques de la session (`session_store`, `session_cost`, `session_stats`) | `telemetry.ts` | `fake-telemetry.ts` |
| `MemoryStore` | La mémoire typée : lister, ajouter, lire, retirer, remplacer en place (`memory_store`) | `memory-store.ts` | `fake-memory-store.ts` |
| `ToolCatalogue` | Les outils enregistrés sous leurs noms d'enregistrement, trouvés sans tenir compte de la casse comme Orkeon les trouve, pour les diagnostics et la vérification des outils supplémentaires (le service `tools` de `ctx.services` pour les noms, l'espace de noms `tools` pour les appels : `call` brut, `callText` décodé) | `tool-catalogue.ts` | `fake-tool-catalogue.ts` |
| `CodeIndex` | L'index du code tel que `/analyze` le récolte et que `/init` en lit la carte des paquets (`index_status`, `index_codebase`, `codebase_map`, `dependency_graph`, `package_summary`) | `code-index.ts` | `fake-code-index.ts` |
| `CostIndex` | Le coût d'accès que `/dev-batches` mesure : les racines indexées, le rafraîchissement des fichiers du lot, le rapport (`index_status`, `incremental_reindex`, `access_cost`) | `code-index.ts` | `fake-cost-index.ts` |
| `CrewHost` | Lister et lancer des crews (le service `script-host`, `ctx.services`) | `crew-host.ts` | `fake-crew-host.ts` |
| `PermissionRules` | Les règles de session de la garde de permission du runtime : ajouter, effacer, lister (le service `permissions`, `ctx.services`) | `permission-rules.ts` | `fake-permission-rules.ts` |
| `Llm` | Le modèle : `act` (la boucle d'outils), `complete`, `extract` (`ctx.llm` de l'agent en cours), `effortSent` (ce qu'un act envoie pour son effort, `ctx.llm.reasoning`) ; un `act` ou un `complete` qui échoue lève une `LlmFailure` | `llm.ts` | `fake-llm.ts` |
| `RunState` | L'état propre de l'agent en cours, pour une exécution de crew (`ctx.state`) | `run-state.ts` | `fake-run-state.ts` |
| `CrewMemory` | La mémoire clé/valeur du crew en cours, partagée par ses agents le temps d'une exécution (`ctx.memory.crew`) | `crew-memory.ts` | `fake-crew-memory.ts` |
| `Clock` | L'heure courante (`ports/clock.ts`), la seule lecture de l'horloge hors de `shared/infrastructure/` | `wiring.ts` (`orkeonClock()`) | `fake-clock.ts` |
| `Logger` | Le log de la commande ou du crew | aucun : `ctx.log` est passé tel quel | `fake-logger.ts` |

Ce que le tableau laisse de côté :

- **`DecisionModel`**, à quoi il sert :
  - Pas de modèle, un appel en échec et une réponse illisible valent tous `null`, et l'appelant fait alors ce qu'il
    faisait sans modèle (`system_one_decide`, enregistré quand les réglages configurent un fournisseur de décision,
    quel qu'il soit).

### Câblage

- `wiring.ts` lie les adaptateurs qui lisent la globale `tools` (`orkeonShell()`, `orkeonFiles()`,
  `orkeonProgress()`, `orkeonTelemetry()`, `orkeonMemoryStore()`, `orkeonCodeIndex()`, `orkeonDecisionModel()`,
  `orkeonToolCalls()`, les appels d'un crew par un nom que sa commande a trouvé, et
  `orkeonToolCatalogue(ctx.services)`, qu'un handler construit, puisque les noms enregistrés viennent de son
  contexte) et les services bâtis sur eux (`orkeonConfigStore()`, `orkeonSessionIo()`).
- Les adaptateurs de ce que le contexte transporte sont construits par le point d'entrée à partir du contexte qu'il
  reçoit : `createLlm(ctx.llm)`, `createRunState(ctx)`, `createCrewMemory(ctx)`, `createCrewHost(ctx.services)` et
  `createPermissionRules(ctx.services)` (une commande async remet les deux derniers à `launchCrew` ou
  `launchMainLoop` avec son log).
- Chaque adaptateur prend l'objet du runtime en paramètre, si bien que son propre test l'exécute au-dessus d'un
  substitut : `fake-tools.ts` (la globale `tools`), `fake-llm-facade.ts` (`ctx.llm`), `fake-agent-context.ts`
  (`ctx.state`, `ctx.memory`), `fake-script-host.ts` (le service script-host), `fake-permissions-facade.ts` (le
  service permissions).
- `orkeonClock()` est l'horloge du code exécuté : un point d'entrée la remet à ce qui date un enregistrement ou
  mesure une attente, là où un test remet une `FakeClock`.
- `orkeonCompactionDeps(ctx, ports, clock)` rassemble les ports du pipeline de compaction, pour `/compact` comme
  pour la compaction automatique de la boucle principale.

### Les services

Les services (`src/shared/application/`) sont bâtis au-dessus des ports et partagés par les commandes et les
crews : `session-io.ts` (le tampon plus le mode de permission dans lequel une session tourne), `config-store.ts`
(`/config` : le fichier de settings surchargé par le sac d'état), `session-state.ts` (des valeurs JSON dans le sac
d'état), `json-file.ts` (des fichiers JSON, protégés contre un contenu invalide), `attached-skills.ts` (le registre de
`/skills` avec le contenu de chaque fichier), `permission-rules.ts` (les règles de la session et leur synchronisation
avec la garde du runtime), `extra-tools.ts` (le réglage `tools.extra` confronté aux outils enregistrés) et
`compaction/` (le pipeline de compaction).

### Les jeux de règles

- Les jeux de règles (`src/shared/domain/agent-policy/rule-sets.ts`) sont des règles deny qu'Orkeon Code livre comme
  données, dans la syntaxe de `/permissions` : `git-readonly`, `inline-interpreters`, `read-noise`, `secrets`,
  `state-files`.
- `src/shared/domain/dev/step-rules.ts` dit quelle étape dev détient quels jeux.
- La commande de l'étape vérifie que la garde du runtime est active, puis `syncStepRules` (`permission-rules.ts`)
  remet à la garde les règles de la session suivies de celles de l'étape, sans ranger ces dernières.
- Le prochain tour `/assistant` ne lui remet que les règles de la session.
- La fonction pure `matchesRule`, à côté de l'analyseur de règles, reproduit la façon dont la garde lit une règle.
- Les tests s'en servent, et s'en serviront plus tard les outils qu'Orkeon Code enveloppe autour d'un outil intégré,
  dont la garde ne voit pas les propres appels.

## Points d'entrée

**Une commande** analyse ses arguments, appelle son cas d'usage avec les adaptateurs, et affiche la vue qu'elle reçoit
en retour. Le cas d'usage vit dans `commands/_lib/`, prend les ports qu'il lit (un `Pick<>` d'entre eux) et rend une
`CommandView` : un tableau et un message de clôture. `/mode` :

```ts
/// <reference path="../.orkeon/orkeon-cli.d.ts" />
import { rawTokens } from "../_lib/args.ts";
import { runMode } from "../_lib/settings/mode.ts";
import { showView } from "../_lib/view.ts";
import { orkeonChooser, orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "mode",
  description: "Choose, show or set the session-default permission mode of the assistant.",
  handler: async (args, ctx) =>
    showView(ctx, await runMode(rawTokens(args), { session, log: ctx.log, chooser: orkeonChooser(ctx) })),
});
```

- Un cas d'usage dont la commande écrit sa propre sortie (`/diff`) la place dans les `lines` de la vue et, pour un
  diff unifié, dans son `diff`, un bloc typé que la console colore : les deux sont écrits avant le tableau et le
  message.
- Une commande qui propose un choix prend le port `Chooser` : sans argument, dans une console interactive, elle
  ouvre un panneau (`/model`, `/effort`, `/output-style`, `/mode`, `/theme`) et, sur un rejeu ou une console simple,
  garde son comportement en texte.
- Une commande async lance un crew à la place : `dispatch` rend `launchCrew({ crews: createCrewHost(ctx.services),
  log: ctx.log }, "<crew>", input)` (le ticket, de `_lib/dispatch.ts`) et `completed` imprime le résultat avec
  `writeCompleted`, sous forme d'un bloc markdown que la console rend, un échec restant une ligne simple.
- Ce qu'un programme a écrit sans modèle (`/transcribe`, `/say`, `/memory admit`) passe par `writePlainCompleted`,
  en ligne.

**Un crew** construit ses agents, câble les adaptateurs à la portée module, construit ceux liés au contexte dans le
corps de l'agent, et appelle son cas d'usage `application/run-<crew>.ts`, qui prend son entrée et ses ports.
`/analyze` :

```ts
import { AgentBuilder, CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import { orkeonCodeIndex, orkeonProgress } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { runAnalyze } from "./application/run-analyze.ts";

const ports = { index: orkeonCodeIndex(), progress: orkeonProgress() };

const analyst = AgentBuilder()
  .name("analyst")
  .tools([])
  .body(async (_input: any, ctx: any) =>
    await runAnalyze(inputs(), { ...ports, llm: createLlm(ctx.llm), log: ctx.log }))
  .build();

publishCrew(CrewBuilder().name("analyze").process("sequential").withAgent(analyst).build());
```

## D'une commande à un crew

```text
/assistant fix the parser
  └─ assistant.cmd.ts         defineAsyncCommand: parses the "mode:" prefix; launchMainLoop resolves the
       │                      session's mode, checks tools.extra, hands the rules to the gate
       └─ script-host.runCrewAsync("main-loop", { prompt, permissionMode, permissionModeVia,
                                                  permissionRules, extraTools, prelude?, epilogue? })
            └─ /crews/main-loop/crew.ork.ts   (the first --crews-dir holding <name>/crew.ork.ts)
                 └─ agent .body(): one turn of the loop (below)
       ◀─ ticket; the REPL prints the result when the crew completes
```

- Une **commande synchrone** (`defineCommand`) répond aussitôt : settings, état de session, vues git.
- Une **commande async** (`defineAsyncCommand`) lance un crew par le service `script-host` : `runCrewAsync` rend un
  ticket aussitôt, `runCrew` attend (de façon bornée). Les crews sont trouvés par nom sous les dossiers donnés avec
  `--crews-dir` ; un nom contenant `/`, `\` ou `..` est refusé.
- Commandes et crews partagent du code par des imports relatifs (`src/shared`, le `domain/` d'un crew) : le runtime
  bundle chaque point d'entrée en un seul script avant de l'exécuter.

## Crews

| Crew | Processus | Lancé par | Ce qu'il fait |
|---|---|---|---|
| `main-loop` | autonome, budget 200 appels d'outils / 1800 s / 700k tokens de contexte (le contexte compté une fois) | `/assistant`, le texte libre, `/summary`, `/verify`, `/transcribe --then`, `/voice send` et `--go` | La boucle interactive |
| `project-init` | séquentiel, sans outil (l'index lu par le port `CodeIndex`) | `/init` | Parcourt l'arborescence, détecte les conventions, lit la carte des paquets quand un index existe, écrit le fichier d'instructions (une proposition à côté quand un fichier existant a été coupé) |
| `git-commit` | séquentiel | `/commit` | Rédige un commit conventionnel à partir du diff, commite après confirmation |
| `code-review` | séquentiel | `/review` (`--lens` pour un seul angle, `--passes` pour les tours de ce lancement ; les alias `/security-review` et `/passes`) | Revue multi-angles des changements indexés, constats classés |
| `analyze` | séquentiel | `/analyze` | Index, carte des paquets, graphe des modules, chaque paquet lu pour ses dépendances et ses modules d'entrée (un paquet dont seuls ses tests dépendent reste une entrée), résumé des paquets d'entrée et des plus gros, puis une synthèse (`--raw` saute le LLM) |
| `session-compact` | séquentiel | `/compact` (`--snip` pour tronquer seulement), la compaction automatique | Sauve les faits durables en mémoire typée, puis résume le tampon entier à sa place ; `--snip`, ou un résumé qui échoue, coupe seulement aux derniers tours entiers, avec un marqueur |
| `init-verifiers` | séquentiel, sans outil | `/init-verifiers` | Détecte l'outillage de test à partir de chaque manifeste, écrit des guides de vérification pour les zones non couvertes |
| `advisor` | séquentiel, sans outil | `/advisor` | Un second avis sur la dernière réponse, par un autre modèle |
| `speech` | séquentiel, sans outil, sans LLM | `/transcribe`, `/voice`, `/say` | Un appel au serveur MCP de parole (`transcribe_audio`, `list_audio`, `record_and_transcribe`, `speak`), au nom de la commande |
| `dev-verify` | séquentiel, la porte et la capture dans `dev-verifier`, l'audit dans un enfant d'arrière-plan `dev-auditor` (sept outils de lecture en `plan`, `run_validation`, `memory_recall`) | `/dev-batches <code> F<n> --audit` (`--gate-only` saute le LLM) | La porte, la capture, un audit en lecture seule, le fichier de verdict |
| `dev-learn` | séquentiel, sans outil, un extract par axe | `/dev-learn` (`--list` saute le LLM) | Les écarts de verdict qui reviennent, changés en propositions, `PROPOSALS.md` |
| `dev-plan` | séquentiel, un extract dans `dev-planner`, la revue dans un enfant d'arrière-plan `dev-reviewer` (dix outils de lecture en `plan`) | `/dev-plan` | Porte des questions Blocking, inventaire par l'index, plan et fiches écrits par le code, une revue en lecture seule |
| `agent-run` | séquentiel, un act d'une charte intégrée (`dev-reviewer`, `dev-auditor`) | `/tasks send`, `/tasks repair` | Un nouveau run d'un enfant fini, son brief portant le rapport précédent et le message de l'opérateur |
| `dev-spec` | séquentiel, des extracts, la revue dans un enfant d'arrière-plan `dev-reviewer` (dix outils de lecture en `plan`) | `/dev-spec` | Spécification métier écrite par le code depuis le JSON, ses questions posées une à une par `human_input`, une revue en lecture seule |
| `dev-change` | séquentiel, des extracts, la revue dans un enfant d'arrière-plan `dev-reviewer` (dix outils de lecture en `plan`) | `/dev-spec <code> <kind>` | Bug reproduit ou coût mesuré en exécutant, fiche de changement écrite par le code, questions par `human_input`, une revue |
| `dev-implement` | séquentiel, un agent, deux rôles en `acceptEdits` (cinq outils de lecture, six d'écriture - `file_write` pour un nouveau fichier, les éditeurs de nœuds et `edit_batch` pour un fichier existant ; la règle d'édition épelle un `edit_batch`, sa liste `operations` et `validate`, et le refus par la garde d'un lot sans opérations le répète ; le runtime publie aussi le schéma des outils de nœud ; chaque `node_replace` d'un lot porte le hash que `node_read` a donné pour ce nœud précis, jamais un hash deviné, un hash factice ayant fait refuser un lot entier par le runtime dans un run live - `run_tests`, `run_build`, `memory_recall`) | `/dev-batches <code> F<n>` (`--close` : la clôture seule) | Chaque cycle (les étapes d'un même fichier de test) rouge puis vert, vérifié par le code, son coût mesuré |
| `dev-batches` | Séquentiel, un agent avec les outils de lecture du relecteur, sa revue en ligne (la revue du prochain lot se voit offrir cinq d'entre eux, `file_read`, `node_outline`, `node_read`, `codebase_search` et `glob`, pour huit tours : son brief porte la fiche, ce que les lots clos ont changé et le plan) | `/dev-batches` (retapée après un arrêt : l'exécution reprend ; chaque saut de sa chaîne garde la profondeur de l'instance pour laquelle il tourne, `chain: "continue"`, si bien qu'un plan de n'importe quelle longueur se clôt en une commande) | Désigne le lot suivant d'un plan dans l'ordre de ses dépendances, après une revue de sa fiche une fois ses dépendances closes |
| `shared-memory-admit` | séquentiel, sans outil, sans LLM | `/memory admit` | Écrit dans les entrées de la mémoire partagée les candidats que l'opérateur a confirmés, les listes, et réindexe |

### Les crews en détail

- **`agent-run`**, ce qu'il fait :
  - Il tourne sous l'étape du run de l'instance (un relecteur de `/dev-spec` sous les jeux de règles, les hooks et
    le budget de cette étape), sinon sous l'étape de la charte, avec le budget de cette étape et aucun enfant à lui.
- **`dev-implement`**, ce qu'il fait :
  - Une correction ajoutée en étape.
  - Le build et la suite (ensuite les projets touchés) en jobs.
  - Puis l'audit (le crew `dev-verify`) et, sur VALID, le commit et les marques « fait ».
  - Une hypothèse est consignée une fois par lot, jamais une que la fiche porte déjà.
  - Un chemin relatif qu'un rôle passe à un outil est résolu sous le checkout avant l'outil.
- **`dev-batches`**, processus :
  - Avec `--concurrency` de 2 à 4, un agent de lot par lot d'une vague (`batch-F<n>`, les outils d'implémentation et
    les outils de lecture de l'auditeur, `run_tests`, `run_build`, `run_validation`, `memory_recall`), chacun sous
    la racine de travail de son worktree.
- **`dev-batches`**, ce qu'il fait :
  - Consigne chaque lot dans `batches-state.md`.
  - En séquentiel, le `completed` de la commande enchaîne `/dev-batches`, chaque clôture commitée sans push.
  - En parallèle, le pilote amorce chaque worktree, lance à la fois les agents de lot de la vague (chacun exécute
    les étapes, l'audit en ligne et la clôture dans son code, borné par ses propres appels d'outils), puis fusionne
    en avance rapide chaque lot VALID dans l'ordre des ids, en rapatrie les fichiers et retire son worktree.
  - Un push et une pull request à la clôture du plan.
  - Une revue qui ne peut pas tourner (aucun relecteur sur le runtime, une réponse illisible deux fois, un appel refusé)
    arrête le lot avant son lancement, consigné `BLOCKED — review not run (<raison>)`, et l'exécution suivante le
    revoit (un arrêt pour des questions Blocking est tranché par l'humain et pas revu deux fois).
  - Chaque ligne Major de la revue termine les prompts RED et GREEN de ce lot en une ligne `stale: <question> —
    <preuve>`, à son premier lancement seulement.
  - Un verdict GAPS relance le lot de lui-même, dans son worktree en parallèle, ses lignes Blocking et Major pour
    correction (aucune pour un audit que le budget a arrêté, dont la reprise tourne alors), jusqu'à trois tours
    d'audit en GAPS depuis le dernier VALID, un audit arrêté par le budget compté pour un.
  - Le troisième encore GAPS revient à un humain.

Un dossier commençant par `_` contient une sonde de développement (`probe.ork.ts`), jamais l'équipe d'une commande :
`_probe-shared-memory` mesure le rappel de la mémoire partagée sur un jeu de référence, lancée par
`scripts/check-shared-memory.sh` avant une version.

## Où vit le texte

Le texte en langue naturelle de `src/` vit à part de la logique qui s'en sert
([ADR 0026](../adr/0026-text-isolation.md)), dans au plus trois fichiers de texte par dossier de couche, à côté des
modules qui les lisent :

| Fichier | Contient | Lu par |
| --- | --- | --- |
| `prompts.ts` | ce qu'un modèle lit : prompts système, instructions, descriptions d'outils | le module qui construit l'appel |
| `messages.ts` | ce que l'utilisateur lit : usage, refus, erreurs, lignes d'état et de rapport, indices | le module qui rend ou qui lève |
| `markers.ts` | ce qu'un rédacteur et un lecteur partagent : titres, mots de verdict, expressions régulières sur du texte | le rédacteur et le parseur |

- Un fichier de texte se range dans la couche de son lecteur (`domain/`, `application/`,
  `shared/infrastructure/orkeon/`, `commands/_lib/<group>/`) : un module du domaine ne lit que du texte de `domain/`.
  Le texte d'un `*.cmd.ts` va dans `commands/_lib/<group>/messages.ts`, celui d'un `crew.ork.ts` dans
  `crews/<crew>/application/messages.ts`.
- Un texte qui porte des valeurs est une fonction de ces valeurs, nommée d'après ce qu'il dit. Un fichier de texte de
  plus de 400 lignes environ peut devenir un dossier `prompts/<sujet>.ts`.
- Les fichiers de texte sont en TypeScript : le bundle ne charge aucune autre sorte de fichier.
- Ce qui reste en ligne : les identifiants, les clés de configuration, les chemins, les commandes shell, les flags,
  les clés d'un schéma JSON, les mots courts d'une énumération et le `description:` d'un `*.cmd.ts`. Les chartes
  (`*-charter.ts`, `built-in-charters.ts`), `design-rules.ts` et `reading-rule.ts` sont des fichiers de texte sous
  leur propre nom.
- Un fichier de texte ne tient que du texte : des constantes et des fonctions gabarits (des paramètres en entrée, du
  texte en sortie ; un ternaire, un retour anticipé, un `.map` ou un `.join` pour rendre une liste).
  - Une fonction `async`, `await`, une boucle, un `switch`, un `try`, une classe, un `let` ou un `var`, et une
    valeur importée d'un module qui n'est ni un fichier de texte ni un module du domaine sont de la logique : le
    budget d'un brief, une coupe, le choix de ce qui est porté vont dans un module de logique à côté du fichier de
    texte (`crews/main-loop/application/turn-context.ts` à côté de `prompts.ts`).
  - Un type s'importe de partout.
- `tests/repository/text-isolation.test.ts` vérifie les deux côtés en lisant `src/` une fois : il signale un littéral
  d'un fichier de logique qui compte trois mots ou plus, ou plus de 60 caractères avec une espace, et une construction
  de logique dans un fichier de texte ; chaque exception est nommée avec son fichier, son propriétaire et sa raison.
