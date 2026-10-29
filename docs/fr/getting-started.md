# Premiers pas

<p align="center">
  <img src="../assets/kama-surfer-docker.jpg" alt="Mascotte d'Orkeon Code — un caméléon qui surfe sur une vague" width="200">
</p>

Orkeon Code est un ensemble de commandes et de crews en TypeScript ; le REPL
d'[Orkeon](https://github.com/Orkeon/orkeon) (*Read–Eval–Print Loop* : la console interactive) les exécute.
Le lanceur `orkeon-code` (et `orkeon-code.ps1` sous Windows) trouve un runtime, monte votre projet et démarre le
REPL. Il lui faut trois choses : un runtime, un fichier de settings et une clé d'API.

## 1. Installer

**Depuis une release** (Linux, macOS, WSL) : `install.sh`, publié avec chaque
[release](https://github.com/Orkeon/orkeon-code/releases), télécharge l'archive de cette release, la vérifie avec son
`SHA256SUMS` et l'installe dans `~/.local/lib/orkeon-code/<version>`, la commande `orkeon-code` dans `~/.local/bin` ;
ni `sudo`, ni clone, ni `npm ci`.

```bash
v=0.1.0                                                          # the release to install
curl -fLO "https://github.com/Orkeon/orkeon-code/releases/download/v$v/install.sh"
bash install.sh                                                  # or: bash install.sh --prefix /opt/tools
orkeon-code --version
```

`install.sh --archive orkeon-code-<version>.tar.gz` installe une archive déjà téléchargée (vérifiée avec le
`SHA256SUMS` posé à côté, quand il y en a un). Relancé, il ne change rien ; une nouvelle release va dans son propre dossier et devient
`current`. `bash ~/.local/lib/orkeon-code/current/scripts/install.sh --uninstall` retire le programme et la commande,
jamais `~/.orkeon-code/`, où une installation garde ce qui est à vous : l'état et les sessions de chaque projet (`projects/`) et le dépôt de démo
(`demo/`) ; `ORKEON_CODE_HOME` désigne un autre dossier. Sous Windows, `install.ps1` fait de même dans
`%LOCALAPPDATA%\Programs\orkeon-code` et écrit `bin\orkeon-code.cmd`, que `cmd.exe` et PowerShell trouvent tous deux.

**Depuis npm** (Linux, macOS, Windows ; Node 22 ou plus récent) : le paquet porte les mêmes fichiers que l'archive de
la release, et esbuild avec eux.

```bash
npm install -g orkeon-code@next                                  # a prerelease; orkeon-code once 1.0 is out
orkeon-code --version
```

`npm update -g orkeon-code` et `npm uninstall -g orkeon-code` laissent eux aussi `~/.orkeon-code/` intact. En mode
Docker sous macOS, le programme doit se trouver dans un dossier que Docker Desktop partage avec ses conteneurs
(`/Users` par défaut) : un préfixe npm sous `/opt/homebrew` ou `/usr/local` n'en est pas un ; ajoutez-le dans
Settings > Resources > File sharing, ou utilisez `install.sh`.

`orkeon-code --version` affiche la version d'Orkeon Code, d'où il s'exécute (`install:` ou `clone:`), le commit
d'Orkeon attendu (l'épingle) et le runtime trouvé, sans rien démarrer.

**Depuis les sources**, pour modifier Orkeon Code ou suivre `main` :

```bash
git clone https://github.com/Orkeon/orkeon-code.git ~/orkeon-code
```

Si vous le souhaitez, mettez le lanceur dans votre `PATH` : `ln -s ~/orkeon-code/orkeon-code ~/.local/bin/orkeon-code`.
Un clone garde son état dans `.crew-output/` et sa démo dans `fixtures/`, et lit d'abord `config/appsettings.local.json`.

## 2. Settings et clé

```bash
cd ~/orkeon-code
cp config/appsettings.example.json config/appsettings.local.json
export DEEPSEEK_API_KEY=...
```

L'exemple vise DeepSeek ; tout point d'accès compatible OpenAI, ou un autre fournisseur pris en charge par Orkeon
(Anthropic compris), fonctionne en changeant `Llm:BaseUrl`, `Llm:Model` et `Llm:ApiKeyEnvVar`
([Configuration](configuration.md)). Une installation lit `~/.orkeon-code/appsettings.json` : `orkeon-code setup` l'écrit, ou copiez-y l'exemple de
`~/.local/lib/orkeon-code/current/config/` ([d'où viennent les settings](configuration.md#doù-viennent-les-settings)).
Le lanceur prend aussi `--settings FILE`. Un modèle sur cette machine à la place, sans clé : `config/appsettings.ollama.example.json`, sur
Ollama ([Configuration](configuration.md#le-llm)).

## 3. Choisir un runtime

**Windows** : `orkeon-code.ps1` n'a ni mode source ni `--demo` (`-Mode` n'accepte que `docker` ou `tool`) : le mode
tool sur le `orkeon-<version>-win-x64.zip` de la release est celui de Windows ; la voie que ce projet pratique est WSL
avec le lanceur bash ([tutoriel WSL](wsl-tutorial.md)).

Orkeon Code est vérifié contre les sources d'Orkeon au commit de `.orkeon-version` (`e44df3f`, le `main` après
Orkeon/orkeon#244, 2026-10-30) : le [mode source](#mode-source--un-checkout-dorkeon) exécute ce commit, le runtime de
référence ; le [mode tool](#mode-tool--orkeon-repl-installé) (le paquet Debian sur le canal apt `rc`, les archives de
release) exécute la dernière release, `1.0.0-rc.6`, et le [mode docker](#mode-docker--rien-à-installer-sauf-docker)
la dernière image `orkeon-runners` publiée, `1.0.0-rc.5` à ce jour (aucune image `1.0.0-rc.6` n'est publiée), tous
deux en retard sur l'épingle, et `/status` le dit ([ADR 0013](../adr/0013-pin-on-orkeon-commit.md)). La release porte ce que les ADR 0004 à 0009 ont repris du `main` d'Orkeon : l'état de la garde de l'hôte
(`/permissions`), les outils intégrés typés et les limites de résultat par outil
([ADR 0004](../adr/0004-orkeon-after-180.md)), les outils de fichiers qui résolvent un chemin relatif sous
`/workspace` ou la racine de l'agent, et les approbations en attente qu'une commande lit (`/tasks`)
([ADR 0005](../adr/0005-orkeon-after-206.md)), le REPL qui démarre sur un terminal, les outils structurels avec leur
schéma de paramètres et les réponses diffusées d'acts concurrents gardées ligne par ligne
([ADR 0006](../adr/0006-orkeon-after-213.md)), les écrans de fil, la clôture du budget et l'accès par appel
([ADR 0007](../adr/0007-orkeon-after-217.md)), les classes d'accès des outils
([ADR 0008](../adr/0008-orkeon-after-223.md)), le contexte compté une fois, les services runtime, usage et session et
le drapeau streamed ([ADR 0009](../adr/0009-orkeon-after-230.md)). Les typings sont ceux de l'épingle
([Développement](development.md#typings)).

Le lanceur prend le premier mode disponible, dans cet ordre, sauf si `--mode` en décide autrement.

### Mode tool : `orkeon-repl` installé

Le REPL est `orkeon-repl` (`Orkeon.ConsoleApp`) de la dernière release, jamais l'épingle. Le paquet Debian et les
archives de release le livrent autonome, avec son propre esbuild : aucun .NET à installer.

**Debian et Ubuntu** (amd64, arm64) : le paquet `orkeon` installe `/usr/bin/orkeon-repl`. Ajoutez la source apt
d'Orkeon une fois, comme le décrit [Install with apt](https://github.com/Orkeon/orkeon/blob/main/docs/guides/install-with-apt.md),
puis `sudo apt install orkeon`. Une version candidate telle que `1.0.0-rc.6` est publiée sur le canal `rc`
(`Suites: raw/apt/rc/`), pas sur `stable`.

**Autres systèmes** : l'**archive complète** de la [release d'Orkeon](https://github.com/Orkeon/orkeon/releases) pour
votre plateforme : `orkeon-<version>-linux-x64.tar.gz`, `-linux-arm64`, `-osx-x64`, `-osx-arm64`, ou, sous Windows,
`orkeon-<version>-win-x64.zip` (la seule archive Windows qui porte `orkeon-repl` : le `.msi` est la CLI `orkeon` et
Orkeon Studio, sans `orkeon-repl` ni `install.ps1`). Vérifiez-la avec le `SHA256SUMS` de la release, extrayez-la et
lancez `./install.sh` (`install.ps1` sous Windows) : il installe dans `~/.local/lib/orkeon` et lie `orkeon-repl` dans
`~/.local/bin`, sans `sudo`.

```bash
v=1.0.0-rc.6; rid=linux-x64       # the last release; or linux-arm64, osx-x64, osx-arm64
curl -fLO "https://github.com/Orkeon/orkeon/releases/download/v$v/orkeon-$v-$rid.tar.gz"
curl -fLO "https://github.com/Orkeon/orkeon/releases/download/v$v/SHA256SUMS"
sha256sum --check --ignore-missing SHA256SUMS
tar -xzf "orkeon-$v-$rid.tar.gz" && (cd "orkeon-$v-$rid" && ./install.sh)
```

Les archives `orkeon-cli-*` et le `.msi` (somme de contrôle dans `SHA256SUMS.msi`) ne portent que la CLI `orkeon`, pas
`orkeon-repl`.

Alternatives : l'outil .NET `Orkeon.ConsoleApp` depuis GitHub Packages (un token GitHub avec `read:packages` est
requis bien que le paquet soit public), ou `ORKEON_REPL` positionnée sur n'importe quelle ligne de commande qui
démarre le REPL. Aucun des deux ne livre esbuild : lancez `npm ci` une fois dans le checkout et le lanceur utilise
celui que npm a installé (`ORKEON_ESBUILD_PATH` le remplace).

### Mode docker : rien à installer sauf Docker

Le lanceur exécute `ghcr.io/orkeon/orkeon-runners:latest`, la dernière image publiée (`1.0.0-rc.5` à ce jour :
l'image `1.0.0-rc.6` n'est pas publiée), jamais l'épingle (`ORKEON_CODE_IMAGE` nomme une autre image), qui porte le
REPL et esbuild ; l'image est construite pour `linux/amd64` et `linux/arm64`, et Docker tire celle de votre machine. Le projet est monté dans le
conteneur ; sous Linux, le conteneur tourne avec votre uid, si bien que les fichiers que l'agent écrit vous
appartiennent. L'outil shell tourne dans le conteneur.

### Mode source : un checkout d'Orkeon

`ORKEON_SOURCE=~/src/orkeon ./orkeon-code --mode source` construit `src/apps/Orkeon.ConsoleApp` dans ce checkout
(`dotnet build --no-restore`, sous le `global.json` du checkout), puis exécute la
`bin/Debug/net10.0/Orkeon.ConsoleApp.dll` construite, depuis votre projet, avec `dotnet <dll>`, qui ne lit aucun
`global.json` : un projet dont le `global.json` épingle un autre SDK fonctionne quand même. Il faut le SDK .NET 10, la
solution Orkeon restaurée une fois (`dotnet restore Orkeon.sln` dans le checkout), et esbuild : `npm ci` une fois dans
ce checkout, ou `ORKEON_ESBUILD_PATH`.

Le checkout devrait être au commit de `.orkeon-version` (`git -C ~/src/orkeon checkout $(cat .orkeon-version)`),
celui contre lequel les commandes ont été vérifiées : à un autre commit, le lanceur avertit (`orkeon-code: warning:
ORKEON_SOURCE is at <sha7>, the pin of .orkeon-version is e44df3f: the commands were checked against the pin.`) et
lance quand même.

## 4. Première session

```bash
orkeon-code --demo                   # a throwaway sample repository (fixtures/ in a clone, ~/.orkeon-code/demo once installed)
cd ~/src/my-project && orkeon-code   # the current directory is the project
orkeon-code --workspace ~/src/other  # or name it
```

Le premier démarrage dans un dossier demande si vous lui faites confiance ([Dossiers de confiance](permissions.md#dossiers-de-confiance)).
La bannière affiche le projet, les settings et le mode. Dans le REPL :

| Essayez | Ce qui se passe |
|---|---|
| `/doctor` | Montre la version, vérifie la configuration du LLM, les outils, les montages et ce qu'a réglé le fichier du projet |
| `/init` | Analyse le projet et écrit `AGENTS.md`, les instructions que l'agent lit à chaque tour (un `CLAUDE.md` existant y est fusionné, et reste lu quand il n'y a pas d'`AGENTS.md`) |
| `plan: où sont définies les routes HTTP ?` | Une question en lecture seule |
| `renomme parseArgs en parseCliArgs` | En mode `default`, le REPL demande avant chaque modification : `[y] once / [s] session / [n] no` |
| `/mode acceptEdits` puis `ajoute un test pour parseCliArgs` | Les modifications passent sans demander pour la session ; une commande demande toujours |
| `/diff`, `/commit`, `/review` | Les flux de travail git sur le projet |
| `/context`, `/compact`, `/usage` | La fenêtre de contexte et la session |
| `/exit` | Quitter |

Le texte saisi sans `/` initial est envoyé à `/assistant`. La liste complète : [Commandes](commands.md).

Sur un terminal, le REPL est une TUI en deux volets : la transcription, l'invite, et dessous la liste des tâches (`↓`
ou `F4`) qui nomme les commandes en arrière-plan (`/dev-batches`, un `/assistant` lancé en async).
Chaque fil de conversation a son écran : sélectionner la ligne d'une tâche montre ses lignes, sélectionner `main`
celles de l'invite, où restent les lignes de lancement et de fin de chaque tâche ; la tâche sélectionnée est aussi la
destinataire du prochain message. Une tâche finie garde sa ligne, avec `✔ finished`, `✗ failed` ou `⊘ cancelled` et sa
durée, et son écran reste lisible jusqu'à ce que l'hôte l'oublie (Orkeon #217). `orkeon-code -- --ui plain` écrit un
seul flux à la place, les lignes d'une tâche préfixées de son ticket (`[t1] `).

## 5. Optionnel : la transcription de la parole

Pour confier à l'assistant une note vocale, une réunion enregistrée ou un enregistrement d'écran commenté à la
voix, en mode tool ou source :

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh                # uv, once
mkdir -p ~/audio                                                # the folder of your audio and video files
WHISPER_MODEL=small bash scripts/whisper-mcp-smoke.sh --tts    # resolves the server's environment, Piper included, downloads the model, checks a 5 s sample
export ORKEON_CODE_AUDIO_DIR=~/audio
./orkeon-code --mode tool --workspace ~/src/my-project          # or --mode source; the banner shows an "audio" line
```

puis, dans le REPL : `/transcribe --list`, puis `/transcribe daily.m4a --then "list the tasks I mention"`. Avec
`ORKEON_CODE_VOICE=1` exportée aussi, `/voice` dicte une requête et `/say` lit la dernière réponse à voix haute.
Détails, modèles, backends et comment le modèle appelle les outils lui-même :
[Configuration](configuration.md#transcription-de-la-parole).

## Ce que l'agent écrit dans votre projet

Outre les changements que vous demandez : `AGENTS.md` (`/init`), `.orkeon/config.json` (`/config`),
`.orkeon/agents.json` (`/agents`) et `.git/ORKEON_COMMITMSG` (`/commit` y écrit le message pour `git commit -F` ;
git ne le suit pas ; dans un worktree lié, dont le `.git` est un fichier, le message va dans
`.orkeon/ORKEON_COMMITMSG`, supprimé après le commit). Le workflow dev ajoute `.orkeon/dev/` (les fichiers d'état et les journaux de chaque travail),
le dossier de travail (`workbench/` par défaut, `dev.workDir` : specs, plans, fiches de lot, verdicts),
`.orkeon/worktrees/` (les worktrees des lots), `.orkeon/dev-learn-state.json` (`/dev-learn`) et le dossier de la
[mémoire partagée](shared-memory.md) (`.orkeon/memory/` sauf si `memory.dir` en nomme un autre) ; les scripts de hook
que vous écrivez (`.orkeon/hooks/` dans les [exemples](hooks.md)) sont les vôtres. Ajoutez `.orkeon/` et `workbench/`
au `.gitignore` du projet si vous ne voulez pas les partager : `/dev-status` avertit tant qu'ils ne sont pas ignorés.
Une mémoire partagée destinée à l'équipe va dans un dossier suivi (`memory.dir`, `docs/memory` par exemple). Les
transcriptions vont dans le dossier d'état (`.crew-output/transcripts` dans un clone, `~/.orkeon-code/projects/<projet>/transcripts` une fois installé), jamais dans le projet. La
conversation y est gardée aussi après chaque tour et quand le REPL finit ([Sessions](configuration.md#sessions) : `--continue` la ramène) ;
le mode de session (`/mode`) et les règles de permission sont gardés en mémoire et finissent avec le REPL.

## Dépannage

- **Toutes les réponses sont vides** : le fichier de settings n'a pas de section `Llm`, ou aucune clé n'atteint le
  runtime. Le lanceur avertit des deux au démarrage.
- **Le tour attend sur `approve <tool>? [y] once / [s] session / [n] no`** : le mode vous interroge sur cet appel ;
  répondez sur la ligne suivante. `acceptEdits:` ou `/mode acceptEdits` arrête les questions sur les modifications,
  et une règle d'autorisation celles sur les appels qu'elle couvre ([Permissions](permissions.md)). La question
  d'une commande en arrière-plan se lit `approve <tool> for [t1]? …`, s'affiche dans la ligne de statut, sur la
  ligne de la tâche et, dans la TUI, sur l'écran montré quelle que soit la tâche qui la pose, et se répond aussi
  depuis l'invite principale.
- **Toutes les commandes shell échouent avec une erreur de confinement** : `Orkeon:Tools:Shell:Confinement:Mode`
  vaut `Auto` (le défaut quand les settings omettent la clé) ou `Bubblewrap`, et la commande ne peut pas être confinée
  (`bwrap` absent ou incapable de créer ses espaces de noms). Installez bubblewrap, ou mettez le mode à `None` comme
  les exemples ([SECURITY.md](../../SECURITY.md)).
- **Pas de ligne `audio` dans la bannière, ou `no registered tool 'transcribe_audio'`** : le lanceur dit pourquoi au
  démarrage (uv absent, un serveur `whisper` dans le fichier de settings, mode docker). Un serveur qui ne peut pas
  démarrer coûte une ligne `fail:` qui le nomme ; `bash scripts/whisper-mcp-smoke.sh` le lance seul
  ([mcp/whisper/README.md](../../mcp/whisper/README.md#troubleshooting)).
  `MCP server 'whisper' could not be connected: no answer within 30 s` veut dire que le script smoke ci-dessus a
  été sauté : le premier `uv run` résout l'environnement du serveur en quelques minutes, et le REPL attend 30 s.
- **Une commande manque** : le chargeur garde au plus `Orkeon:Cli:ScriptCommands:MaxScripts` commandes (200 par
  défaut). `bash scripts/smoke-runtime.sh` vérifie que chaque commande se charge.
- **Le REPL refuse un montage et quitte au démarrage** : il refuse un montage sur `/sandbox`, `/credentials`,
  `/cli-commands...` ou `/crews...`, et une racine montée deux fois. Le lanceur monte `/workspace`, `/output`, `/tmp`,
  `/user-config`, `/sessions` et `/session-history`, plus `/audio` et `/transcripts` quand la transcription est
  active, et démarre le REPL depuis le projet avec `ORKEON_ALLOW_EXTERNAL_MOUNTS=1` : vérifiez les arguments
  `--mount` passés après `--` et les `Orkeon:FileSystem:Mounts` du fichier de settings.
